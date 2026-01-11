
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
    RenderType,
    MeshData
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

    // FPS tracking
    private lastFrameTime: number = 0;
    private frameCount: number = 0;
    private fpsElement: HTMLElement | null = null;

    // Camera control state
    cameraControlActive: boolean = false;

    billboardPositions: vec3[] = [];
    billboardObjects: RenderableObject[] = [];
    quadCreated: boolean = false;

    // Terrain compute info
    private terrainVertexBuffer: GPUBuffer | null = null;
    private terrainVertexCount: number = 0;

    private panelMeshes: MeshData[] | null = null;
    private panelMaterial: { bindGroup: GPUBindGroup } | null = null;
    private panelInstances: InstancedMesh | null = null;

    // Instance test
    private testInstancedMesh: InstancedMesh | null = null;

    private terrainMetadata: {
        bounds: { west: number; south: number; east: number; north: number };
        worldSize: number;
    } | null = null;

    private ghiData: {
        data: Float32Array;
        width: number;
        height: number;
        minGHI: number;
        maxGHI: number;
    } | null = null;

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

        // Panel visibility toggle
        const showPanelsCheckbox = document.getElementById('show-panels') as HTMLInputElement;
        if (showPanelsCheckbox) {
            showPanelsCheckbox.addEventListener('change', () => {
                this.togglePanelVisibility(showPanelsCheckbox.checked);
            });
        }
    }

    async init(): Promise<void> {
        // Set initial canvas size
        this.resizeCanvas();

        await this.renderer.init();
        await this.createInitialObjects();

        this.panelMeshes = await MeshFactory.fromGLTF(this.renderer.getDevice(), "models/panel.glb");
        this.panelMaterial = await MaterialFactory.fromTexture(this.renderer.getDevice(), "img/panelbaked.png", this.renderer.getMaterialGroupLayout());


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

        // Small circular billboard marker
        const billboardMesh = MeshFactory.quad(device, 0.15);
        const billboardMaterial = await MaterialFactory.fromColor(device, [1, 0.2, 0, 1], layout);

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



        // Submesh support
        const instPanelMeshes = await MeshFactory.fromGLTF(device, "models/flat_vase.glb");
        const instPanelMaterial = await MaterialFactory.fromTexture(device, "img/floor.jpg", layout);

        this.testInstancedMesh = new InstancedMesh({
            device,
            submeshes: instPanelMeshes.map(mesh => ({
                mesh,
                material: instPanelMaterial.bindGroup
            })),
            maxInstances: 10000
        });

        this.setTestInstanceCount(0);
        this.scene.addInstanced(this.testInstancedMesh);

        // Setup instance test buttons
        this.setupInstanceTestButtons();


    }

    /**
     * Main render loop
     */
    run = (): void => {
        // FPS calculation
        this.frameCount++;
        const now = performance.now();
        if (now - this.lastFrameTime >= 1000) {
            if (!this.fpsElement) {
                this.fpsElement = document.getElementById('fps-counter');
            }
            if (this.fpsElement) {
                this.fpsElement.textContent = String(this.frameCount);
            }
            this.frameCount = 0;
            this.lastFrameTime = now;
        }

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


        if (this.quadCreated) {
            this.resetSelection();
        }

        // Spawn billboard at clicked position
        this.billboardPositions.push(vec3.clone(worldPos));
        const billboard = await this.spawnBillboard(worldPos);
        this.billboardObjects.push(billboard);
        console.log(`📍 Billboard ${this.billboardPositions.length}/4 at (${worldPos[0].toFixed(2)}, ${worldPos[1].toFixed(2)}, ${worldPos[2].toFixed(2)})`);

        // When 4 billboards placed, create quad
        if (this.billboardPositions.length === 4) {
            this.renderer.updateSelectionQuad(this.billboardPositions);
            this.quadCreated = true;

            const area = this.calculateSelectionArea(this.billboardPositions);

            // Run compute shader to extract selected vertices
            if (this.terrainVertexBuffer && this.terrainVertexCount > 0) {
                const selectedVertices = await this.renderer.runSelectionCompute(
                    this.terrainVertexBuffer,
                    this.terrainVertexCount
                );

                if (selectedVertices && area) {
                    const selectedCount = selectedVertices.length / 3;
                    const ratio = selectedCount / this.terrainVertexCount;
                    const suitableAreaM2 = area.realAreaM2 * ratio;

                    this.updateSolarPanel(suitableAreaM2);
                    await this.createPanelInstances(selectedVertices);
                }
            }

        }
    }

    /**
     * Reset selection state for a new selection cycle
     */
    private resetSelection(): void {
        for (const billboard of this.billboardObjects) {
            this.scene.remove(billboard);
        }
        this.billboardObjects = [];
        this.billboardPositions = [];
        this.renderer.updateSelectionQuad(null);

        if (this.panelInstances) {
            this.scene.removeInstanced(this.panelInstances);
            this.panelInstances.destroy();
            this.panelInstances = null;
        }

        this.quadCreated = false;

        const guidance = document.getElementById('solar-guidance');
        const data = document.getElementById('solar-data');
        if (guidance) guidance.style.display = 'block';
        if (data) data.style.display = 'none';
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

    async spawnBillboard(position: vec3): Promise<RenderableObject> {
        const device = this.renderer.getDevice();
        const layout = this.renderer.getMaterialGroupLayout();

        if (!this.billboardMaterial) {
            // Bright red-orange color for visibility
            this.billboardMaterial = await MaterialFactory.fromColor(device, [1, 0.2, 0, 1], layout);
        }

        // Small circular billboard (0.15 size)
        const mesh = MeshFactory.quad(device, 0.15);

        const billboard = new RenderableObject({
            mesh,
            material: this.billboardMaterial.bindGroup,
            renderType: RenderType.Billboard,
            transform: new Transform(
                vec3.fromValues(position[0], position[1] + 0.08, position[2]),
                vec3.fromValues(0, 0, 0),
                vec3.fromValues(1, 1, 1)
            )
        });

        this.scene.add(billboard);
        console.log(` Billboard at (${position[0].toFixed(2)}, ${position[1].toFixed(2)}, ${position[2].toFixed(2)})`);
        return billboard;
    }

    setTerrainComputeInfo(vertexBuffer: GPUBuffer, vertexCount: number): void {
        this.terrainVertexBuffer = vertexBuffer;
        this.terrainVertexCount = vertexCount;
        console.log(`Terrain compute info set: ${vertexCount} vertices`);
    }

    setTerrainMetadata(bounds: { west: number; south: number; east: number; north: number }, worldSize: number = 20): void {
        this.terrainMetadata = { bounds, worldSize };
    }

    setGHIData(data: Float32Array, width: number, height: number, minGHI: number, maxGHI: number): void {
        this.ghiData = { data, width, height, minGHI, maxGHI };
    }

    calculateAverageGHI(): number | null {
        if (!this.ghiData) return null;
        const { data } = this.ghiData;
        let sum = 0;
        let count = 0;
        for (let i = 0; i < data.length; i++) {
            if (data[i] > 0) {
                sum += data[i];
                count++;
            }
        }
        return count > 0 ? sum / count : null;
    }

    updateSolarPanel(areaM2: number): void {
        const guidance = document.getElementById('solar-guidance');
        const data = document.getElementById('solar-data');
        if (!guidance || !data) return;

        const avgGHI = this.calculateAverageGHI();
        if (avgGHI === null) {
            guidance.style.display = 'block';
            data.style.display = 'none';
            return;
        }

        // Raw solar energy hitting the surface
        const rawPower = areaM2 * avgGHI;

        // Estimated electricity with realistic factors:
        // - Panel efficiency: ~20%
        // - Coverage ratio: ~60% (not all area can have panels)
        // - System losses: ~85% efficiency (inverter, cables, etc.)
        const panelEfficiency = 0.20;
        const coverageRatio = 0.60;
        const systemEfficiency = 0.85;
        const estimatedPower = rawPower * panelEfficiency * coverageRatio * systemEfficiency;

        document.getElementById('solar-area')!.textContent = areaM2.toFixed(0);
        document.getElementById('solar-ghi')!.textContent = avgGHI.toFixed(2);
        document.getElementById('solar-power-raw')!.textContent = rawPower.toFixed(0);
        document.getElementById('solar-power-est')!.textContent = estimatedPower.toFixed(0);

        guidance.style.display = 'none';
        data.style.display = 'flex';
    }

    togglePanelVisibility(visible: boolean): void {
        if (this.panelInstances) {
            this.panelInstances.visible = visible;
        }
    }

    // Instance test methods
    setupInstanceTestButtons(): void {
        const counts = [5000, 2500, 1000, 500];
        counts.forEach(count => {
            const btn = document.getElementById(`inst-${count}`);
            if (btn) {
                btn.addEventListener('click', () => this.setTestInstanceCount(count));
            }
        });
    }

    setTestInstanceCount(count: number): void {
        if (!this.testInstancedMesh) return;

        this.testInstancedMesh.clear();

        for (let i = 0; i < count; i++) {
            this.testInstancedMesh.addInstance({
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
                scale: [1, 1, 1]
            });
        }

        this.testInstancedMesh.updateBuffer();

        // Update UI
        const countEl = document.getElementById('inst-count');
        if (countEl) countEl.textContent = String(count);
    }

    calculateSelectionArea(points: vec3[]): { worldArea: number; realAreaM2: number } | null {
        if (points.length !== 4 || !this.terrainMetadata) return null;

        const [p0, p1, p2, p3] = points;
        const worldArea = 0.5 * Math.abs(
            p0[0] * (p1[1] - p3[1]) +
            p1[0] * (p2[1] - p0[1]) +
            p2[0] * (p3[1] - p1[1]) +
            p3[0] * (p0[1] - p2[1])
        );

        const { bounds, worldSize } = this.terrainMetadata;
        const latCenter = (bounds.north + bounds.south) / 2;
        const metersPerDegreeLat = 111320;
        const metersPerDegreeLng = 111320 * Math.cos(latCenter * Math.PI / 180);

        const realWidthM = (bounds.east - bounds.west) * metersPerDegreeLng;
        const realHeightM = (bounds.north - bounds.south) * metersPerDegreeLat;
        const metersPerWU = (realWidthM + realHeightM) / 2 / worldSize;

        const realAreaM2 = worldArea * metersPerWU * metersPerWU;
        return { worldArea, realAreaM2 };
    }

    private async createPanelInstances(vertices: Float32Array): Promise<void> {
        if (!this.panelMeshes || !this.panelMaterial) {
            console.error("Panel mesh or material not loaded");
            return;
        }

        const device = this.renderer.getDevice();
        const vertexCount = vertices.length / 3;

        // Remove old instances if exists
        if (this.panelInstances) {
            this.scene.removeInstanced(this.panelInstances);
            this.panelInstances.destroy();
        }

        // Create new instanced mesh
        this.panelInstances = new InstancedMesh({
            device,
            submeshes: this.panelMeshes.map(mesh => ({
                mesh,
                material: this.panelMaterial!.bindGroup
            })),
            maxInstances: Math.max(vertexCount, 1000)
        });

        // Add instances at selected positions
        // Skip some vertices for performance (every Nth vertex)
        const skipFactor = Math.max(1, Math.floor(vertexCount / 500)); // Max ~500 panels

        for (let i = 0; i < vertexCount; i += skipFactor) {
            const x = vertices[i * 3];
            const y = vertices[i * 3 + 1];
            const z = vertices[i * 3 + 2];

            this.panelInstances.addInstance({
                position: [x, y, z - 4.9],
                rotation: [45, 0, 0],
                scale: [0.0003, 0.0003, 0.0003]  // Panel çok büyükse küçült
            });
        }

        this.panelInstances.updateBuffer();
        this.scene.addInstanced(this.panelInstances);

        console.log(`✅ Created ${this.panelInstances.getInstanceCount()} panel instances`);
    }
}



