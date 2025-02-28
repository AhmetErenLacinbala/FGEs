import Material from './material';
import shader from './shaders.wgsl?raw'
import { TriangleMesh } from './triangle_mesh';
import { mat4 } from 'gl-matrix'

export default class Renderer {
    canvas: HTMLCanvasElement;

    adaptor!: GPUAdapter | null;
    device!: GPUDevice;
    context!: GPUCanvasContext;
    format!: GPUTextureFormat;

    uniformBuffer!: GPUBuffer
    bindGroup!: GPUBindGroup;
    pipeline!: GPURenderPipeline;


    triangleMesh!: TriangleMesh;
    material!: Material;

    t: number;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas
        this.t = 0.
    }

    async init() {
        await this.setupDevice();

        await this.createAssets();

        await this.setupPipeline();

        this.render();
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
            check.innerHTML = 'WebGPU is supported';
        }

        this.context = <GPUCanvasContext>this.canvas.getContext('webgpu');
        this.format = 'bgra8unorm';
        this.context.configure({
            device: this.device,
            format: this.format,
            alphaMode: 'opaque'
        });

    }

    async setupPipeline() {

        this.uniformBuffer = this.device.createBuffer({
            size: 64 * 3,
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
                    }
                    {
                        binding: 2,
                        resource: this.material.sampler
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
                }
            });
    }

    async createAssets() {
        this.triangleMesh = new TriangleMesh(this.device);
        this.material = new Material();
        await this.material.init(this.device, 'img/img.jpeg');
    }

    render = () => {

        this.t += 0.1;
        if (this.t > 2 * Math.PI) {
            this.t = 0;
        }

        const projection = mat4.create();
        mat4.perspective(projection, Math.PI / 4, 800 / 600, 0.1, 10.);

        const view = mat4.create();
        mat4.lookAt(view, [-2, 0, 2], [0, 0, 0], [0, 0, 1]);

        const model = mat4.create();
        mat4.rotate(model, model, this.t, [0, 0, 1]);

        this.device.queue.writeBuffer(this.uniformBuffer, 0, <ArrayBuffer>model);
        this.device.queue.writeBuffer(this.uniformBuffer, 64, <ArrayBuffer>view);
        this.device.queue.writeBuffer(this.uniformBuffer, 128, <ArrayBuffer>projection);

        const commandEncoder: GPUCommandEncoder = this.device.createCommandEncoder();
        const textureView: GPUTextureView = this.context.getCurrentTexture().createView();
        const renderpass: GPURenderPassEncoder = commandEncoder.beginRenderPass({
            colorAttachments: [{
                view: textureView,
                clearValue: { r: 0.5, g: 0.0, b: 0.25, a: 1. },
                loadOp: 'clear',
                storeOp: 'store',
            }]
        })
        renderpass.setPipeline(this.pipeline);
        renderpass.setBindGroup(0, this.bindGroup);
        renderpass.setVertexBuffer(0, this.triangleMesh.buffer);
        renderpass.draw(3, 1, 0, 0);
        renderpass.end();
        this.device.queue.submit([commandEncoder.finish()]);

        requestAnimationFrame(() => this.render());
    }
}
