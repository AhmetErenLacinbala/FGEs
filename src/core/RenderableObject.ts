import { mat4 } from "gl-matrix";
import { MeshData } from "./MeshData";
import Transform from "./Transform";

/**
 * Render pipeline type for objects
 */
export enum RenderType {
    /** Standard rendering with basic shader */
    Standard = 'standard',
    /** Terrain with dual-texture blending (GHI + Satellite) */
    Terrain = 'terrain',
    /** Billboard that always faces camera */
    Billboard = 'billboard',
    /** Decal projected onto terrain surface (like a shadow) */
    Decal = 'decal'
}

/**
 * RenderableObject - Unified renderable entity
 * 
 * Combines mesh, material, and transform into a single object that can be
 * added to the scene and rendered automatically.
 * 
 * Usage:
 *   const obj = new RenderableObject({
 *     mesh: await MeshFactory.fromGLTF(device, "model.glb"),
 *     material: materialBindGroup,
 *     transform: new Transform([0, 0, 0]),
 *     renderType: RenderType.Standard
 *   });
 *   scene.add(obj);
 */

export interface RenderableObjectConfig {
    mesh: MeshData;
    material: GPUBindGroup;
    transform?: Transform;
    visible?: boolean;
    /** Render pipeline type (default: Standard) */
    renderType?: RenderType;
    /** Optional update callback called each frame */
    onUpdate?: (obj: RenderableObject, deltaTime: number) => void;
}

export default class RenderableObject {
    private static _idCounter = 0;

    readonly id: number;
    mesh: MeshData;
    material: GPUBindGroup;
    transform: Transform;
    visible: boolean;
    renderType: RenderType;
    onUpdate?: (obj: RenderableObject, deltaTime: number) => void;

    constructor(config: RenderableObjectConfig) {
        this.id = RenderableObject._idCounter++;
        this.mesh = config.mesh;
        this.material = config.material;
        this.transform = config.transform ?? new Transform();
        this.visible = config.visible ?? true;
        this.renderType = config.renderType ?? RenderType.Standard;
        this.onUpdate = config.onUpdate;
    }

    /**
     * Get the model matrix for this object
     */
    getModelMatrix(): mat4 {
        return this.transform.getModelMatrix();
    }

    /**
     * Update this object (called each frame by the scene)
     */
    update(deltaTime: number = 0): void {
        if (this.onUpdate) {
            this.onUpdate(this, deltaTime);
        }
    }

    /**
     * Bind this object's vertex/index buffers to the render pass
     */
    bind(renderPass: GPURenderPassEncoder): void {
        renderPass.setVertexBuffer(0, this.mesh.vertexBuffer);
        if (this.mesh.useIndexBuffer && this.mesh.indexBuffer) {
            renderPass.setIndexBuffer(this.mesh.indexBuffer, 'uint32');
        }
    }

    /**
     * Issue draw call for this object
     */
    draw(renderPass: GPURenderPassEncoder, instanceOffset: number = 0): void {
        if (this.mesh.useIndexBuffer) {
            renderPass.drawIndexed(
                this.mesh.indexCount,
                1,              // instance count
                0,              // first index
                0,              // base vertex
                instanceOffset  // first instance
            );
        } else {
            renderPass.draw(
                this.mesh.vertexCount,
                1,              // instance count
                0,              // first vertex
                instanceOffset  // first instance
            );
        }
    }

    /**
     * Set visibility
     */
    setVisible(visible: boolean): this {
        this.visible = visible;
        return this;
    }

    /**
     * Update material bind group (e.g., for dynamic textures)
     */
    setMaterial(material: GPUBindGroup): this {
        this.material = material;
        return this;
    }

    /**
     * Cleanup GPU resources
     */
    destroy(): void {
        this.mesh.vertexBuffer.destroy();
        if (this.mesh.indexBuffer) {
            this.mesh.indexBuffer.destroy();
        }
    }
}

