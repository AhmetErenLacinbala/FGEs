import { Renderer, POSITION_NORMAL_UV_BUFFER_LAYOUT, type RenderData } from "fges";
import type { vec3 } from "gl-matrix";
import terrainShader from "../view/terrainShader.wgsl?raw";
import terrainPickingShader from "../view/terrainPickingShader.wgsl?raw";
import selectionComputeShader from "../view/selectionCompute.wgsl?raw";

export const SOLAR_TERRAIN_RENDER_TYPE = "solaris-terrain";

const INITIAL_SELECTION_CAPACITY = 10_000;

/** Solaris-owned terrain pipelines layered on top of the generic FGEs renderer. */
export default class SolarTerrainRenderer extends Renderer {
    private terrainMaterialGroupLayout!: GPUBindGroupLayout;
    private blendSettingsBuffer!: GPUBuffer;
    private selectionQuadBuffer!: GPUBuffer;
    private selectionTime = 0;
    private satelliteOpacityValue = 0.1;

    private computeBindGroupLayout!: GPUBindGroupLayout;
    private computeCountPipeline!: GPUComputePipeline;
    private computeWritePipeline!: GPUComputePipeline;
    private computeCountBuffer!: GPUBuffer;
    private computeOutputBuffer!: GPUBuffer;
    private computeOutputCapacity = INITIAL_SELECTION_CAPACITY;
    private computeReadbackBuffer!: GPUBuffer;

    override async init(): Promise<void> {
        await super.init();
        this.setupTerrainResources();
        this.setupTerrainPipelines();
        this.setupSelectionCompute();
    }

    override render(renderData: RenderData): void {
        this.selectionTime += 0.05;
        this.getDevice().queue.writeBuffer(
            this.selectionQuadBuffer,
            36,
            new Float32Array([this.selectionTime]),
        );
        super.render(renderData);
    }

    getTerrainMaterialGroupLayout(): GPUBindGroupLayout {
        return this.terrainMaterialGroupLayout;
    }

    getBlendSettingsBuffer(): GPUBuffer {
        return this.blendSettingsBuffer;
    }

    getSelectionQuadBuffer(): GPUBuffer {
        return this.selectionQuadBuffer;
    }

    updateBlendSettings(opacity: number): void {
        this.satelliteOpacityValue = Math.max(0, Math.min(1, opacity));
        this.getDevice().queue.writeBuffer(
            this.blendSettingsBuffer,
            0,
            new Float32Array([this.satelliteOpacityValue, 0, 0, 0]),
        );
    }

    get satelliteOpacity(): number {
        return this.satelliteOpacityValue;
    }

    toggleSatellite(): void {
        this.updateBlendSettings(this.satelliteOpacityValue > 0 ? 0 : 0.1);
    }

    updateSelectionQuad(points: vec3[] | null): void {
        const data = new Float32Array(12);
        if (points?.length === 4) {
            for (let index = 0; index < 4; index++) {
                data[index * 2] = points[index][0];
                data[index * 2 + 1] = points[index][1];
            }
            data[8] = 1;
            data[9] = this.selectionTime;
        }
        this.getDevice().queue.writeBuffer(this.selectionQuadBuffer, 0, data);
    }

    async runSelectionCompute(
        terrainVertexBuffer: GPUBuffer,
        vertexCount: number,
    ): Promise<Float32Array | null> {
        const device = this.getDevice();
        device.queue.writeBuffer(this.computeCountBuffer, 0, new Uint32Array([0]));

        const countBindGroup = this.createComputeBindGroup(terrainVertexBuffer);
        const workgroupCount = Math.ceil(vertexCount / 256);
        const countEncoder = device.createCommandEncoder();
        const countPass = countEncoder.beginComputePass();
        countPass.setPipeline(this.computeCountPipeline);
        countPass.setBindGroup(0, countBindGroup);
        countPass.dispatchWorkgroups(workgroupCount);
        countPass.end();
        countEncoder.copyBufferToBuffer(
            this.computeCountBuffer,
            0,
            this.computeReadbackBuffer,
            0,
            4,
        );
        device.queue.submit([countEncoder.finish()]);

        await this.computeReadbackBuffer.mapAsync(GPUMapMode.READ);
        const selectedCount = new Uint32Array(
            this.computeReadbackBuffer.getMappedRange().slice(0),
        )[0];
        this.computeReadbackBuffer.unmap();
        if (selectedCount === 0) return null;

        this.ensureComputeOutputCapacity(selectedCount);
        device.queue.writeBuffer(this.computeCountBuffer, 0, new Uint32Array([0]));
        const writeEncoder = device.createCommandEncoder();
        const writePass = writeEncoder.beginComputePass();
        writePass.setPipeline(this.computeWritePipeline);
        writePass.setBindGroup(0, this.createComputeBindGroup(terrainVertexBuffer));
        writePass.dispatchWorkgroups(workgroupCount);
        writePass.end();
        device.queue.submit([writeEncoder.finish()]);

        const outputSize = selectedCount * 3 * Float32Array.BYTES_PER_ELEMENT;
        const outputReadbackBuffer = device.createBuffer({
            size: outputSize,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        });
        const copyEncoder = device.createCommandEncoder();
        copyEncoder.copyBufferToBuffer(
            this.computeOutputBuffer,
            0,
            outputReadbackBuffer,
            0,
            outputSize,
        );
        device.queue.submit([copyEncoder.finish()]);

        await outputReadbackBuffer.mapAsync(GPUMapMode.READ);
        const output = new Float32Array(outputReadbackBuffer.getMappedRange().slice(0));
        outputReadbackBuffer.unmap();
        outputReadbackBuffer.destroy();
        return output;
    }

