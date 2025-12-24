import { mat4, vec3 } from "gl-matrix";
import Camera from "../model/camera";
import RenderableObject from "./RenderableObject";

/**
 * Render data passed to the renderer each frame
 */
export interface RenderData {
    viewTransform: mat4;
    objects: RenderableObject[];
}

/**
 * Scene - Simplified scene management
 * 
 * Just add objects and the scene handles updating and rendering them.
 * 
 * Usage:
 *   const scene = new Scene();
 *   scene.add(myObject);
 *   scene.add(anotherObject);
 *   
 *   // In render loop:
 *   scene.update(deltaTime);
 *   renderer.render(scene.getRenderData());
 */
export default class Scene {
    private _objects: Map<number, RenderableObject> = new Map();
    private _camera: Camera;
    private _lastTime: number = 0;

    constructor() {
        this._camera = new Camera([-10, 0, 1], 0, 0);
    }

    /**
     * Add an object to the scene
     */
    add(object: RenderableObject): this {
        this._objects.set(object.id, object);
        console.log(`Scene: Added object ${object.id}`);
        return this;
    }

    /**
     * Remove an object from the scene
     */
    remove(object: RenderableObject): this {
        this._objects.delete(object.id);
        return this;
    }

    /**
     * Remove object by ID
     */
    removeById(id: number): this {
        this._objects.delete(id);
        return this;
    }

    /**
     * Get object by ID
     */
    get(id: number): RenderableObject | undefined {
        return this._objects.get(id);
    }

    /**
     * Check if scene contains object
     */
    has(object: RenderableObject): boolean {
        return this._objects.has(object.id);
    }

    /**
     * Get all objects
     */
    getAll(): RenderableObject[] {
        return Array.from(this._objects.values());
    }

    /**
     * Get visible objects only
     */
    getVisible(): RenderableObject[] {
        return this.getAll().filter(obj => obj.visible);
    }

    /**
     * Get object count
     */
    get count(): number {
        return this._objects.size;
    }

    /**
     * Update all objects
     */
    update(): void {
        const now = performance.now();
        const deltaTime = this._lastTime ? (now - this._lastTime) / 1000 : 0;
        this._lastTime = now;

        for (const object of this._objects.values()) {
            object.update(deltaTime);
        }

        this._camera.update();
    }

    /**
     * Get data needed for rendering
     */
    getRenderData(): RenderData {
        return {
            viewTransform: this._camera.getView(),
            objects: this.getVisible()
        };
    }

    /**
     * Get camera
     */
    get camera(): Camera {
        return this._camera;
    }

    /**
     * Spin the camera (mouse look)
     */
    spinCamera(dX: number, dY: number): void {
        this._camera.eulers[2] -= dX;
        this._camera.eulers[2] %= 360;
        this._camera.eulers[1] = Math.min(89, Math.max(-89, this._camera.eulers[1] + dY));
    }

    /**
     * Move the camera
     */
    moveCamera(forwards: number, right: number, up: number): void {
        vec3.scaleAndAdd(
            this._camera.position, 
            this._camera.position, 
            this._camera.forwards, 
            forwards
        );
        vec3.scaleAndAdd(
            this._camera.position, 
            this._camera.position, 
            this._camera.right, 
            right
        );
        vec3.scaleAndAdd(
            this._camera.position, 
            this._camera.position, 
            this._camera.up, 
            up
        );
    }

    /**
     * Clear all objects from scene
     */
    clear(): void {
        for (const object of this._objects.values()) {
            object.destroy();
        }
        this._objects.clear();
    }

    /**
     * Find objects matching a predicate
     */
    find(predicate: (obj: RenderableObject) => boolean): RenderableObject[] {
        return this.getAll().filter(predicate);
    }
}

