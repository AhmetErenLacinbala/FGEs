/**
 * App - Refactored application using the new simplified architecture
 * 
 * Demonstrates the new API where adding objects is much simpler.
 */

import $ from "jquery";
import { vec3 } from "gl-matrix";
import {
    Renderer,
    Scene,
    RenderableObject,
    InstancedMesh,
    MeshFactory,
    MaterialFactory,
    Transform,
    RenderType
} from "../core";

export default class App {
    canvas: HTMLCanvasElement;
    renderer: Renderer;
    scene: Scene;

    // UI labels
    keyLabel: HTMLElement;
    mouseXLabel: HTMLElement;
    mouseYLabel: HTMLElement;

    // Movement
    forwardsAmount: number = 0;
    rightAmount: number = 0;
    upAmount: number = 0;

    // Camera control state
    cameraControlActive: boolean = false;

    billboardPositions: vec3[] = [];
    quadCreated: boolean = false;  // Once quad is created, no more billboards

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.renderer = new Renderer(canvas);
        this.scene = new Scene();

        this.keyLabel = document.getElementById('keyboardKey')!;
        this.mouseXLabel = document.getElementById('mousex')!;
        this.mouseYLabel = document.getElementById('mousey')!;

        $(document).on("keydown", (e) => this.handleKeyPress(e));
        $(document).on("keyup", (e) => this.handleKeyRelease(e));
        this.canvas.addEventListener("mousemove", (e) => this.handleMouseMove(e));
        this.canvas.addEventListener("click", (e) => this.handleClick(e));

        // Listen for pointer lock changes
        document.addEventListener('pointerlockchange', () => {
            this.cameraControlActive = document.pointerLockElement === this.canvas;
            console.log(`🎮 Camera control: ${this.cameraControlActive ? 'ON' : 'OFF'}`);
        });