    override destroy(): void {
        this.blendSettingsBuffer.destroy();
        this.selectionQuadBuffer.destroy();
        this.computeCountBuffer.destroy();
        this.computeOutputBuffer.destroy();
        this.computeReadbackBuffer.destroy();
        super.destroy();
    }

    private setupTerrainResources(): void {
        const device = this.getDevice();
        this.terrainMaterialGroupLayout = device.createBindGroupLayout({
            label: "Solaris terrain material layout",
            entries: [
                { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: {} },
                { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
                { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: {} },
                { binding: 3, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
                { binding: 4, visibility: GPUShaderStage.FRAGMENT, buffer: {} },
                {
                    binding: 5,
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" },
                },
            ],
        });
        this.blendSettingsBuffer = device.createBuffer({
            label: "Solaris satellite blend settings",
            size: 16,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        this.selectionQuadBuffer = device.createBuffer({
            label: "Solaris selection quad",
            size: 48,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        this.updateBlendSettings(this.satelliteOpacityValue);
        device.queue.writeBuffer(this.selectionQuadBuffer, 0, new Float32Array(12));
    }

    private setupTerrainPipelines(): void {
        const device = this.getDevice();
        const renderLayout = device.createPipelineLayout({
            bindGroupLayouts: [this.getFrameGroupLayout(), this.terrainMaterialGroupLayout],
        });
        const terrainModule = device.createShaderModule({ code: terrainShader });
        const renderPipeline = device.createRenderPipeline({
            label: "Solaris terrain pipeline",
            layout: renderLayout,
            vertex: {
                module: terrainModule,
                entryPoint: "vs_main",
                buffers: [POSITION_NORMAL_UV_BUFFER_LAYOUT],
            },
            fragment: {
                module: terrainModule,
                entryPoint: "fs_main",
                targets: [{ format: this.getPresentationFormat() }],
            },
            primitive: { topology: "triangle-list" },
            depthStencil: this.getDepthStencilState(),
        });

        const pickingModule = device.createShaderModule({ code: terrainPickingShader });
        const pickingPipeline = device.createRenderPipeline({
            label: "Solaris terrain picking pipeline",
            layout: device.createPipelineLayout({ bindGroupLayouts: [this.getFrameGroupLayout()] }),
            vertex: {
                module: pickingModule,
                entryPoint: "vs_main",
                buffers: [POSITION_NORMAL_UV_BUFFER_LAYOUT],
            },
            fragment: {
                module: pickingModule,
                entryPoint: "fs_main",
                targets: [{ format: "rgba32float" }],
            },
            primitive: { topology: "triangle-list" },
            depthStencil: { format: "depth24plus", depthWriteEnabled: true, depthCompare: "less-equal" },
        });

        this.registerRenderPipeline({
            renderType: SOLAR_TERRAIN_RENDER_TYPE,
            renderPipeline,
            pickingPipeline,
        });
    }

    private setupSelectionCompute(): void {
        const device = this.getDevice();
        this.computeBindGroupLayout = device.createBindGroupLayout({
            entries: [
                { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
                { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
                { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
                { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
            ],
        });
        const layout = device.createPipelineLayout({ bindGroupLayouts: [this.computeBindGroupLayout] });
        const module = device.createShaderModule({ code: selectionComputeShader });
        this.computeCountPipeline = device.createComputePipeline({
            layout,
            compute: { module, entryPoint: "count_main" },
        });
        this.computeWritePipeline = device.createComputePipeline({
            layout,
            compute: { module, entryPoint: "write_main" },
        });
        this.computeCountBuffer = device.createBuffer({
            size: 4,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
        });
        this.computeOutputBuffer = this.createComputeOutputBuffer(this.computeOutputCapacity);
        this.computeReadbackBuffer = device.createBuffer({
            size: 4,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        });
    }

    private createComputeBindGroup(terrainVertexBuffer: GPUBuffer): GPUBindGroup {
        return this.getDevice().createBindGroup({
            layout: this.computeBindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: this.selectionQuadBuffer } },
                { binding: 1, resource: { buffer: terrainVertexBuffer } },
                { binding: 2, resource: { buffer: this.computeCountBuffer } },
                { binding: 3, resource: { buffer: this.computeOutputBuffer } },
            ],
        });
    }

    private ensureComputeOutputCapacity(selectedCount: number): void {
        if (selectedCount <= this.computeOutputCapacity) return;
        this.computeOutputCapacity = 2 ** Math.ceil(Math.log2(selectedCount));
        this.computeOutputBuffer.destroy();
        this.computeOutputBuffer = this.createComputeOutputBuffer(this.computeOutputCapacity);
    }

    private createComputeOutputBuffer(capacity: number): GPUBuffer {
        return this.getDevice().createBuffer({
            size: capacity * 3 * Float32Array.BYTES_PER_ELEMENT,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
        });
    }
}
