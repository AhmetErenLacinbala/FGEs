import { mat4, vec3 } from "gl-matrix";
import standardShader from "../shaders/standard.wgsl?raw";
import billboardShader from "../shaders/billboard.wgsl?raw";
import pickingShader from "../shaders/picking.wgsl?raw";
import type { RenderData } from "./Scene";
import { STANDARD_BUFFER_LAYOUT } from "./MeshData";
import { RenderType } from "./RenderableObject";
import type InstancedMesh from "./InstancedMesh";

export interface RendererOptions {
    clearColor?: GPUColor;
    format?: GPUTextureFormat;
    fieldOfViewRadians?: number;
    nearPlane?: number;
    farPlane?: number;
    maxObjects?: number;
}

export interface RenderPipelineRegistration {
    renderType: string;
    renderPipeline: GPURenderPipeline;
    pickingPipeline?: GPURenderPipeline;
}

const PICKING_BYTES_PER_ROW = 256;

/**
 * General-purpose WebGPU renderer.
 *
 * FGEs provides textured-mesh and billboard pipelines. Applications can add
 * domain-specific pipelines with registerRenderPipeline(). Custom pipelines
 * use the shared frame bind group at group 0 and own their material layout at
 * group 1.
 */
export default class Renderer {
    readonly canvas: HTMLCanvasElement;

    protected adapter!: GPUAdapter | null;
    protected device!: GPUDevice;
    protected context!: GPUCanvasContext;
    protected format!: GPUTextureFormat;

    protected frameGroupLayout!: GPUBindGroupLayout;
    protected materialGroupLayout!: GPUBindGroupLayout;
    protected frameBindGroup!: GPUBindGroup;

    protected uniformBuffer!: GPUBuffer;
    protected objectBuffer!: GPUBuffer;

    protected depthStencilState!: GPUDepthStencilState;
    protected depthStencilBuffer!: GPUTexture;
    protected depthStencilAttachment!: GPURenderPassDepthStencilAttachment;

    protected pickingTexture!: GPUTexture;
    protected pickingDepthTexture!: GPUTexture;
    protected pickingReadBuffer!: GPUBuffer;

    private readonly options: Required<RendererOptions>;
    private readonly renderPipelines = new Map<string, GPURenderPipeline>();
    private readonly pickingPipelines = new Map<string, GPURenderPipeline>();
    private readonly instancedBindGroups = new WeakMap<InstancedMesh, GPUBindGroup>();

    constructor(canvas: HTMLCanvasElement, options: RendererOptions = {}) {
        this.canvas = canvas;
        this.options = {
            clearColor: options.clearColor ?? { r: 0.1, g: 0.1, b: 0.15, a: 1 },
            format: options.format ?? "bgra8unorm",
            fieldOfViewRadians: options.fieldOfViewRadians ?? Math.PI / 4,
            nearPlane: options.nearPlane ?? 0.1,
            farPlane: options.farPlane ?? 100,
            maxObjects: options.maxObjects ?? 1024,
        };
    }

    async init(): Promise<void> {
        await this.setupDevice();
        this.setupBindGroupLayouts();
        this.setupBuffers();
        this.setupDepthBuffer();
        this.setupBuiltInPipelines();
        this.setupFrameBindGroup();
        this.setupPicking();
    }

    registerRenderPipeline(registration: RenderPipelineRegistration): void {
        if (!registration.renderType) {
            throw new Error("Renderer: renderType must be a non-empty string");
        }
        this.renderPipelines.set(registration.renderType, registration.renderPipeline);
        if (registration.pickingPipeline) {
            this.pickingPipelines.set(registration.renderType, registration.pickingPipeline);
        }
    }

    unregisterRenderPipeline(renderType: string): void {
        if (renderType === RenderType.Standard || renderType === RenderType.Billboard) {
            throw new Error(`Renderer: cannot unregister built-in pipeline "${renderType}"`);
        }
        this.renderPipelines.delete(renderType);
        this.pickingPipelines.delete(renderType);
    }

