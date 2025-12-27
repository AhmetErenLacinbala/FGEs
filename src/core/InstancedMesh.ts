import { vec3 } from "gl-matrix";
import { MeshData } from "./MeshData";
import Transform from "./Transform";
import { RenderType } from "./RenderableObject";

/**
 * Configuration for a single instance
 */
export interface InstanceConfig {
    position?: [number, number, number];
    rotation?: [number, number, number];  // Euler angles in degrees
    scale?: [number, number, number];
}

/**
 * Submesh with its material
 */
export interface Submesh {
    mesh: MeshData;
    material: GPUBindGroup;
}

/**
 * InstancedMesh - True GPU instancing for thousands of identical objects
 * 
 * Supports multiple submeshes - each submesh is drawn with all instances.
 * All submeshes share the same transform data.
 * 
 * Usage:
 * ```typescript
 * // Single mesh
 * const trees = new InstancedMesh({
 *   device,
 *   mesh: treeMesh,
 *   material: treeMaterial,
 *   maxInstances: 10000
 * });
 * 
 * // Multiple submeshes (from GLTF)
 * const meshes = await MeshFactory.fromGLTF(device, "model.glb");
 * const panels = new InstancedMesh({
 *   device,
 *   submeshes: meshes.map(mesh => ({ mesh, material: panelMaterial })),
 *   maxInstances: 1000
 * });
 * 
 * // Add instances (shared by all submeshes)
 * for (let i = 0; i < 100; i++) {
 *   panels.addInstance({
 *     position: [Math.random() * 100, 0, Math.random() * 100],
 *     rotation: [0, Math.random() * 360, 0]
 *   });
 * }
 * 
 * panels.updateBuffer();
 * scene.addInstanced(panels);
 * ```
 */
export default class InstancedMesh {
    readonly submeshes: Submesh[];
    readonly renderType: RenderType;

    private device: GPUDevice;
    private maxInstances: number;
    private instanceCount: number = 0;

    // CPU-side instance data (shared by all submeshes)
    private transforms: Transform[] = [];
    private instanceMatrices: Float32Array;

    // GPU buffer for instance matrices
    private instanceBuffer: GPUBuffer;
    private needsUpdate: boolean = false;

    visible: boolean = true;

    constructor(config: {
        device: GPUDevice;
        maxInstances?: number;
        renderType?: RenderType;
    } & (
            // Option 1: Single mesh + material
            { mesh: MeshData; material: GPUBindGroup; submeshes?: never } |
            // Option 2: Array of submeshes
            { submeshes: Submesh[]; mesh?: never; material?: never }
        )) {
        this.device = config.device;
        this.maxInstances = config.maxInstances ?? 1000;
        this.renderType = config.renderType ?? RenderType.Standard;

        // Handle both single mesh and submeshes array
        if (config.submeshes) {
            this.submeshes = config.submeshes;
        } else if (config.mesh && config.material) {
            this.submeshes = [{ mesh: config.mesh, material: config.material }];
        } else {
            throw new Error("InstancedMesh: Must provide either 'mesh'+'material' or 'submeshes'");
        }

        // Pre-allocate instance matrix array (16 floats per matrix)
        this.instanceMatrices = new Float32Array(this.maxInstances * 16);

        // Create GPU buffer for instance matrices
        this.instanceBuffer = this.device.createBuffer({
            size: this.maxInstances * 16 * 4, // 16 floats * 4 bytes
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            label: 'InstancedMesh instance buffer'
        });
    }

    /**
     * Get submesh count
     */
    getSubmeshCount(): number {
        return this.submeshes.length;
    }

    /**
     * Get first submesh's material (for compatibility)
     */
    get material(): GPUBindGroup {
        return this.submeshes[0]?.material;
    }

    /**
     * Get first submesh's mesh (for compatibility)
     */
    get mesh(): MeshData {
        return this.submeshes[0]?.mesh;
    }

    /**
     * Add a new instance (applies to ALL submeshes)
     * @returns Instance index, or -1 if max instances reached
     */
    addInstance(config: InstanceConfig = {}): number {
        if (this.instanceCount >= this.maxInstances) {
            console.warn(`InstancedMesh: Max instances (${this.maxInstances}) reached`);
            return -1;
        }

        const transform = new Transform(
            config.position ? vec3.fromValues(...config.position) : undefined,
            config.rotation ? vec3.fromValues(...config.rotation) : undefined,
            config.scale ? vec3.fromValues(...config.scale) : undefined
        );

        this.transforms.push(transform);
        this.needsUpdate = true;
        return this.instanceCount++;
    }

