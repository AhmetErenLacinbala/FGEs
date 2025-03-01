import Material from './material';
import shader from './shaders.wgsl?raw'
import { TriangleMesh } from './triangle_mesh';
import { mat4 } from 'gl-matrix'
import Camera from '../model/camera';
import Triangle from '../model/triangle';

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


    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas

    }

    async init() {
        await this.setupDevice();

        await this.createAssets();

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
                    },
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

    async render(camera: Camera, triangles: Triangle[]) {
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



        this.device.queue.writeBuffer(this.uniformBuffer, 64, new Float32Array(view));
        this.device.queue.writeBuffer(this.uniformBuffer, 128, new Float32Array(projection));

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
        renderpass.setVertexBuffer(0, this.triangleMesh.buffer);

        triangles.forEach((triangle: Triangle) => {

            const model = triangle.getModel();
            this.device.queue.writeBuffer(this.uniformBuffer, 0, new Float32Array(model));
            renderpass.setBindGroup(0, this.bindGroup);
            renderpass.draw(3, 1, 0, 0);
        })


        renderpass.end();
        this.device.queue.submit([commandEncoder.finish()]);

    }
}
