import { mat4 } from "gl-matrix";
import shader from "../view/shaders.wgsl?raw";
import { RenderData } from "./Scene";
import { STANDARD_BUFFER_LAYOUT } from "./MeshData";

/**
 * Renderer - Simplified WebGPU renderer
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
    frameGroupLayout!: GPUBindGroupLayout;
    materialGroupLayout!: GPUBindGroupLayout;
    frameBindGroup!: GPUBindGroup;

    // Buffers
    uniformBuffer!: GPUBuffer;
    objectBuffer!: GPUBuffer;

    // Depth
    depthStencilState!: GPUDepthStencilState;
    depthStencilBuffer!: GPUTexture;
    depthStencilView!: GPUTextureView;
    depthStencilAttachment!: GPURenderPassDepthStencilAttachment;

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

        // Begin render pass
        const commandEncoder = this.device.createCommandEncoder();
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

        renderPass.setPipeline(this.pipeline);
        renderPass.setBindGroup(0, this.frameBindGroup);

        // Render each object
        objects.forEach((obj, instanceIndex) => {
            renderPass.setBindGroup(1, obj.material);
            obj.bind(renderPass);
            obj.draw(renderPass, instanceIndex);
        });

        renderPass.end();
        this.device.queue.submit([commandEncoder.finish()]);
    }

    /**
     * Resize the renderer (call when canvas size changes)
     */
    resize(): void {
        this.depthStencilBuffer.destroy();
        this.setupDepthBuffer();
    }

    /**
     * Get the GPU device
     */
    getDevice(): GPUDevice {
        return this.device;
    }
}

