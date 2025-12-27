import { mat4, vec3 } from "gl-matrix";
import shader from "../view/shaders.wgsl?raw";
import billboardShader from "../view/billboard.wgsl?raw";
import terrainShader from "../view/terrainShader.wgsl?raw";
import pickingShader from "../view/pickingShader.wgsl?raw";
import { RenderData } from "./Scene";
import { STANDARD_BUFFER_LAYOUT } from "./MeshData";
import { RenderType } from "./RenderableObject";
import InstancedMesh from "./InstancedMesh";

/**
 * Renderer -  WebGPU renderer
 * 
 * Uses a generic render loop that works with any RenderableObject.
 * No need to modify when adding new object types.
 */
export default class Renderer {
    canvas: HTMLCanvasElement;

    // WebGPU core
    adapter!: GPUAdapter | null;
    device!: GPUDevice;
    context!: GPUCanvasContext;
    format!: GPUTextureFormat;

    // Pipeline
    pipeline!: GPURenderPipeline;
    billboardPipeline!: GPURenderPipeline;
    terrainPipeline!: GPURenderPipeline;
    frameGroupLayout!: GPUBindGroupLayout;
    materialGroupLayout!: GPUBindGroupLayout;
    terrainMaterialGroupLayout!: GPUBindGroupLayout;
    frameBindGroup!: GPUBindGroup;

    // Blend settings (shared by all terrain objects)
    blendSettingsBuffer!: GPUBuffer;
    private _satelliteOpacity: number = 0.1;

    // Buffers
    uniformBuffer!: GPUBuffer;
    objectBuffer!: GPUBuffer;

    // Depth
    depthStencilState!: GPUDepthStencilState;
    depthStencilBuffer!: GPUTexture;
    depthStencilView!: GPUTextureView;
    depthStencilAttachment!: GPURenderPassDepthStencilAttachment;

    // Picking
    pickingPipeline!: GPURenderPipeline;
    pickingTexture!: GPUTexture;
    pickingDepthTexture!: GPUTexture;
    pickingReadBuffer!: GPUBuffer;