        // Handle window resize
        window.addEventListener('resize', () => this.resizeCanvas());
    }

    async init(): Promise<void> {
        // Set initial canvas size
        this.resizeCanvas();

        await this.renderer.init();
        await this.createInitialObjects();
    }

    private resizeCanvas(): void {
        const container = this.canvas.parentElement;
        if (!container) return;

        const width = container.clientWidth;
        const height = container.clientHeight;

        if (this.canvas.width !== width || this.canvas.height !== height) {
            this.canvas.width = width;
            this.canvas.height = height;
            if (this.renderer.getDevice()) {
                this.renderer.resize();
            }

            console.log(`📐 Canvas resized to ${width}x${height}`);
        }
    }

    /**
     * Create initial scene objects
     * 
     * This demonstrates the new simplified API:
     * - Just create a mesh (from GLTF, primitives, or heightmap)
     * - Create a material (from texture, color, or GHI data)
     * - Combine them with a transform
     * - Add to scene
     */
    private async createInitialObjects(): Promise<void> {
        const device = this.renderer.getDevice();
        const layout = this.renderer.getMaterialGroupLayout();

        const vaseMeshes = await MeshFactory.fromGLTF(device, "models/flat_vase.glb");
        const vaseMaterial = await MaterialFactory.fromTexture(device, "img/floor.jpg", layout);
        const panelMeshes = await MeshFactory.fromGLTF(device, "models/panel.glb");
        const panelMaterial = await MaterialFactory.fromTexture(device, "img/panelbaked.png", layout);

        // Add panel submeshes
        for (const mesh of panelMeshes) {
            const panel = new RenderableObject({
                mesh,
                material: panelMaterial.bindGroup,
                transform: new Transform(
                    vec3.fromValues(0, 1, 2),
                    vec3.fromValues(0, 45, 90),
                    vec3.fromValues(0.01, 0.01, 0.01)
                ),
            });
            this.scene.add(panel);
        }

        // Add vase with first submesh (or loop if multiple)
        const vaseMesh = vaseMeshes[0];
        const vase = new RenderableObject({
            mesh: vaseMesh,
            material: vaseMaterial.bindGroup,
            transform: new Transform(
                vec3.fromValues(0, 0, 0),
                vec3.fromValues(0, 0, 0),
                vec3.fromValues(1, 1, 1)
            ),
            onUpdate: (obj, _dt) => {
                obj.transform.rotate(0, 0, 6);
            }
        });
        const vase2 = new RenderableObject({
            mesh: vaseMesh,
            material: vaseMaterial.bindGroup,
            transform: new Transform(
                vec3.fromValues(0, 0, 0.5),
                vec3.fromValues(0, 0, 0),
                vec3.fromValues(1, 1, 1)
            ),
            onUpdate: (obj, _dt) => {
                obj.transform.rotate(0, 0, 6);
            }
        });
        this.scene.add(vase);
        this.scene.add(vase2);

        const billboardMesh = MeshFactory.quad(device);

        //const material = await MaterialFactory.fromColor(device, [1, 0, 0, 1], layout);
        const billboardMaterial = await MaterialFactory.fromColor(device, [1, 0, 0, 1], layout);

        const billboard = new RenderableObject({
            mesh: billboardMesh,
            material: billboardMaterial.bindGroup,
            renderType: RenderType.Billboard,
            transform: new Transform(
                vec3.fromValues(2, 1, 3),
                vec3.fromValues(0, 0, 0)
            )
        });
        this.scene.add(billboard);

        //Create spinning triangles
        for (let y = -5; y <= 5; y++) {
            const triangleMesh = MeshFactory.triangle(device);
            const triangleMaterial = await MaterialFactory.fromTexture(device, "img/floor.jpg", layout);

            const triangle = new RenderableObject({
                mesh: triangleMesh,
                material: triangleMaterial.bindGroup,
                transform: new Transform(
                    vec3.fromValues(2, y, 0),
                    vec3.fromValues(0, 0, 0)
                ),
                onUpdate: (obj, _dt) => {
                    obj.transform.rotate(0, 0, 6);
                }
            });
            this.scene.add(triangle);
        }

        //Instancing - 100 quads 
        /*const instancedQuadMesh = MeshFactory.quad(device, 0.5);
        const instancedMaterial = await MaterialFactory.fromColor(device, [0.2, 0.8, 0.3, 1], layout);

        const instancedQuads = new InstancedMesh({
            device,
            mesh: instancedQuadMesh,
            material: instancedMaterial.bindGroup,
            maxInstances: 1000
        });*/

        // Scatter 100 quads randomly
        /* for (let i = 0; i < 100; i++) {
             instancedQuads.addInstance({
                 position: [
                     (Math.random() - 0.5) * 20,  // X: -10 to 10
                     Math.random() * 5,            // Y: 0 to 5
                     (Math.random() - 0.5) * 20   // Z: -10 to 10
                 ],
                 rotation: [
                     Math.random() * 360,
                     Math.random() * 360,
                     Math.random() * 360
                 ],
                 scale: [0.3, 0.3, 0.3]
             });
         }
 
         instancedQuads.updateBuffer();
         this.scene.addInstanced(instancedQuads);
 
         // Submesh support
         const instPanelMeshes = await MeshFactory.fromGLTF(device, "models/panel.glb");
         const instPanelMaterial = await MaterialFactory.fromTexture(device, "img/panelbaked.png", layout);
 
         const instancedPanels = new InstancedMesh({
             device,
             submeshes: instPanelMeshes.map(mesh => ({
                 mesh,
                 material: instPanelMaterial.bindGroup
             })),
             maxInstances: 10000
         });

         for (let i = 0; i < 5000; i++) {
             instancedPanels.addInstance({
                 position: [
                     (Math.random() - 0.5) * 20,
                     Math.random() * 5,
                     (Math.random() - 0.5) * 20
                 ],
                 rotation: [
                     Math.random() * 360,
                     Math.random() * 360,
                     Math.random() * 360
                 ],
                 scale: [0.01, 0.01, 0.01]
             });
         }
 
         instancedPanels.updateBuffer();
         this.scene.addInstanced(instancedPanels);*/


    }

    /**
     * Main render loop
     */
    run = (): void => {
        this.scene.moveCamera(this.forwardsAmount, this.rightAmount, this.upAmount);
        this.scene.update();
        this.renderer.render(this.scene.getRenderData());
        requestAnimationFrame(this.run);
    }




    // Input handlers
    handleKeyPress(event: JQuery.KeyDownEvent): void {
        this.keyLabel.innerHTML = event.code;

        // Toggle camera control with C key
        if (event.code === "KeyC") {
            this.toggleCameraControl();
            return;
        }

        // Only process movement when camera control is active
        if (!this.cameraControlActive) return;

        switch (event.code) {
            case "KeyW": this.forwardsAmount = 0.1; break;
            case "KeyS": this.forwardsAmount = -0.1; break;
            case "KeyA": this.rightAmount = -0.1; break;
            case "KeyD": this.rightAmount = 0.1; break;
            case "KeyE": this.upAmount = 0.1; break;
            case "KeyQ": this.upAmount = -0.1; break;
        }
    }

    handleKeyRelease(event: JQuery.KeyUpEvent): void {
        this.keyLabel.innerHTML = event.code;

        switch (event.code) {
            case "KeyW":
            case "KeyS": this.forwardsAmount = 0; break;
            case "KeyA":
            case "KeyD": this.rightAmount = 0; break;
            case "KeyE":
            case "KeyQ": this.upAmount = 0; break;
        }
    }

    handleMouseMove(event: MouseEvent): void {
        this.mouseXLabel.innerHTML = event.clientX.toString();
        this.mouseYLabel.innerHTML = event.clientY.toString();

        // Only rotate camera when control is active
        if (this.cameraControlActive) {
            this.scene.spinCamera(event.movementX / 10, -event.movementY / 10);
        }
    }

    toggleCameraControl(): void {
        if (this.cameraControlActive) {
            document.exitPointerLock();
        } else {
            this.canvas.requestPointerLock();
        }
    }

    async handleClick(event: MouseEvent): Promise<void> {
        if (this.cameraControlActive) return;

        // Quad already created - no more billboards allowed
        if (this.quadCreated) {
            console.log(`⛔ Quad already created, no more billboards`);
            return;
        }

        const rect = this.canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        // Get world position from picking
        this.renderer.renderPickingPass(this.scene.getRenderData());
        const worldPos = await this.renderer.readWorldPosition(x, y);

        if (!worldPos) {
            console.log(`❌ Click at (${x.toFixed(0)}, ${y.toFixed(0)}) - no terrain hit`);
            return;
        }

        // Spawn billboard at clicked position
        this.billboardPositions.push(vec3.clone(worldPos));
        await this.spawnBillboard(worldPos);
        console.log(`📍 Billboard ${this.billboardPositions.length}/4 at (${worldPos[0].toFixed(2)}, ${worldPos[1].toFixed(2)}, ${worldPos[2].toFixed(2)})`);

        // When 4 billboards placed, create quad
        if (this.billboardPositions.length === 4) {
            await this.createQuadFromPoints(this.billboardPositions);
            this.quadCreated = true;
            console.log(`✅ Quad created! No more billboards allowed.`);
        }
    }

    private billboardMaterial: { bindGroup: GPUBindGroup } | null = null;
    private quadMaterial: { bindGroup: GPUBindGroup } | null = null;

    /**
     * Create a quad from 4 corner points using standard shader
     */
    async createQuadFromPoints(corners: vec3[]): Promise<void> {
        console.log(`🔷 createQuadFromPoints called with:`, corners.map(c => `(${c[0].toFixed(2)}, ${c[1].toFixed(2)}, ${c[2].toFixed(2)})`));

        const device = this.renderer.getDevice();
        const layout = this.renderer.getMaterialGroupLayout();

        if (!this.quadMaterial) {
            this.quadMaterial = await MaterialFactory.fromColor(device, [1, 0.2, 0.2, 1], layout);
        }

        // Create quad mesh from the 4 points
        const mesh = MeshFactory.customQuad(device, corners);
        console.log(`   Mesh created: ${mesh.vertexCount} vertices, ${mesh.indexCount} indices`);

        const quad = new RenderableObject({
            mesh,
            material: this.quadMaterial.bindGroup,
            renderType: RenderType.Standard,
            transform: new Transform()
        });

        this.scene.add(quad);
        console.log(`✅ Quad added to scene`);
    }

    async spawnBillboard(position: vec3): Promise<void> {
        const device = this.renderer.getDevice();
        const layout = this.renderer.getMaterialGroupLayout();

        if (!this.billboardMaterial) {
            this.billboardMaterial = await MaterialFactory.fromColor(device, [1, 0.3, 0, 1], layout);
        }

        const mesh = MeshFactory.quad(device, 0.3);

        const billboard = new RenderableObject({
            mesh,
            material: this.billboardMaterial.bindGroup,
            renderType: RenderType.Billboard,
            transform: new Transform(
                vec3.fromValues(position[0], position[1] + 0.15, position[2]),
                vec3.fromValues(0, 0, 0),
                vec3.fromValues(1, 1, 1)
            )
        });

        this.scene.add(billboard);
        console.log(` Billboard at (${position[0].toFixed(2)}, ${position[1].toFixed(2)}, ${position[2].toFixed(2)})`);
    }
}

