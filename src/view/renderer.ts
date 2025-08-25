import Material from './material';
import basicShader from './basicShaders.wgsl?raw'
import terrainShader from './terrainShaders.wgsl?raw'
import { TriangleMesh } from './triangle_mesh';
import { mat4 } from 'gl-matrix'
import { ObjectTypes, RenderData } from '../model/definitions';
//import QuadMesh from './quadMesh';
import TerrainMesh from './terrainMesh';
//import ObjMesh from './objMesh';
import Builder from '../model/builder';
import Model from '../model/model';
import { WebGPUTerrainManager } from '../control/webGPUTerrainManager';
import { TerrainTile } from '../types/terrainStreaming';

export default class Renderer {
    canvas: HTMLCanvasElement;

    adaptor!: GPUAdapter | null;
    device!: GPUDevice;
    context!: GPUCanvasContext;
    format!: GPUTextureFormat;

    uniformBuffer!: GPUBuffer
    pipeline!: GPURenderPipeline;
    terrainPipeline!: GPURenderPipeline;
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

    // Terrain streaming system
    terrainManager!: WebGPUTerrainManager;
    streamingEnabled: boolean = false;

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

        // Initialize terrain streaming system
        await this.initializeTerrainStreaming();

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


        // Create pipeline for triangles and other basic geometry
        this.pipeline = this.device.createRenderPipeline(
            {
                layout: pipelineLayout,
                vertex:
                {
                    module: this.device.createShaderModule(
                        {
                            code: basicShader
                        }),
                    entryPoint: "vs_main",
                    buffers: [this.triangleMesh.bufferLayout] // Use triangle layout for basic geometry
                },
                fragment:
                {
                    module: this.device.createShaderModule(
                        {
                            code: basicShader
                        }),
                    entryPoint: "fs_main",
                    targets: [{ format: this.format }]
                },
                primitive: {
                    topology: 'triangle-list',
                },
                depthStencil: this.depthStencilState
            });

