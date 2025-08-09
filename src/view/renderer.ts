import Material from './material';
import shader from './shaders.wgsl?raw'
import { TriangleMesh } from './triangle_mesh';
import { mat4 } from 'gl-matrix'
import { ObjectTypes, RenderData } from '../model/definitions';
//import QuadMesh from './quadMesh';
import TerrainMesh from './terrainMesh';
//import ObjMesh from './objMesh';
import Builder from '../model/builder';
import Model from '../model/model';

export default class Renderer {
    canvas: HTMLCanvasElement;

    adaptor!: GPUAdapter | null;
    device!: GPUDevice;
    context!: GPUCanvasContext;
    format!: GPUTextureFormat;

    uniformBuffer!: GPUBuffer
    pipeline!: GPURenderPipeline;
    frameGroupLayout!: GPUBindGroupLayout;
    materialGroupLayout!: GPUBindGroupLayout;
    frameBindGroup!: GPUBindGroup;


    depthStencilState!: GPUDepthStencilState;
    depthStencilBuffer!: GPUTexture;
    depthStencilView!: GPUTextureView;
    depthStencilAttachment!: GPURenderPassDepthStencilAttachment;


    triangleMesh!: TriangleMesh;
    //quadMesh!: QuadMesh;
    terrainMesh!: TerrainMesh;
    //statueMesh!: ObjMesh;
    model!: Model;

    triangleMaterial!: Material;
    quadMaterial!: Material;
    terrainMaterial!: Material;
    objectBuffer!: GPUBuffer;