    // Instanced mesh bind group cache
    private instancedBindGroups: WeakMap<InstancedMesh, GPUBindGroup> = new WeakMap();

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
    }

    async init(): Promise<void> {
        await this.setupDevice();
        this.setupBindGroupLayouts();
        this.setupBuffers();
        this.setupDepthBuffer();
        this.setupPipeline();
        this.setupBindGroup();
        this.setupPicking();
    }

    private async setupDevice(): Promise<void> {
        this.adapter = await navigator.gpu?.requestAdapter();

        if (!this.adapter) {
            throw new Error("WebGPU is not supported on this device!");
        }

        this.device = await this.adapter.requestDevice();

        this.context = this.canvas.getContext('webgpu') as GPUCanvasContext;
        this.format = 'bgra8unorm';
        this.context.configure({
            device: this.device,
            format: this.format,
            alphaMode: 'opaque'
        });
    }

    private setupBindGroupLayouts(): void {
        // Frame data: view/projection matrices + model transforms
        this.frameGroupLayout = this.device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX,
                    buffer: {} // Uniform buffer for view/projection
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.VERTEX,
                    buffer: {
                        type: "read-only-storage",
                        hasDynamicOffset: false
                    }
                }
            ]
        });

        // Material: texture + sampler
        this.materialGroupLayout = this.device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {}
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    sampler: {}
                }
            ]
        });

        // Terrain material: dual textures + blend uniform
        this.terrainMaterialGroupLayout = this.device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {} // GHI texture
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    sampler: {} // GHI sampler
                },
                {
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: {} // Satellite texture
                },
                {
                    binding: 3,
                    visibility: GPUShaderStage.FRAGMENT,
                    sampler: {} // Satellite sampler
                },
                {
                    binding: 4,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: {} // Blend settings uniform
                }
            ]
        });
    }

    private setupBuffers(): void {
        // Uniform buffer for view + projection matrices
        this.uniformBuffer = this.device.createBuffer({
            size: 64 * 2, // 2 mat4s
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        // Storage buffer for object model matrices
        this.objectBuffer = this.device.createBuffer({
            size: 64 * 1024, // 1024 objects max
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        });

        // Blend settings buffer (16 bytes for alignment)
        this.blendSettingsBuffer = this.device.createBuffer({
            size: 16,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        // Initialize blend settings
        this.updateBlendSettings(this._satelliteOpacity);
    }

    private setupDepthBuffer(): void {
        this.depthStencilState = {
            format: "depth24plus-stencil8",
            depthWriteEnabled: true,
            depthCompare: "less-equal"
        };

        this.depthStencilBuffer = this.device.createTexture({
            size: {
                width: this.canvas.width,
                height: this.canvas.height,
                depthOrArrayLayers: 1
            },
            format: "depth24plus-stencil8",
            usage: GPUTextureUsage.RENDER_ATTACHMENT
        });

        this.depthStencilView = this.depthStencilBuffer.createView({
            format: "depth24plus-stencil8",
            dimension: "2d",
            aspect: "all"
        });

        this.depthStencilAttachment = {
            view: this.depthStencilView,
            depthClearValue: 1.0,
            depthLoadOp: "clear",
            depthStoreOp: "store",
            stencilLoadOp: "clear",
            stencilStoreOp: "discard"
        };
    }


    private setupPipeline(): void {
        // Standard pipeline
        const pipelineLayout = this.device.createPipelineLayout({
            bindGroupLayouts: [this.frameGroupLayout, this.materialGroupLayout]
        });

        this.pipeline = this.device.createRenderPipeline({
            layout: pipelineLayout,
            vertex: {
                module: this.device.createShaderModule({ code: shader }),
                entryPoint: "vs_main",
                buffers: [STANDARD_BUFFER_LAYOUT]
            },
            fragment: {
                module: this.device.createShaderModule({ code: shader }),
                entryPoint: "fs_main",
                targets: [{ format: this.format }]
            },
            primitive: {
                topology: 'triangle-list'
            },
            depthStencil: this.depthStencilState
        });

        const billboardPipelineLayout = this.device.createPipelineLayout({
            bindGroupLayouts: [this.frameGroupLayout, this.materialGroupLayout]
        });

        this.billboardPipeline = this.device.createRenderPipeline({
            layout: billboardPipelineLayout,
            vertex: {
                module: this.device.createShaderModule({ code: billboardShader }),
                entryPoint: "vs_main",
                buffers: [STANDARD_BUFFER_LAYOUT]
            },
            fragment: {
                module: this.device.createShaderModule({ code: billboardShader }),
                entryPoint: "fs_main",
                targets: [{ format: this.format }]
            },
            primitive: {
                topology: 'triangle-list'
            },
            depthStencil: {
                format: "depth24plus-stencil8",
                depthWriteEnabled: false,
                depthCompare: "always"
            }
        })

        // Terrain pipeline (dual texture blending)
        const terrainPipelineLayout = this.device.createPipelineLayout({
            bindGroupLayouts: [this.frameGroupLayout, this.terrainMaterialGroupLayout]
        });

        this.terrainPipeline = this.device.createRenderPipeline({
            layout: terrainPipelineLayout,
            vertex: {
                module: this.device.createShaderModule({ code: terrainShader }),
                entryPoint: "vs_main",
                buffers: [STANDARD_BUFFER_LAYOUT]
            },
            fragment: {
                module: this.device.createShaderModule({ code: terrainShader }),
                entryPoint: "fs_main",
                targets: [{ format: this.format }]
            },
            primitive: {
                topology: 'triangle-list'
            },
            depthStencil: this.depthStencilState
        });

    }

    private setupBindGroup(): void {
        this.frameBindGroup = this.device.createBindGroup({
            layout: this.frameGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: this.uniformBuffer } },
                { binding: 1, resource: { buffer: this.objectBuffer } }
            ]
        });
    }

    /**
     * Get the material group layout for creating materials
     */
    getMaterialGroupLayout(): GPUBindGroupLayout {
        return this.materialGroupLayout;
    }

    /**
     * Get the terrain material group layout for dual-texture terrain
     */
    getTerrainMaterialGroupLayout(): GPUBindGroupLayout {
        return this.terrainMaterialGroupLayout;
    }

    /**
     * Get the blend settings buffer for terrain materials
     */
    getBlendSettingsBuffer(): GPUBuffer {
        return this.blendSettingsBuffer;
    }

    /**
     * Update the satellite opacity (0.0 - 1.0)
     */
    updateBlendSettings(opacity: number): void {
        this._satelliteOpacity = Math.max(0, Math.min(1, opacity));
        const data = new Float32Array([this._satelliteOpacity, 0, 0, 0]);
        this.device.queue.writeBuffer(this.blendSettingsBuffer, 0, data);
    }

    /**
     * Get current satellite opacity
     */
    get satelliteOpacity(): number {
        return this._satelliteOpacity;
    }

    /**
     * Toggle satellite visibility (0% ↔ 10%)
     */
    toggleSatellite(): void {
        if (this._satelliteOpacity > 0) {
            this.updateBlendSettings(0);
        } else {
            this.updateBlendSettings(0.1);
        }
        console.log(`🛰️ Satellite opacity: ${Math.round(this._satelliteOpacity * 100)}%`);
    }

    /**
     * Get the terrain pipeline
     */
    getTerrainPipeline(): GPURenderPipeline {
        return this.terrainPipeline;
    }

    /**
     * Get or create a frame bind group for an InstancedMesh
     * Each InstancedMesh has its own instance buffer
     */
    private getInstancedBindGroup(mesh: InstancedMesh): GPUBindGroup {
        let bindGroup = this.instancedBindGroups.get(mesh);
        if (!bindGroup) {
            bindGroup = this.device.createBindGroup({
                layout: this.frameGroupLayout,
                entries: [
                    { binding: 0, resource: { buffer: this.uniformBuffer } },
                    { binding: 1, resource: { buffer: mesh.getInstanceBuffer() } }
                ]
            });
            this.instancedBindGroups.set(mesh, bindGroup);
        }
        return bindGroup;
    }

    /**
     * Render all objects in the scene
     */
    render(renderData: RenderData): void {
        if (!this.device || !this.pipeline) {
            console.error("Renderer not initialized");
            return;
        }

        const { viewTransform, objects } = renderData;

        // Create projection matrix
        const projection = mat4.create();
        mat4.perspective(
            projection,
            Math.PI / 4,
            this.canvas.width / this.canvas.height,
            0.1,
            100
        );

        // Upload view and projection matrices
        this.device.queue.writeBuffer(this.uniformBuffer, 0, new Float32Array(viewTransform));
        this.device.queue.writeBuffer(this.uniformBuffer, 64, new Float32Array(projection));

        // Upload all object model matrices
        const modelData = new Float32Array(objects.length * 16);
        objects.forEach((obj, i) => {
            const matrix = obj.getModelMatrix();
            for (let j = 0; j < 16; j++) {
                modelData[i * 16 + j] = matrix[j];
            }
        });
        this.device.queue.writeBuffer(this.objectBuffer, 0, modelData);

        const commandEncoder = this.device.createCommandEncoder();

        // Group objects by render type
        const standardObjects = objects.filter(obj => obj.renderType === RenderType.Standard);
        const terrainObjects = objects.filter(obj => obj.renderType === RenderType.Terrain);
        const billboardObjects = objects.filter(obj => obj.renderType === RenderType.Billboard);

        // ========== Main render pass ==========
        const textureView = this.context.getCurrentTexture().createView();
        const renderPass = commandEncoder.beginRenderPass({
            colorAttachments: [{
                view: textureView,
                clearValue: { r: 0.1, g: 0.1, b: 0.15, a: 1.0 },
                loadOp: 'clear',
                storeOp: 'store'
            }],
            depthStencilAttachment: this.depthStencilAttachment
        });

        renderPass.setBindGroup(0, this.frameBindGroup);

        // Render standard objects
        if (standardObjects.length > 0) {
            renderPass.setPipeline(this.pipeline);
            standardObjects.forEach((obj) => {
                const instanceIndex = objects.indexOf(obj);
                renderPass.setBindGroup(1, obj.material);
                obj.bind(renderPass);
                obj.draw(renderPass, instanceIndex);
            });
        }

        // Render terrain objects
        if (terrainObjects.length > 0) {
            renderPass.setPipeline(this.terrainPipeline);
            terrainObjects.forEach((obj) => {
                const instanceIndex = objects.indexOf(obj);
                renderPass.setBindGroup(1, obj.material);
                obj.bind(renderPass);
                obj.draw(renderPass, instanceIndex);
            });
        }

        // Render billboard objects
        if (billboardObjects.length > 0) {
            renderPass.setPipeline(this.billboardPipeline);
            billboardObjects.forEach((obj) => {
                const instanceIndex = objects.indexOf(obj);
                renderPass.setBindGroup(1, obj.material);
                obj.bind(renderPass);
                obj.draw(renderPass, instanceIndex);
            });
        }

        // Render instanced meshes (one draw call per submesh, all instances per call)
        const instancedMeshes = renderData.instancedMeshes ?? [];
        for (const instancedMesh of instancedMeshes) {
            if (instancedMesh.getInstanceCount() === 0) continue;

            // Select pipeline based on render type
            switch (instancedMesh.renderType) {
                case RenderType.Billboard:
                    renderPass.setPipeline(this.billboardPipeline);
                    break;
                case RenderType.Terrain:
                    renderPass.setPipeline(this.terrainPipeline);
                    break;
                default:
                    renderPass.setPipeline(this.pipeline);
            }

            // Use instanced mesh's own bind group (with its own instance buffer)
            const instancedBindGroup = this.getInstancedBindGroup(instancedMesh);
            renderPass.setBindGroup(0, instancedBindGroup);

            // Draw all submeshes (each submesh = 1 draw call with all instances)
            instancedMesh.drawAll(renderPass);
        }

        // Restore default bind group for any subsequent operations
        if (instancedMeshes.length > 0) {
            renderPass.setBindGroup(0, this.frameBindGroup);
        }

        renderPass.end();

        this.device.queue.submit([commandEncoder.finish()]);
    }

    /**
     * Resize the renderer (call when canvas size changes)
     */
    resize(): void {
        this.depthStencilBuffer.destroy();
        this.setupDepthBuffer();

        this.pickingTexture?.destroy();
        this.pickingDepthTexture?.destroy();
        this.setupPickingTextures();
    }

    private setupPicking(): void {
        this.setupPickingTextures();

        const pipelineLayout = this.device.createPipelineLayout({
            bindGroupLayouts: [this.frameGroupLayout]
        });

        this.pickingPipeline = this.device.createRenderPipeline({
            layout: pipelineLayout,
            vertex: {
                module: this.device.createShaderModule({ code: pickingShader }),
                entryPoint: "vs_main",
                buffers: [STANDARD_BUFFER_LAYOUT]
            },
            fragment: {
                module: this.device.createShaderModule({ code: pickingShader }),
                entryPoint: "fs_main",
                targets: [{ format: 'rgba32float' }]
            },
            primitive: { topology: 'triangle-list' },
            depthStencil: {
                format: "depth24plus",
                depthWriteEnabled: true,
                depthCompare: "less-equal"
            }
        });

        this.pickingReadBuffer = this.device.createBuffer({
            size: 16,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
        });
    }

    private setupPickingTextures(): void {
        this.pickingTexture = this.device.createTexture({
            size: [this.canvas.width, this.canvas.height],
            format: 'rgba32float',
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC
        });

        this.pickingDepthTexture = this.device.createTexture({
            size: [this.canvas.width, this.canvas.height],
            format: 'depth24plus',
            usage: GPUTextureUsage.RENDER_ATTACHMENT
        });
    }

    renderPickingPass(renderData: RenderData): void {
        const { viewTransform, objects } = renderData;

        const projection = mat4.create();
        mat4.perspective(projection, Math.PI / 4, this.canvas.width / this.canvas.height, 0.1, 100);

        this.device.queue.writeBuffer(this.uniformBuffer, 0, new Float32Array(viewTransform));
        this.device.queue.writeBuffer(this.uniformBuffer, 64, new Float32Array(projection));

        const modelData = new Float32Array(objects.length * 16);
        objects.forEach((obj, i) => {
            const matrix = obj.getModelMatrix();
            for (let j = 0; j < 16; j++) {
                modelData[i * 16 + j] = matrix[j];
            }
        });
        this.device.queue.writeBuffer(this.objectBuffer, 0, modelData);

        const commandEncoder = this.device.createCommandEncoder();

        const renderPass = commandEncoder.beginRenderPass({
            colorAttachments: [{
                view: this.pickingTexture.createView(),
                clearValue: { r: -9999, g: -9999, b: -9999, a: 0 },
                loadOp: 'clear',
                storeOp: 'store'
            }],
            depthStencilAttachment: {
                view: this.pickingDepthTexture.createView(),
                depthClearValue: 1.0,
                depthLoadOp: 'clear',
                depthStoreOp: 'store'
            }
        });

        renderPass.setPipeline(this.pickingPipeline);
        renderPass.setBindGroup(0, this.frameBindGroup);

        objects.forEach((obj, instanceIndex) => {
            obj.bind(renderPass);
            obj.draw(renderPass, instanceIndex);
        });

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
            { buffer: this.pickingReadBuffer, bytesPerRow: 256 },
            { width: 1, height: 1 }
        );
        this.device.queue.submit([commandEncoder.finish()]);

        await this.pickingReadBuffer.mapAsync(GPUMapMode.READ);
        const data = new Float32Array(this.pickingReadBuffer.getMappedRange().slice(0));
        this.pickingReadBuffer.unmap();

        if (data[0] < -9000) {
            return null;
        }

        return vec3.fromValues(data[0], data[1], data[2]);
    }

    getDevice(): GPUDevice {
        return this.device;
    }
}

