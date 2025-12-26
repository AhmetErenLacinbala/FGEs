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

        // Add all panel submeshes
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

        // Example 2: Create spinning triangles
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

        console.log(`✅ Scene initialized with ${this.scene.count} objects`);
    }

    /**
     * Main render loop
     */
    run = (): void => {
        // Update movement
        this.scene.moveCamera(this.forwardsAmount, this.rightAmount, this.upAmount);

        // Update scene
        this.scene.update();

        // Render
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

        const rect = this.canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        this.renderer.renderPickingPass(this.scene.getRenderData());
        const worldPos = await this.renderer.readWorldPosition(x, y);

        if (worldPos && this.billboardPositions.length < 4) {
            this.billboardPositions.push(worldPos);
            await this.spawnBillboard(worldPos);
        }
        if (this.billboardPositions.length === 4) {
            this.createTerrainDecal(this.billboardPositions);
            this.billboardPositions = [];
        }
    }

    private billboardMaterial: { bindGroup: GPUBindGroup } | null = null;

    /**
     * Create a decal that projects onto terrain using depth buffer
     */
    createTerrainDecal(corners: vec3[]): void {
        this.renderer.addDecal(corners, [1, 0, 0, 0.5]);
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