    builder!: Builder;
    terrainBuilder!: Builder;


    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas

    }

    async init() {
        await this.setupDevice();

        await this.setupBindGroupLayouts();

        await this.createAssets();

        await this.setupDepthBufferResources();

        await this.setupPipeline();

        await this.setupBindGroup();

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
    async setupBindGroupLayouts() {
        this.frameGroupLayout = this.device.createBindGroupLayout({
            entries:
                [
                    {
                        binding: 0,
                        visibility: GPUShaderStage.VERTEX,
                        buffer: {}
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
        this.materialGroupLayout = this.device.createBindGroupLayout({
            entries:
                [

                    {
                        binding: 0,
                        visibility: GPUShaderStage.FRAGMENT,
                        texture: {}
                    },
                    {
                        binding: 1,
                        visibility: GPUShaderStage.FRAGMENT,
                        sampler: {}
                    },

                ]
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



        const pipelineLayout: GPUPipelineLayout = this.device.createPipelineLayout({
            bindGroupLayouts: [this.frameGroupLayout, this.materialGroupLayout]
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

        //this.quadMesh = new QuadMesh(this.device);
        this.quadMaterial = new Material();

        // Create terrain mesh and material
        this.terrainMesh = new TerrainMesh(this.device);
        this.terrainMaterial = new Material();

        this.builder = new Builder();
        await this.builder.loadGLTF("models/flat_vase.glb");
        this.model = new Model(this.device, this.builder);

        // Create separate builder for terrain
        this.terrainBuilder = new Builder();

        //this.statueMesh = new ObjMesh();
        //await this.statueMesh.init(this.device, 'models/statue.obj');

        this.uniformBuffer = this.device.createBuffer({
            size: 64 * 2,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        })

        const modelBufferDescriptor: GPUBufferDescriptor = {
            size: 64 * 1024,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE
        };
        this.objectBuffer = this.device.createBuffer(modelBufferDescriptor);
        await this.triangleMaterial.init(this.device, 'img/img.jpeg', this.materialGroupLayout);
        await this.quadMaterial.init(this.device, 'img/floor.jpg', this.materialGroupLayout);
        await this.quadMaterial.generateMipmaps(this.device);

        // Initialize terrain material with existing texture (reuse floor texture for now)
        await this.terrainMaterial.init(this.device, 'img/floor.jpg', this.materialGroupLayout);
        await this.terrainMaterial.generateMipmaps(this.device);
    }

    /**
     * 🏔️ Generate terrain from tile data
     */
    async generateTerrain(tileData: any) {
        try {
            console.log('🏔️ Generating terrain mesh from tile data...');

            // Use terrain builder to populate terrain data with appropriate scale for visibility
            const worldScale = 1.0; // Much smaller scale since we adjusted height calculation
            const success = this.terrainBuilder.populateTerrainFromTile(tileData, worldScale);

            if (!success) {
                console.error('❌ Failed to populate terrain data');
                return;
            }

            console.log('📊 Terrain builder stats:', {
                vertexCount: this.terrainBuilder.vertexCount,
                indexCount: this.terrainBuilder.indexCount,
                worldScale: worldScale
            });

            // Get vertex and index data from builder
            const vertices = this.terrainBuilder.getFlattenedVertices();
            const indices = this.terrainBuilder.getIndexArray();

            console.log('📊 Mesh data:', {
                vertexArrayLength: vertices.length,
                indexArrayLength: indices.length,
                vertexFloatsPerVertex: vertices.length / this.terrainBuilder.vertexCount,
                firstFewVertices: Array.from(vertices.slice(0, 15)) // position(3) + uv(2) for first 3 vertices
            });

            // Update terrain mesh with new data
            this.terrainMesh.updateTerrain(this.device, vertices, indices);

            console.log('✅ Terrain mesh generated successfully with scale:', worldScale);

        } catch (error) {
            console.error('❌ Error generating terrain mesh:', error);
        }
    }

    async render(renderObjects: RenderData) {


        if (!this.device) {
            console.error("DEVICE IS NOT CREATED");
            return;
        }
        if (!this.pipeline) {
            console.error("PIPELINE IS NOT CREATED");
            return;
        }


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
        renderpass.setBindGroup(0, this.frameBindGroup);

        let objectsDrawn: number = 0;
        //triangles
        renderpass.setVertexBuffer(0, this.triangleMesh.buffer);
        renderpass.setBindGroup(1, this.triangleMaterial.bindGroup);
        renderpass.draw(3, renderObjects.objectCounts[ObjectTypes.TRIANGLE], 0, objectsDrawn);
        objectsDrawn += renderObjects.objectCounts[ObjectTypes.TRIANGLE];

        //quads
        /*renderpass.setVertexBuffer(0, this.quadMesh.buffer);
        renderpass.setBindGroup(1, this.quadMaterial.bindGroup);
        renderpass.draw(6, renderObjects.objectCounts[ObjectTypes.QUAD], 0, objectsDrawn);
        objectsDrawn += renderObjects.objectCounts[ObjectTypes.QUAD];*/

        // Render terrain if it has data
        if (this.terrainMesh.hasData() && renderObjects.objectCounts[ObjectTypes.TERRAIN] > 0) {
            renderpass.setVertexBuffer(0, this.terrainMesh.vertexBuffer);
            renderpass.setIndexBuffer(this.terrainMesh.indexBuffer, 'uint32');
            renderpass.setBindGroup(1, this.terrainMaterial.bindGroup);
            renderpass.drawIndexed(this.terrainMesh.indexCount, renderObjects.objectCounts[ObjectTypes.TERRAIN], 0, 0, objectsDrawn);
            objectsDrawn += renderObjects.objectCounts[ObjectTypes.TERRAIN];
        }

        this.model.bind(renderpass);
        renderpass.setBindGroup(1, this.triangleMaterial.bindGroup);

        this.model.draw(renderpass, objectsDrawn);

        objectsDrawn += 1;

        renderpass.end();
        this.device.queue.submit([commandEncoder.finish()]);


    }

    async setupBindGroup() {
        this.frameBindGroup = this.device.createBindGroup({
            layout: this.frameGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: this.uniformBuffer }
                }, {
                    binding: 1, resource: { buffer: this.objectBuffer }
                }
            ]
        })
    }
}
