import shader from './shaders.wgsl?raw'
import { TriangleMesh } from './triangle_mesh';

export default class Renderer {
    canvas: HTMLCanvasElement;

    adaptor!: GPUAdapter | null;
    device!: GPUDevice;
    context!: GPUCanvasContext;
    format!: GPUTextureFormat;

    bindGroup!: GPUBindGroup;
    pipeline!: GPURenderPipeline;

    triangleMesh!: TriangleMesh;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas
    }

    async init() {
        await this.setupDevice();

        this.createAssets();

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
        const bindGroupLayout: GPUBindGroupLayout = this.device.createBindGroupLayout({
            entries: []
        });
        this.bindGroup = this.device.createBindGroup({
            layout: bindGroupLayout,
            entries: []
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

    createAssets() {
        this.triangleMesh = new TriangleMesh(this.device);
    }

    async render() {
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
    }
}