    hasRenderPipeline(renderType: string): boolean {
        return this.renderPipelines.has(renderType);
    }

    render(renderData: RenderData): void {
        if (!this.device || this.renderPipelines.size === 0) {
            throw new Error("Renderer: init() must complete before render()");
        }

        this.uploadFrameData(renderData);
        const commandEncoder = this.device.createCommandEncoder();
        const renderPass = commandEncoder.beginRenderPass({
            colorAttachments: [{
                view: this.context.getCurrentTexture().createView(),
                clearValue: this.options.clearColor,
                loadOp: "clear",
                storeOp: "store",
            }],
            depthStencilAttachment: this.depthStencilAttachment,
        });

        renderPass.setBindGroup(0, this.frameBindGroup);
        for (let index = 0; index < renderData.objects.length; index++) {
            const object = renderData.objects[index];
            const pipeline = this.renderPipelines.get(object.renderType);
            if (!pipeline) {
                console.warn(`Renderer: no pipeline registered for "${object.renderType}"`);
                continue;
            }

            renderPass.setPipeline(pipeline);
            renderPass.setBindGroup(1, object.material);
            object.bind(renderPass);
            object.draw(renderPass, index);
        }

        for (const mesh of renderData.instancedMeshes) {
            if (mesh.getInstanceCount() === 0) continue;

            const pipeline = this.renderPipelines.get(mesh.renderType);
            if (!pipeline) {
                console.warn(`Renderer: no pipeline registered for "${mesh.renderType}"`);
                continue;
            }

            renderPass.setPipeline(pipeline);
            renderPass.setBindGroup(0, this.getInstancedBindGroup(mesh));
            mesh.drawAll(renderPass);
        }

        renderPass.end();
        this.device.queue.submit([commandEncoder.finish()]);
    }

    renderPickingPass(renderData: RenderData): void {
        this.uploadFrameData(renderData);
        const commandEncoder = this.device.createCommandEncoder();
        const renderPass = commandEncoder.beginRenderPass({
            colorAttachments: [{
                view: this.pickingTexture.createView(),
                clearValue: { r: -9999, g: -9999, b: -9999, a: 0 },
                loadOp: "clear",
                storeOp: "store",
            }],
            depthStencilAttachment: {
                view: this.pickingDepthTexture.createView(),
                depthClearValue: 1,
                depthLoadOp: "clear",
                depthStoreOp: "store",
            },
        });

        renderPass.setBindGroup(0, this.frameBindGroup);
        for (let index = 0; index < renderData.objects.length; index++) {
            const object = renderData.objects[index];
            const pipeline = this.pickingPipelines.get(object.renderType);
            if (!pipeline) continue;

            renderPass.setPipeline(pipeline);
            object.bind(renderPass);
            object.draw(renderPass, index);
        }

        renderPass.end();
        this.device.queue.submit([commandEncoder.finish()]);
    }

    async readWorldPosition(screenX: number, screenY: number): Promise<vec3 | null> {
        const x = Math.floor(screenX);
        const y = Math.floor(screenY);
        if (x < 0 || x >= this.canvas.width || y < 0 || y >= this.canvas.height) {
            return null;
        }

        const commandEncoder = this.device.createCommandEncoder();
        commandEncoder.copyTextureToBuffer(
            { texture: this.pickingTexture, origin: { x, y, z: 0 } },
            { buffer: this.pickingReadBuffer, bytesPerRow: PICKING_BYTES_PER_ROW },
            { width: 1, height: 1 },
        );
        this.device.queue.submit([commandEncoder.finish()]);

        await this.pickingReadBuffer.mapAsync(GPUMapMode.READ);
        const data = new Float32Array(this.pickingReadBuffer.getMappedRange().slice(0, 16));
        this.pickingReadBuffer.unmap();
        return data[0] < -9000 ? null : vec3.fromValues(data[0], data[1], data[2]);
    }

