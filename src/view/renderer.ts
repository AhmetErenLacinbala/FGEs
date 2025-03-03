import Material from './material';
import shader from './shaders.wgsl?raw'
import { TriangleMesh } from './triangle_mesh';
import { mat4 } from 'gl-matrix'
import Camera from '../model/camera';
import { ObjectTypes, RenderData } from '../model/definitions';
import QuadMesh from './quadMesh';
import Triangle from '../model/triangle';

export default class Renderer {
    canvas: HTMLCanvasElement;

    adaptor!: GPUAdapter | null;
    device!: GPUDevice;
    context!: GPUCanvasContext;
    format!: GPUTextureFormat;

    uniformBuffer!: GPUBuffer
    triangleBindGroup!: GPUBindGroup;
    quadBindGroup!: GPUBindGroup;
    pipeline!: GPURenderPipeline;


    depthStencilState!: GPUDepthStencilState;
    depthStencilBuffer!: GPUTexture;
    depthStencilView!: GPUTextureView;
    depthStencilAttachment!: GPURenderPassDepthStencilAttachment;


    triangleMesh!: TriangleMesh;
    quadMesh!: QuadMesh;
    triangleMaterial!: Material;
    quadMaterial!: Material;
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
        this.triangleBindGroup = this.device.createBindGroup({
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
                        resource: this.triangleMaterial.view
                    },
                    {
                        binding: 2,
                        resource: this.triangleMaterial.sampler
                    },
                    {
                        binding: 3,
                        resource: {
                            buffer: this.objectBuffer
                        }
                    }
                ]
        });

        this.quadBindGroup = this.device.createBindGroup({
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
                        resource: this.quadMaterial.view
                    },
                    {
                        binding: 2,
                        resource: this.quadMaterial.sampler
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
        this.triangleMaterial = new Material();

        this.quadMesh = new QuadMesh(this.device);
        this.quadMaterial = new Material();

        const modelBufferDescriptor: GPUBufferDescriptor = {
            size: 64 * 1024,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE
        };
        this.objectBuffer = this.device.createBuffer(modelBufferDescriptor);
        await this.triangleMaterial.init(this.device, 'img/img.jpeg');
        await this.quadMaterial.init(this.device, 'img/floor.jpg');
    }

    async render(renderObjects: RenderData) {
        /*if (!this.uniformBuffer) {
            console.error("Uniform buffer is not initialized!");
            return;
        }
        if (!this.bindGroup) {
            console.error("BindGroup is not initialized!");
            return;
        }*/


        const projection = mat4.create();
        mat4.perspective(projection, Math.PI / 4, 800 / 600, 0.1, 50.);

        const view = renderObjects.viewTransform;


        this.device.queue.writeBuffer(this.objectBuffer, 0, renderObjects.modelTransform, 0, renderObjects.modelTransform.length);
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
        });
        renderpass.setPipeline(this.pipeline);

        let objectsDrawn: number = 0;
        //triangles
        renderpass.setVertexBuffer(0, this.triangleMesh.buffer);
        renderpass.setBindGroup(0, this.triangleBindGroup);
        renderpass.draw(3, renderObjects.objectCounts[ObjectTypes.TRIANGLE], 0, objectsDrawn);
        objectsDrawn += renderObjects.objectCounts[ObjectTypes.TRIANGLE];

        renderpass.setVertexBuffer(0, this.quadMesh.buffer);
        renderpass.setBindGroup(0, this.quadBindGroup);
        renderpass.draw(6, renderObjects.objectCounts[ObjectTypes.QUAD], 0, objectsDrawn);
        objectsDrawn += renderObjects.objectCounts[ObjectTypes.QUAD];

        renderpass.end();
        this.device.queue.submit([commandEncoder.finish()]);
        //console.log("Triangle count:", triangleCount);
        //console.log(triangles);

    }
}
