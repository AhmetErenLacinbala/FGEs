import { mat4, vec3 } from "gl-matrix";
import shader from "../view/shaders.wgsl?raw";
import billboardShader from "../view/billboard.wgsl?raw";
import terrainShader from "../view/terrainShader.wgsl?raw";
import pickingShader from "../view/pickingShader.wgsl?raw";
import terrainPickingShader from "../view/terrainPickingShader.wgsl?raw";
import { RenderData } from "./Scene";
import { STANDARD_BUFFER_LAYOUT, TERRAIN_BUFFER_LAYOUT } from "./MeshData";
import { RenderType } from "./RenderableObject";
import InstancedMesh from "./InstancedMesh";
import selectionComputeShader from "../view/selectionCompute.wgsl?raw";

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

    // Selection Buffer for decal
    selectionQuadBuffer!: GPUBuffer;
    selectionTime: number = 0;

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
    terrainPickingPipeline!: GPURenderPipeline;
    pickingTexture!: GPUTexture;
    pickingDepthTexture!: GPUTexture;
    pickingReadBuffer!: GPUBuffer;

    computePipeline!: GPUComputePipeline;
    computeCountPipeline!: GPUComputePipeline;
    computeWritePipeline!: GPUComputePipeline;
    computeBindGroupLayout!: GPUBindGroupLayout;
    computeCountBuffer!: GPUBuffer;
    computeOutputBuffer!: GPUBuffer;
    computeReadbackBuffer!: GPUBuffer;

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
        this.setupCompute();
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
                },
                {
                    binding: 5,
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" }
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

        // Selection Buffer for decal
        this.selectionQuadBuffer = this.device.createBuffer({
            size: 48,
            /*
            4 vec2f32 points 32 bytes
            f32 enabled 4 bytes
            4 byte padding
            2 f32 pad 16 bytes
            total 48 bytes
            */
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        // Initialize selection quad buffer
        this.device.queue.writeBuffer(
            this.selectionQuadBuffer,
            0,
            new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])  // 12 floats
        );

        // Storage buffer for object model matrices
        this.objectBuffer = this.device.createBuffer({
            size: 64 * 1024, // 1024 object
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
                buffers: [TERRAIN_BUFFER_LAYOUT]
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
        this.selectionTime += 0.05;
        this.updateSelectionTime();

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

        // Standard picking pipeline (5 floats: position + uv)
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

        // Terrain picking pipeline (8 floats: position + normal + uv)
        this.terrainPickingPipeline = this.device.createRenderPipeline({
            layout: pipelineLayout,
            vertex: {
                module: this.device.createShaderModule({ code: terrainPickingShader }),
                entryPoint: "vs_main",
                buffers: [TERRAIN_BUFFER_LAYOUT]
            },
            fragment: {
                module: this.device.createShaderModule({ code: terrainPickingShader }),
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

    private setupCompute(): void {
        // Bind group layout for compute shader
        this.computeBindGroupLayout = this.device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "uniform" }  // SelectionQuad
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "read-only-storage" }  // Terrain vertices
                },
                {
                    binding: 2,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "storage" }  // Count buffer (atomic)
                },
                {
                    binding: 3,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: { type: "storage" }  // Output vertices
                }
            ]
        });

        // Count buffer (4 bytes for atomic u32)
        this.computeCountBuffer = this.device.createBuffer({
            size: 4,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST
        });

        const computePipelineLayout = this.device.createPipelineLayout({
            bindGroupLayouts: [this.computeBindGroupLayout]
        });

        // Count pipeline (Pass 1)
        this.computeCountPipeline = this.device.createComputePipeline({
            layout: computePipelineLayout,
            compute: {
                module: this.device.createShaderModule({ code: selectionComputeShader }),
                entryPoint: "count_main"
            }
        });

        // Write pipeline (Pass 2)
        this.computeWritePipeline = this.device.createComputePipeline({
            layout: computePipelineLayout,
            compute: {
                module: this.device.createShaderModule({ code: selectionComputeShader }),
                entryPoint: "write_main"
            }
        });

        console.log("✅ Compute pipelines created");

        // Output buffer - start with space for 10000 vertices (will resize if needed)
        this.computeOutputBuffer = this.device.createBuffer({
            size: 10000 * 12,  // 10000 vertices * 3 floats * 4 bytes
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
        });

        // Readback buffer for count
        this.computeReadbackBuffer = this.device.createBuffer({
            size: 4,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
        });
    }

    /**
 * Run compute shader to extract vertices inside selection
 * @param terrainVertexBuffer The terrain's vertex buffer
 * @param vertexCount Number of vertices in the terrain
 * @returns Promise<Float32Array> - Selected vertex positions (x,y,z for each)
 */
    async runSelectionCompute(terrainVertexBuffer: GPUBuffer, vertexCount: number): Promise<Float32Array | null> {
        // Reset count to 0
        this.device.queue.writeBuffer(this.computeCountBuffer, 0, new Uint32Array([0]));

        // Create bind group
        const bindGroup = this.device.createBindGroup({
            layout: this.computeBindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: this.selectionQuadBuffer } },
                { binding: 1, resource: { buffer: terrainVertexBuffer } },
                { binding: 2, resource: { buffer: this.computeCountBuffer } },
                { binding: 3, resource: { buffer: this.computeOutputBuffer } }
            ]
        });

        // Calculate workgroup count (256 threads per workgroup)
        const workgroupCount = Math.ceil(vertexCount / 256);

        // ===== PASS 1: Count =====
        const countEncoder = this.device.createCommandEncoder();
        const countPass = countEncoder.beginComputePass();
        countPass.setPipeline(this.computeCountPipeline);
        countPass.setBindGroup(0, bindGroup);
        countPass.dispatchWorkgroups(workgroupCount);
        countPass.end();

        // Copy count to readback buffer
        countEncoder.copyBufferToBuffer(
            this.computeCountBuffer, 0,
            this.computeReadbackBuffer, 0,
            4
        );
        this.device.queue.submit([countEncoder.finish()]);

        // Read count from GPU
        await this.computeReadbackBuffer.mapAsync(GPUMapMode.READ);
        const countData = new Uint32Array(this.computeReadbackBuffer.getMappedRange().slice(0));
        this.computeReadbackBuffer.unmap();

        const selectedCount = countData[0];
        console.log(`🎯 Selection compute: ${selectedCount} vertices inside selection`);

        if (selectedCount === 0) {
            return null;
        }

        // ===== PASS 2: Write =====
        // Reset count to 0 (will be used as write index)
        this.device.queue.writeBuffer(this.computeCountBuffer, 0, new Uint32Array([0]));

        const writeEncoder = this.device.createCommandEncoder();
        const writePass = writeEncoder.beginComputePass();
        writePass.setPipeline(this.computeWritePipeline);
        writePass.setBindGroup(0, bindGroup);
        writePass.dispatchWorkgroups(workgroupCount);
        writePass.end();
        this.device.queue.submit([writeEncoder.finish()]);

        // Read selected vertices from GPU
        const outputSize = selectedCount * 12; // 3 floats * 4 bytes per vertex
        const outputReadbackBuffer = this.device.createBuffer({
            size: outputSize,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
        });

        const copyEncoder = this.device.createCommandEncoder();
        copyEncoder.copyBufferToBuffer(
            this.computeOutputBuffer, 0,
            outputReadbackBuffer, 0,
            outputSize
        );
        this.device.queue.submit([copyEncoder.finish()]);

        await outputReadbackBuffer.mapAsync(GPUMapMode.READ);
        const outputData = new Float32Array(outputReadbackBuffer.getMappedRange().slice(0));
        outputReadbackBuffer.unmap();
        outputReadbackBuffer.destroy();

        console.log(`Compute Shader: Retrieved ${selectedCount} selected vertices`);
        return outputData;
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

        renderPass.setBindGroup(0, this.frameBindGroup);

        // Group objects by render type for picking
        const standardObjects = objects.filter(obj => obj.renderType !== RenderType.Terrain);
        const terrainObjects = objects.filter(obj => obj.renderType === RenderType.Terrain);

        // Render standard objects with standard picking pipeline
        if (standardObjects.length > 0) {
            renderPass.setPipeline(this.pickingPipeline);
            standardObjects.forEach((obj) => {
                const instanceIndex = objects.indexOf(obj);
                obj.bind(renderPass);
                obj.draw(renderPass, instanceIndex);
            });
        }

        // Render terrain objects with terrain picking pipeline
        if (terrainObjects.length > 0) {
            renderPass.setPipeline(this.terrainPickingPipeline);
            terrainObjects.forEach((obj) => {
                const instanceIndex = objects.indexOf(obj);
                obj.bind(renderPass);
                obj.draw(renderPass, instanceIndex);
            });
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

    updateSelectionQuad(points: vec3[] | null): void {
        console.log('updateSelectionQuad called with:', points);
        const data = new Float32Array(12);
        if (points && points.length === 4) {
            data[0] = points[0][0];
            data[1] = points[0][1];
            data[2] = points[1][0];
            data[3] = points[1][1];
            data[4] = points[2][0];
            data[5] = points[2][1];
            data[6] = points[3][0];
            data[7] = points[3][1];
            data[8] = 1.0; //enabled
            data[9] = this.selectionTime;
            //9-11 padding
        }
        this.device.queue.writeBuffer(this.selectionQuadBuffer, 0, data);
    }

    private updateSelectionTime(): void {
        this.selectionTime += 0.05;
        const timeData = new Float32Array([this.selectionTime]);
        this.device.queue.writeBuffer(this.selectionQuadBuffer, 36, timeData);
    }

    getSelectionQuadBuffer(): GPUBuffer {
        return this.selectionQuadBuffer;
    }

}