    resize(): void {
        this.depthStencilBuffer.destroy();
        this.pickingTexture?.destroy();
        this.pickingDepthTexture?.destroy();
        this.setupDepthBuffer();
        this.setupPickingTextures();
    }

    getDevice(): GPUDevice {
        return this.device;
    }

    getMaterialGroupLayout(): GPUBindGroupLayout {
        return this.materialGroupLayout;
    }

    getFrameGroupLayout(): GPUBindGroupLayout {
        return this.frameGroupLayout;
    }

    getDepthStencilState(): GPUDepthStencilState {
        return { ...this.depthStencilState };
    }

    getPresentationFormat(): GPUTextureFormat {
        return this.format;
    }

    destroy(): void {
        this.uniformBuffer.destroy();
        this.objectBuffer.destroy();
        this.depthStencilBuffer.destroy();
        this.pickingTexture.destroy();
        this.pickingDepthTexture.destroy();
        this.pickingReadBuffer.destroy();
    }

    private async setupDevice(): Promise<void> {
        this.adapter = await navigator.gpu?.requestAdapter();
        if (!this.adapter) {
            throw new Error("WebGPU is not supported on this device");
        }

        this.device = await this.adapter.requestDevice();
        const context = this.canvas.getContext("webgpu");
        if (!context) {
            throw new Error("Renderer: could not create a WebGPU canvas context");
        }

        this.context = context;
        this.format = this.options.format;
        this.context.configure({ device: this.device, format: this.format, alphaMode: "opaque" });
    }

