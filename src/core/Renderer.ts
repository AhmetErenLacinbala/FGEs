import { mat4, vec3 } from "gl-matrix";
import shader from "../view/shaders.wgsl?raw";
import billboardShader from "../view/billboard.wgsl?raw";
import terrainShader from "../view/terrainShader.wgsl?raw";
import pickingShader from "../view/pickingShader.wgsl?raw";
import decalShader from "../view/decalShader.wgsl?raw";
import { RenderData } from "./Scene";
import { STANDARD_BUFFER_LAYOUT } from "./MeshData";
import { RenderType } from "./RenderableObject";

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
    terrainDepthPipeline!: GPURenderPipeline;  // For depth pre-pass
    decalPipeline!: GPURenderPipeline;
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

    // Sampleable depth for decals
    depthTexture!: GPUTexture;
    depthTextureView!: GPUTextureView;

    // Decal system
    decalBindGroupLayout!: GPUBindGroupLayout;
    decalBoundsBuffer!: GPUBuffer;
    decalBindGroup!: GPUBindGroup;
    activeDecals: { corners: vec3[], color: [number, number, number, number] }[] = [];

    // Picking
    pickingPipeline!: GPURenderPipeline;
    pickingTexture!: GPUTexture;
    pickingDepthTexture!: GPUTexture;
    pickingReadBuffer!: GPUBuffer;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
    }

    async init(): Promise<void> {
        await this.setupDevice();
        this.setupBindGroupLayouts();
        this.setupBuffers();
        this.setupDepthBuffer();
        this.setupDecalSystem();
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

    private setupDecalSystem(): void {
        // Create sampleable depth texture (depth32float can be sampled)
        this.depthTexture = this.device.createTexture({
            size: { width: this.canvas.width, height: this.canvas.height },
            format: "depth32float",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });
        this.depthTextureView = this.depthTexture.createView();

        // Decal bind group layout: depth texture + inverse VP matrix + decal bounds
        this.decalBindGroupLayout = this.device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: "depth" }
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" } // Decal data: invViewProj, bounds, color
                }
            ]
        });

        // Decal bounds buffer: invViewProj (64) + 4 corners (64) + color (16) = 144 bytes
        this.decalBoundsBuffer = this.device.createBuffer({
            size: 144,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        // Create decal bind group
        this.decalBindGroup = this.device.createBindGroup({
            layout: this.decalBindGroupLayout,
            entries: [
                { binding: 0, resource: this.depthTextureView },
                { binding: 1, resource: { buffer: this.decalBoundsBuffer } }
            ]
        });
    }

    /**
     * Add a decal projection from 4 corner points
     * Corners are automatically sorted into counter-clockwise order
     */
    addDecal(corners: vec3[], color: [number, number, number, number] = [1, 0, 0, 0.5]): void {
        if (corners.length !== 4) {
            console.error(`Decal requires exactly 4 corners, got ${corners.length}`);
            return;
        }

        // Sort corners into counter-clockwise order
        const sorted = this.sortCornersCounterClockwise(corners);

        this.activeDecals.push({
            corners: sorted,
            color
        });

        console.log(`🎯 Decal added with 4 corners (sorted CCW):`);
        sorted.forEach((c, i) => {
            console.log(`   Corner ${i}: X=${c[0].toFixed(2)}, Y=${c[1].toFixed(2)}, Z=${c[2].toFixed(2)}`);
        });
    }

    /**
     * Sort 4 corner points into counter-clockwise order around their centroid
     */
    private sortCornersCounterClockwise(corners: vec3[]): vec3[] {
        // Calculate centroid
        let cx = 0, cz = 0;
        for (const c of corners) {
            cx += c[0];
            cz += c[2];
        }
        cx /= 4;
        cz /= 4;

        // Calculate angle from centroid for each corner and sort
        const withAngles = corners.map(c => ({
            corner: vec3.clone(c),
            angle: Math.atan2(c[2] - cz, c[0] - cx)
        }));

        // Sort by angle (counter-clockwise)
        withAngles.sort((a, b) => a.angle - b.angle);

        return withAngles.map(w => w.corner);
    }

    /**
     * Clear all decals
     */
    clearDecals(): void {
        this.activeDecals = [];
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

        // Terrain depth-only pipeline (for decal depth pre-pass)
        // Uses depth32float format so it can be sampled by decal shader
        this.terrainDepthPipeline = this.device.createRenderPipeline({
            layout: terrainPipelineLayout,
            vertex: {
                module: this.device.createShaderModule({ code: terrainShader }),
                entryPoint: "vs_main",
                buffers: [STANDARD_BUFFER_LAYOUT]
            },
            fragment: {
                module: this.device.createShaderModule({ code: terrainShader }),
                entryPoint: "fs_main",
                targets: []  // No color output for depth pre-pass
            },
            primitive: {
                topology: 'triangle-list'
            },
            depthStencil: {
                format: "depth32float",
                depthWriteEnabled: true,
                depthCompare: "less-equal"
            }
        });

        // Decal pipeline - fullscreen pass that reads depth and projects decals
        const decalPipelineLayout = this.device.createPipelineLayout({
            bindGroupLayouts: [this.decalBindGroupLayout]
        });

        this.decalPipeline = this.device.createRenderPipeline({
            layout: decalPipelineLayout,
            vertex: {
                module: this.device.createShaderModule({ code: decalShader }),
                entryPoint: "vs_main",
                buffers: [] // Fullscreen triangle generated in shader
            },
            fragment: {
                module: this.device.createShaderModule({ code: decalShader }),
                entryPoint: "fs_main",
                targets: [{
                    format: this.format,
                    blend: {
                        color: {
                            srcFactor: 'src-alpha',
                            dstFactor: 'one-minus-src-alpha',
                            operation: 'add'
                        },
                        alpha: {
                            srcFactor: 'one',
                            dstFactor: 'one-minus-src-alpha',
                            operation: 'add'
                        }
                    }
                }]
            },
            primitive: {
                topology: 'triangle-list'
            }
            // No depthStencil - we read depth as texture
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

        // Calculate inverse view-projection for decals
        const viewProj = mat4.create();
        mat4.multiply(viewProj, projection, viewTransform as mat4);
        const invViewProj = mat4.create();
        mat4.invert(invViewProj, viewProj);

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

        // ========== PASS 1: Depth pre-pass (for decal projection) ==========
        if (this.activeDecals.length > 0 && terrainObjects.length > 0) {
            const depthPass = commandEncoder.beginRenderPass({
                colorAttachments: [],
                depthStencilAttachment: {
                    view: this.depthTextureView,
                    depthClearValue: 1.0,
                    depthLoadOp: 'clear',
                    depthStoreOp: 'store'
                }
            });

            depthPass.setBindGroup(0, this.frameBindGroup);
            depthPass.setPipeline(this.terrainDepthPipeline);

            terrainObjects.forEach((obj) => {
                const instanceIndex = objects.indexOf(obj);
                depthPass.setBindGroup(1, obj.material);
                obj.bind(depthPass);
                obj.draw(depthPass, instanceIndex);
            });

            depthPass.end();
        }

        // ========== PASS 2: Main render pass ==========
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

        renderPass.end();

        // ========== PASS 3: Decal projection pass ==========
        if (this.activeDecals.length > 0) {
            for (const decal of this.activeDecals) {
                // Upload decal data: invViewProj (64) + 4 corners (64) + color (16) = 144 bytes = 36 floats
                const decalData = new Float32Array(36);
                decalData.set(invViewProj, 0);  // 16 floats

                // Corner 0 (XZ stored in xy of vec4)
                decalData[16] = decal.corners[0][0];  // X
                decalData[17] = decal.corners[0][2];  // Z
                decalData[18] = 0;
                decalData[19] = 0;

                // Corner 1
                decalData[20] = decal.corners[1][0];
                decalData[21] = decal.corners[1][2];
                decalData[22] = 0;
                decalData[23] = 0;

                // Corner 2
                decalData[24] = decal.corners[2][0];
                decalData[25] = decal.corners[2][2];
                decalData[26] = 0;
                decalData[27] = 0;

                // Corner 3
                decalData[28] = decal.corners[3][0];
                decalData[29] = decal.corners[3][2];
                decalData[30] = 0;
                decalData[31] = 0;

                console.log(`📐 Decal corners being rendered:`,
                    `C0(${decalData[16].toFixed(2)}, ${decalData[17].toFixed(2)})`,
                    `C1(${decalData[20].toFixed(2)}, ${decalData[21].toFixed(2)})`,
                    `C2(${decalData[24].toFixed(2)}, ${decalData[25].toFixed(2)})`,
                    `C3(${decalData[28].toFixed(2)}, ${decalData[29].toFixed(2)})`
                );

                // Color
                decalData[32] = decal.color[0];
                decalData[33] = decal.color[1];
                decalData[34] = decal.color[2];
                decalData[35] = decal.color[3];

                this.device.queue.writeBuffer(this.decalBoundsBuffer, 0, decalData);

                const decalPass = commandEncoder.beginRenderPass({
                    colorAttachments: [{
                        view: textureView,
                        loadOp: 'load',
                        storeOp: 'store'
                    }]
                });

                decalPass.setPipeline(this.decalPipeline);
                decalPass.setBindGroup(0, this.decalBindGroup);
                decalPass.draw(3);
                decalPass.end();
            }
        }

        this.device.queue.submit([commandEncoder.finish()]);
    }

    /**
     * Resize the renderer (call when canvas size changes)
     */
    resize(): void {
        this.depthStencilBuffer.destroy();
        this.setupDepthBuffer();

        this.depthTexture?.destroy();
        this.setupDecalSystem();

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

