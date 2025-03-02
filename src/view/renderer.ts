import Material from './material';
import shader from './shaders.wgsl?raw'
import { TriangleMesh } from './triangle_mesh';
import { mat4 } from 'gl-matrix'
import Camera from '../model/camera';

export default class Renderer {
    canvas: HTMLCanvasElement;

    adaptor!: GPUAdapter | null;
    device!: GPUDevice;
    context!: GPUCanvasContext;
    format!: GPUTextureFormat;

    uniformBuffer!: GPUBuffer
    bindGroup!: GPUBindGroup;
    pipeline!: GPURenderPipeline;


    depthStencilState!: GPUDepthStencilState;
    depthStencilBuffer!: GPUTexture;
    depthStencilView!: GPUTextureView;
    depthStencilAttachment!: GPURenderPassDepthStencilAttachment;


    triangleMesh!: TriangleMesh;
    material!: Material;
    objectBuffer!: GPUBuffer;


    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas

    }

    async init() {
        await this.setupDevice();

        await this.createAssets();

        await this.setupDepthBufferResources();

        await this.setupPipeline();

    }

    async setupDevice() {
        this.adaptor = await navigator.gpu?.requestAdapter();

        this.device = <GPUDevice>await this.adaptor?.requestDevice();

        const check: HTMLDivElement = document.querySelector<HTMLDivElement>('#compcheck')!;
        if (!this.adaptor) {
            check.innerHTML = 'WebGPU is not supported';
            console.error("WebGPU is not supported on this device!");
            return;
        }
        else {
            check.innerHTML = 'WebGPU is supported. Click to the canvas';
        }

        this.context = <GPUCanvasContext>this.canvas.getContext('webgpu');
        this.format = 'bgra8unorm';
        this.context.configure({
            device: this.device,
            format: this.format,
            alphaMode: 'opaque'
        });

    }

    async setupDepthBufferResources() {
        this.depthStencilState = {
            format: "depth24plus-stencil8",
            depthWriteEnabled: true,
            depthCompare: "less-equal"
        }
        const size: GPUExtent3D = {
            width: this.canvas.width,
            height: this.canvas.height,
            depthOrArrayLayers: 1
        }
        const depthBufferDescriptor: GPUTextureDescriptor = {
            size: size,
            format: "depth24plus-stencil8",
            usage: GPUTextureUsage.RENDER_ATTACHMENT
        }
        this.depthStencilBuffer = this.device.createTexture(depthBufferDescriptor);

        const viewDescriptor: GPUTextureViewDescriptor = {
            format: "depth24plus-stencil8",
            dimension: "2d",
            aspect: "all"
        }
        this.depthStencilView = this.depthStencilBuffer.createView(viewDescriptor);
        this.depthStencilAttachment = {
            view: this.depthStencilView,
            depthClearValue: 1.,
            depthLoadOp: "clear",
            depthStoreOp: "store",
            stencilLoadOp: "clear",
            stencilStoreOp: "discard"
        }
    }

    async setupPipeline() {

        this.uniformBuffer = this.device.createBuffer({
            size: 64 * 2,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        })

        const bindGroupLayout: GPUBindGroupLayout = this.device.createBindGroupLayout({
            entries:
                [
                    {
                        binding: 0,
                        visibility: GPUShaderStage.VERTEX,
                        buffer: {}
                    },
                    {
                        binding: 1,
                        visibility: GPUShaderStage.FRAGMENT,
                        texture: {}
                    },
                    {
                        binding: 2,
                        visibility: GPUShaderStage.FRAGMENT,
                        sampler: {}
                    },
                    {
                        binding: 3,
                        visibility: GPUShaderStage.VERTEX,
                        buffer: {
                            type: "read-only-storage",
                            hasDynamicOffset: false
                        }
                    }
                ]
        });
        this.bindGroup = this.device.createBindGroup({
            layout: bindGroupLayout,
            entries:
                [
                    {
                        binding: 0,
                        resource: {
                            buffer: this.uniformBuffer
                        }
                    },
                    {
                        binding: 1,
                        resource: this.material.view
                    },
                    {
                        binding: 2,
                        resource: this.material.sampler
                    },
                    {
                        binding: 3,
                        resource: {
                            buffer: this.objectBuffer
                        }
                    }
                ]
        });

        const pipelineLayout: GPUPipelineLayout = this.device.createPipelineLayout({
            bindGroupLayouts: [bindGroupLayout]
        });
        this.pipeline = this.device.createRenderPipeline(
            {
                layout: pipelineLayout,
                vertex:
                {
                    module: this.device.createShaderModule(
                        {
                            code: shader
                        }),
                    entryPoint: "vs_main",
                    buffers: [this.triangleMesh.bufferLayout]
                },
                fragment:
                {
                    module: this.device.createShaderModule(
                        {
                            code: shader
                        }),
                    entryPoint: "fs_main",
                    targets: [{ format: this.format }]
                },
                primitive: {
                    topology: 'triangle-list',
                },
                depthStencil: this.depthStencilState
            });
    }

    async createAssets() {
        this.triangleMesh = new TriangleMesh(this.device);
        this.material = new Material();

        const modelBufferDescriptor: GPUBufferDescriptor = {
            size: 64 * 1024,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE
        };
        this.objectBuffer = this.device.createBuffer(modelBufferDescriptor);
        await this.material.init(this.device, 'img/img.jpeg');
    }

    async render(camera: Camera, triangles: Float32Array, triangleCount: number) {
        if (!this.uniformBuffer) {
            console.error("Uniform buffer is not initialized!");
            return;
        }
        if (!this.bindGroup) {
            console.error("BindGroup is not initialized!");
            return;
        }


        const projection = mat4.create();
        mat4.perspective(projection, Math.PI / 4, 800 / 600, 0.1, 50.);

        const view = camera.getView();


        this.device.queue.writeBuffer(this.objectBuffer, 0, triangles, 0, triangles.length);
        this.device.queue.writeBuffer(this.uniformBuffer, 0, new Float32Array(view));
        this.device.queue.writeBuffer(this.uniformBuffer, 64, new Float32Array(projection));


        const commandEncoder: GPUCommandEncoder = this.device.createCommandEncoder();
        const textureView: GPUTextureView = this.context.getCurrentTexture().createView();
        const renderpass: GPURenderPassEncoder = commandEncoder.beginRenderPass({
            colorAttachments: [{
                view: textureView,
                clearValue: { r: 0.5, g: 0.0, b: 0.25, a: 1. },
                loadOp: 'clear',
                storeOp: 'store',
            }],
            depthStencilAttachment: this.depthStencilAttachment
        })
        renderpass.setPipeline(this.pipeline);
        renderpass.setVertexBuffer(0, this.triangleMesh.buffer);

        renderpass.setBindGroup(0, this.bindGroup);
        renderpass.draw(3, triangleCount, 0, 0);



        renderpass.end();
        this.device.queue.submit([commandEncoder.finish()]);
        //console.log("Triangle count:", triangleCount);
        //console.log(triangles);

    }
}