    private setupBindGroupLayouts(): void {
        this.frameGroupLayout = this.device.createBindGroupLayout({
            label: "FGEs frame bind group layout",
            entries: [
                { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: {} },
                {
                    binding: 1,
                    visibility: GPUShaderStage.VERTEX,
                    buffer: { type: "read-only-storage", hasDynamicOffset: false },
                },
            ],
        });

        this.materialGroupLayout = this.device.createBindGroupLayout({
            label: "FGEs textured material bind group layout",
            entries: [
                { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: {} },
                { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
            ],
        });
    }

    private setupBuffers(): void {
        this.uniformBuffer = this.device.createBuffer({
            label: "FGEs frame uniforms",
            size: 64 * 2,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        this.objectBuffer = this.device.createBuffer({
            label: "FGEs object transforms",
            size: 64 * this.options.maxObjects,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
    }

    private setupDepthBuffer(): void {
        this.depthStencilState = {
            format: "depth24plus-stencil8",
            depthWriteEnabled: true,
            depthCompare: "less-equal",
        };
        this.depthStencilBuffer = this.device.createTexture({
            label: "FGEs depth/stencil texture",
            size: [this.canvas.width, this.canvas.height],
            format: "depth24plus-stencil8",
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });
        this.depthStencilAttachment = {
            view: this.depthStencilBuffer.createView(),
            depthClearValue: 1,
            depthLoadOp: "clear",
            depthStoreOp: "store",
            stencilLoadOp: "clear",
            stencilStoreOp: "discard",
        };
    }

    private setupBuiltInPipelines(): void {
        const layout = this.device.createPipelineLayout({
            bindGroupLayouts: [this.frameGroupLayout, this.materialGroupLayout],
        });
        const standardModule = this.device.createShaderModule({ code: standardShader });
        const billboardModule = this.device.createShaderModule({ code: billboardShader });

        this.renderPipelines.set(RenderType.Standard, this.device.createRenderPipeline({
            label: "FGEs standard pipeline",
            layout,
            vertex: { module: standardModule, entryPoint: "vs_main", buffers: [STANDARD_BUFFER_LAYOUT] },
            fragment: { module: standardModule, entryPoint: "fs_main", targets: [{ format: this.format }] },
            primitive: { topology: "triangle-list" },
            depthStencil: this.depthStencilState,
        }));

        this.renderPipelines.set(RenderType.Billboard, this.device.createRenderPipeline({
            label: "FGEs billboard pipeline",
            layout,
            vertex: { module: billboardModule, entryPoint: "vs_main", buffers: [STANDARD_BUFFER_LAYOUT] },
            fragment: { module: billboardModule, entryPoint: "fs_main", targets: [{ format: this.format }] },
            primitive: { topology: "triangle-list" },
            depthStencil: {
                format: "depth24plus-stencil8",
                depthWriteEnabled: false,
                depthCompare: "always",
            },
        }));
    }

    private setupFrameBindGroup(): void {
        this.frameBindGroup = this.device.createBindGroup({
            layout: this.frameGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: this.uniformBuffer } },
                { binding: 1, resource: { buffer: this.objectBuffer } },
            ],
        });
    }

    private setupPicking(): void {
        this.setupPickingTextures();
        const layout = this.device.createPipelineLayout({ bindGroupLayouts: [this.frameGroupLayout] });
        const module = this.device.createShaderModule({ code: pickingShader });
        const pipeline = this.device.createRenderPipeline({
            label: "FGEs picking pipeline",
            layout,
            vertex: { module, entryPoint: "vs_main", buffers: [STANDARD_BUFFER_LAYOUT] },
            fragment: { module, entryPoint: "fs_main", targets: [{ format: "rgba32float" }] },
            primitive: { topology: "triangle-list" },
            depthStencil: { format: "depth24plus", depthWriteEnabled: true, depthCompare: "less-equal" },
        });

        this.pickingPipelines.set(RenderType.Standard, pipeline);
        this.pickingPipelines.set(RenderType.Billboard, pipeline);
        this.pickingReadBuffer = this.device.createBuffer({
            label: "FGEs picking readback buffer",
            size: PICKING_BYTES_PER_ROW,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        });
    }

    private setupPickingTextures(): void {
        this.pickingTexture = this.device.createTexture({
            label: "FGEs picking texture",
            size: [this.canvas.width, this.canvas.height],
            format: "rgba32float",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
        });
        this.pickingDepthTexture = this.device.createTexture({
            label: "FGEs picking depth texture",
            size: [this.canvas.width, this.canvas.height],
            format: "depth24plus",
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });
    }

    private uploadFrameData(renderData: RenderData): void {
        if (renderData.objects.length > this.options.maxObjects) {
            throw new Error(
                `Renderer: ${renderData.objects.length} objects exceed maxObjects (${this.options.maxObjects})`,
            );
        }

        const projection = mat4.create();
        mat4.perspective(
            projection,
            this.options.fieldOfViewRadians,
            this.canvas.width / this.canvas.height,
            this.options.nearPlane,
            this.options.farPlane,
        );
        this.device.queue.writeBuffer(this.uniformBuffer, 0, new Float32Array(renderData.viewTransform));
        this.device.queue.writeBuffer(this.uniformBuffer, 64, new Float32Array(projection));

        if (renderData.objects.length === 0) return;
        const modelData = new Float32Array(renderData.objects.length * 16);
        renderData.objects.forEach((object, index) => {
            modelData.set(object.getModelMatrix(), index * 16);
        });
        this.device.queue.writeBuffer(this.objectBuffer, 0, modelData);
    }

    private getInstancedBindGroup(mesh: InstancedMesh): GPUBindGroup {
        let bindGroup = this.instancedBindGroups.get(mesh);
        if (!bindGroup) {
            bindGroup = this.device.createBindGroup({
                layout: this.frameGroupLayout,
                entries: [
                    { binding: 0, resource: { buffer: this.uniformBuffer } },
                    { binding: 1, resource: { buffer: mesh.getInstanceBuffer() } },
                ],
            });
            this.instancedBindGroups.set(mesh, bindGroup);
        }
        return bindGroup;
    }
}