        // Create separate pipeline for terrain with different vertex layout
        this.terrainPipeline = this.device.createRenderPipeline(
            {
                layout: pipelineLayout,
                vertex:
                {
                    module: this.device.createShaderModule(
                        {
                            code: terrainShader
                        }),
                    entryPoint: "vs_main",
                    buffers: [this.terrainMesh.bufferLayout] // Use terrain layout for streaming terrain
                },
                fragment:
                {
                    module: this.device.createShaderModule(
                        {
                            code: terrainShader
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

        // Render terrain if it has data (legacy single tile)
        if (this.terrainMesh.hasData() && renderObjects.objectCounts[ObjectTypes.TERRAIN] > 0 && !this.streamingEnabled) {
            renderpass.setVertexBuffer(0, this.terrainMesh.vertexBuffer);
            renderpass.setIndexBuffer(this.terrainMesh.indexBuffer, 'uint32');
            renderpass.setBindGroup(1, this.terrainMaterial.bindGroup);
            renderpass.drawIndexed(this.terrainMesh.indexCount, renderObjects.objectCounts[ObjectTypes.TERRAIN], 0, 0, objectsDrawn);
            objectsDrawn += renderObjects.objectCounts[ObjectTypes.TERRAIN];
        }

        // Render streaming terrain tiles (with terrain pipeline)
        objectsDrawn = this.renderStreamingTerrain(renderpass, objectsDrawn);

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

    /**
     * 🌍 Initialize terrain streaming system
     */
    async initializeTerrainStreaming(): Promise<void> {
        console.log('🌍 Initializing terrain streaming system...');

        try {
            // Create terrain manager with configuration optimized for 9-tile grid
            this.terrainManager = new WebGPUTerrainManager(this.device, {
                tileMeshResolution: 64, // Even lower resolution for faster loading
                maxTilesInMemory: 25,
                preloadDistance: 1, // Smaller preload distance
                baseUrl: 'http://localhost:3000',
                defaultScale: 30,
                meshGenerationWorkers: 2 // Re-enable workers with JS version
            });

            // Initialize the manager
            await this.terrainManager.initialize();

            // Set up event handlers
            this.terrainManager.on('onTileLoaded', (tile: TerrainTile) => {
                console.log(`🎯 Tile loaded: ${tile.tileId}`);
            });

            this.terrainManager.on('onError', (error) => {
                console.error('🚨 Terrain error:', error);
            });

            console.log('✅ Terrain streaming system initialized');

        } catch (error) {
            console.error('❌ Failed to initialize terrain streaming:', error);
        }
    }

    /**
     * 🚀 Start terrain streaming at specified location
     */
    async startTerrainStreaming(spawnLat: number, spawnLng: number): Promise<void> {
        if (!this.terrainManager) {
            console.error('❌ Terrain manager not initialized');
            return;
        }

        try {
            console.log(`🚀 Starting terrain streaming at ${spawnLat}, ${spawnLng}`);

            // Load initial grid
            await this.terrainManager.loadInitialGrid(spawnLat, spawnLng, 1); // 1 tile radius = 3x3 grid (9 tiles)

            this.streamingEnabled = true;
            console.log('✅ Terrain streaming started');

        } catch (error) {
            console.error('❌ Failed to start terrain streaming:', error);
        }
    }

    /**
     * 🎮 Update player position for terrain streaming
     */
    async updateTerrainPlayerPosition(lat: number, lng: number): Promise<void> {
        if (this.terrainManager && this.streamingEnabled) {
            await this.terrainManager.updatePlayerPosition(lat, lng);
        }
    }

    /**
 * 🎬 Render streaming terrain tiles
 */
    renderStreamingTerrain(renderpass: GPURenderPassEncoder, objectsDrawn: number): number {
        if (!this.terrainManager || !this.streamingEnabled) {
            return objectsDrawn;
        }

        // Get visible tiles
        const visibleTiles = this.terrainManager.getVisibleTiles();

        if (visibleTiles.length === 0) {
            return objectsDrawn;
        }

        // Create model matrices for terrain tiles with rotation
        const terrainModelMatrices: Float32Array[] = [];
        for (const tile of visibleTiles) {
            if (tile.vertexBuffer && tile.indexBuffer && tile.meshData) {
                // Create model matrix for this tile
                const modelMatrix = mat4.create();
                mat4.identity(modelMatrix);

                // Apply transformations to create a flat 3x3 grid on the ground
                const tileSize = 6.4; // Based on terrainScale (0.1) * resolution (64)

                // Simple grid positioning: arrange tiles relative to each other
                // For a 3x3 grid, tiles should be at positions: -1, 0, 1 in both X and Z
                const gridIndex = visibleTiles.indexOf(tile);
                const gridX = (gridIndex % 3) - 1; // -1, 0, 1
                const gridZ = Math.floor(gridIndex / 3) - 1; // -1, 0, 1

                const posX = gridX * tileSize;
                const posY = 0; // Keep on ground level
                const posZ = gridZ * tileSize;

                // Just translate to grid position - no rotation needed if worker generates correct orientation
                mat4.translate(modelMatrix, modelMatrix, [posX, posY, posZ]);

                terrainModelMatrices.push(new Float32Array(modelMatrix));
            }
        }

        // Update object buffer with terrain model matrices
        if (terrainModelMatrices.length > 0) {
            const terrainMatrixData = new Float32Array(terrainModelMatrices.length * 16);
            for (let i = 0; i < terrainModelMatrices.length; i++) {
                terrainMatrixData.set(terrainModelMatrices[i], i * 16);
            }

            // Write terrain matrices starting after existing objects
            this.device.queue.writeBuffer(
                this.objectBuffer,
                objectsDrawn * 16 * 4, // offset: 16 floats * 4 bytes per float * objectsDrawn
                terrainMatrixData
            );
        }

        // Switch to terrain pipeline for proper vertex layout
        renderpass.setPipeline(this.terrainPipeline);
        renderpass.setBindGroup(0, this.frameBindGroup);

        // Render each tile
        for (const tile of visibleTiles) {
            if (tile.vertexBuffer && tile.indexBuffer && tile.meshData) {
                // Set vertex and index buffers for this tile
                renderpass.setVertexBuffer(0, tile.vertexBuffer);
                renderpass.setIndexBuffer(tile.indexBuffer, 'uint32');
                renderpass.setBindGroup(1, this.terrainMaterial.bindGroup);

                // Draw this tile with its model matrix
                renderpass.drawIndexed(
                    tile.meshData.indexCount,  // indexCount
                    1,                         // instanceCount
                    0,                         // firstIndex
                    0,                         // baseVertex
                    objectsDrawn               // firstInstance (points to terrain matrix)
                );

                objectsDrawn++; // Increment for each tile
            }
        }

        // Switch back to regular pipeline for other objects
        renderpass.setPipeline(this.pipeline);
        renderpass.setBindGroup(0, this.frameBindGroup);

        return objectsDrawn;
    }

    /**
     * 📊 Get terrain streaming statistics
     */
    getTerrainStats(): any {
        if (!this.terrainManager) {
            return null;
        }

        return this.terrainManager.getMemoryStats();
    }
}
