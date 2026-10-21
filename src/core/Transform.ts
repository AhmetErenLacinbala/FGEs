import { mat4, vec3 } from "gl-matrix";

/**
 * Transform - Unified transform component for all objects
 */
export default class Transform {
    position: vec3;
    rotation: vec3; // Euler angles in degrees
    scale: vec3;
    
    private _modelMatrix: mat4;
    private _dirty: boolean = true;

    constructor(
        position: vec3 = vec3.fromValues(0, 0, 0),
        rotation: vec3 = vec3.fromValues(0, 0, 0),
        scale: vec3 = vec3.fromValues(1, 1, 1)
    ) {
        this.position = vec3.clone(position);
        this.rotation = vec3.clone(rotation);
        this.scale = vec3.clone(scale);
        this._modelMatrix = mat4.create();
    }

    /**
     * Set position
     */
    setPosition(x: number, y: number, z: number): this {
        vec3.set(this.position, x, y, z);
        this._dirty = true;
        return this;
    }

    /**
     * Set rotation in degrees
     */
    setRotation(x: number, y: number, z: number): this {
        vec3.set(this.rotation, x, y, z);
        this._dirty = true;
        return this;
    }

    /**
     * Set scale
     */
    setScale(x: number, y: number, z: number): this {
        vec3.set(this.scale, x, y, z);
        this._dirty = true;
        return this;
    }

    /**
     * Translate position
     */
    translate(dx: number, dy: number, dz: number): this {
        this.position[0] += dx;
        this.position[1] += dy;
        this.position[2] += dz;
        this._dirty = true;
        return this;
    }

    /**
     * Rotate by degrees
     */
    rotate(dx: number, dy: number, dz: number): this {
        this.rotation[0] += dx;
        this.rotation[1] += dy;
        this.rotation[2] += dz;
        this._dirty = true;
        return this;
    }

    /**
     * Get the model matrix (recalculates if dirty)
     */
    getModelMatrix(): mat4 {
        if (this._dirty) {
            this._recalculateMatrix();
            this._dirty = false;
        }
        return this._modelMatrix;
    }

    /**
     * Mark transform as needing recalculation
     */
    markDirty(): void {
        this._dirty = true;
    }

    private _recalculateMatrix(): void {
        const deg2rad = (deg: number) => deg * Math.PI / 180;
        
        mat4.identity(this._modelMatrix);
        mat4.translate(this._modelMatrix, this._modelMatrix, this.position);
        mat4.rotateX(this._modelMatrix, this._modelMatrix, deg2rad(this.rotation[0]));
        mat4.rotateY(this._modelMatrix, this._modelMatrix, deg2rad(this.rotation[1]));
        mat4.rotateZ(this._modelMatrix, this._modelMatrix, deg2rad(this.rotation[2]));
        mat4.scale(this._modelMatrix, this._modelMatrix, this.scale);
    }

    /**
     * Clone this transform
     */
    clone(): Transform {
        return new Transform(
            vec3.clone(this.position),
            vec3.clone(this.rotation),
            vec3.clone(this.scale)
        );
    }
}

