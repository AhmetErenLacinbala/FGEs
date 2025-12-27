/**
 * Core module - Simplified rendering architecture
 * 
 * Usage:
 * ```typescript
 * import { 
 *   Renderer, Scene, RenderableObject, 
 *   MeshFactory, MaterialFactory, Transform 
 * } from './core';
 * 
 * // Initialize
 * const renderer = new Renderer(canvas);
 * await renderer.init();
 * const scene = new Scene();
 * 
 * // Create objects easily
 * const vase = new RenderableObject({
 *   mesh: await MeshFactory.fromGLTF(renderer.getDevice(), "models/vase.glb"),
 *   material: (await MaterialFactory.fromTexture(
 *     renderer.getDevice(), 
 *     "img/texture.jpg", 
 *     renderer.getMaterialGroupLayout()
 *   )).bindGroup,
 *   transform: new Transform([0, 0, 0], [0, 45, 0])
 * });
 * scene.add(vase);
 * 
 * // Add behavior
 * vase.onUpdate = (obj, dt) => obj.transform.rotate(0, 30 * dt, 0);
 * 
 * // Render loop
 * function render() {
 *   scene.update();
 *   renderer.render(scene.getRenderData());
 *   requestAnimationFrame(render);
 * }
 * render();
 * ```
 */

export { default as Renderer } from './Renderer';
export { default as Scene, type RenderData } from './Scene';
export { default as RenderableObject, RenderType, type RenderableObjectConfig } from './RenderableObject';
export { default as InstancedMesh, type InstanceConfig, type Submesh } from './InstancedMesh';
export { default as MeshFactory } from './MeshFactory';
export { default as MaterialFactory, type MaterialBindGroup } from './MaterialFactory';
export { default as Transform } from './Transform';
export {
    type MeshData,
    createMeshData,
    destroyMeshData,
    STANDARD_BUFFER_LAYOUT
} from './MeshData';