    /**
     * Add multiple instances at once
     */
    addInstances(configs: InstanceConfig[]): number[] {
        return configs.map(c => this.addInstance(c));
    }

    /**
     * Update a specific instance's transform
     */
    updateInstance(index: number, config: Partial<InstanceConfig>): void {
        if (index < 0 || index >= this.instanceCount) return;

        const transform = this.transforms[index];
        if (config.position) {
            transform.position = vec3.fromValues(...config.position);
        }
        if (config.rotation) {
            transform.rotation = vec3.fromValues(...config.rotation);
        }
        if (config.scale) {
            transform.scale = vec3.fromValues(...config.scale);
        }
        this.needsUpdate = true;
    }

    /**
     * Get transform for a specific instance
     */
    getTransform(index: number): Transform | null {
        return this.transforms[index] ?? null;
    }

    /**
     * Remove an instance (swaps with last for O(1) removal)
     */
    removeInstance(index: number): void {
        if (index < 0 || index >= this.instanceCount) return;

        // Swap with last element
        if (index < this.instanceCount - 1) {
            this.transforms[index] = this.transforms[this.instanceCount - 1];
        }
        this.transforms.pop();
        this.instanceCount--;
        this.needsUpdate = true;
    }

    /**
     * Clear all instances
     */
    clear(): void {
        this.transforms = [];
        this.instanceCount = 0;
        this.needsUpdate = true;
    }

    /**
     * Update the GPU buffer with current instance data
     * Only runs when instances have changed (needsUpdate = true)
     */
    updateBuffer(): void {
        // Skip if no changes or no instances
        if (!this.needsUpdate) return;
        if (this.instanceCount === 0) {
            this.needsUpdate = false;
            return;
        }

        // Build instance matrix array
        for (let i = 0; i < this.instanceCount; i++) {
            const matrix = this.transforms[i].getModelMatrix();
            this.instanceMatrices.set(matrix, i * 16);
        }

        // Upload to GPU
        this.device.queue.writeBuffer(
            this.instanceBuffer,
            0,
            this.instanceMatrices.buffer,
            0,
            this.instanceCount * 16 * 4  // bytes
        );

        this.needsUpdate = false;
    }

    /**
     * Get the instance buffer for binding
     */
    getInstanceBuffer(): GPUBuffer {
        return this.instanceBuffer;
    }

    /**
     * Get current instance count
     */
    getInstanceCount(): number {
        return this.instanceCount;
    }

    /**
     * Bind a specific submesh's buffers to the render pass
     */
    bindSubmesh(renderPass: GPURenderPassEncoder, submeshIndex: number): void {
        const submesh = this.submeshes[submeshIndex];
        if (!submesh) return;

        renderPass.setVertexBuffer(0, submesh.mesh.vertexBuffer);
        if (submesh.mesh.useIndexBuffer && submesh.mesh.indexBuffer) {
            renderPass.setIndexBuffer(submesh.mesh.indexBuffer, 'uint32');
        }
    }

    /**
     * Draw a specific submesh with all instances
     */
    drawSubmesh(renderPass: GPURenderPassEncoder, submeshIndex: number): void {
        if (this.instanceCount === 0 || !this.visible) return;

        const submesh = this.submeshes[submeshIndex];
        if (!submesh) return;

        if (submesh.mesh.useIndexBuffer) {
            renderPass.drawIndexed(
                submesh.mesh.indexCount,
                this.instanceCount,
                0,
                0,
                0
            );
        } else {
            renderPass.draw(
                submesh.mesh.vertexCount,
                this.instanceCount,
                0,
                0
            );
        }
    }

    /**
     * Draw ALL submeshes with all instances
     * Each submesh = 1 draw call, all instances drawn per call
     */
    drawAll(renderPass: GPURenderPassEncoder): void {
        if (this.instanceCount === 0 || !this.visible) return;

        for (let i = 0; i < this.submeshes.length; i++) {
            const submesh = this.submeshes[i];

            // Bind material for this submesh
            renderPass.setBindGroup(1, submesh.material);

            // Bind mesh buffers
            this.bindSubmesh(renderPass, i);

            // Draw all instances of this submesh
            this.drawSubmesh(renderPass, i);
        }
    }

    // Legacy compatibility methods
    bind(renderPass: GPURenderPassEncoder): void {
        this.bindSubmesh(renderPass, 0);
    }

    draw(renderPass: GPURenderPassEncoder): void {
        this.drawSubmesh(renderPass, 0);
    }

    /**
     * Cleanup GPU resources
     */
    destroy(): void {
        this.instanceBuffer.destroy();
    }
}
