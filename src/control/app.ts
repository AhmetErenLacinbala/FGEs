import Renderer from "../view/renderer";
import Scene from "../model/scene";
import $ from "jquery";
import { vec3 } from "gl-matrix";

export default class App {

    canvas: HTMLCanvasElement;
    renderer: Renderer;
    scene: Scene;

    keyLabel: HTMLElement;
    mouseXLabel: HTMLElement;
    mouseYLabel: HTMLElement;

    forwardsAmount: number;
    rightAmount: number;
    upAmount: number;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.renderer = new Renderer(canvas);
        this.scene = new Scene();


        this.keyLabel = <HTMLElement>document.getElementById('keyboardKey');
        this.mouseXLabel = <HTMLElement>document.getElementById('mousex');
        this.mouseYLabel = <HTMLElement>document.getElementById('mousey');

        this.forwardsAmount = 0;
        this.rightAmount = 0;
        this.upAmount = 0;

        $(document).on("keydown", (event) => { this.handleKeyPress(event) })
        $(document).on("keyup", (event) => { this.handleKeyRelease(event) })

        this.canvas.onclick = () => { this.canvas.requestPointerLock() }
        this.canvas.addEventListener("mousemove", (event) => { this.handleMouseMove(event) })

    }

    async init() {
        await this.renderer.init();
    }

    /**
     * 🏔️ Create terrain from tile data (called from UI)
     */
    async createTerrainFromTile(tileData: any) {
        try {
            console.log('🎯 Creating terrain from tile data...');

            // Calculate min/max safely for large arrays (don't use spread operator)
            let heightMin = tileData.heightData[0];
            let heightMax = tileData.heightData[0];
            let heightSum = 0;

            for (let i = 0; i < tileData.heightData.length; i++) {
                const value = tileData.heightData[i];
                if (value < heightMin) heightMin = value;
                if (value > heightMax) heightMax = value;
                heightSum += value;
            }

            console.log('📊 Tile data info:', {
                width: tileData.width,
                height: tileData.height,
                heightDataLength: tileData.heightData.length,
                centerCoords: tileData.centerCoordinates,
                region: tileData.region,
                heightMin: heightMin,
                heightMax: heightMax,
                heightAvg: heightSum / tileData.heightData.length
            });

            // Add terrain object to scene if not already present
            // Position it slightly below ground level so it touches the surface
            const terrainPosition = vec3.fromValues(0, -1, 0); // Slightly below ground
            if (this.scene.terrain_count === 0) {
                this.scene.addTerrain(terrainPosition);
            }

            // Generate the terrain mesh in the renderer with smaller scale
            await this.renderer.generateTerrain(tileData);
            console.log('✅ Terrain created and rendered successfully at position:', terrainPosition);

        } catch (error) {
            console.error('❌ Failed to create terrain from tile:', error);
        }
    }

    run = () => {
        let running: boolean = true;
        this.scene.update();
        this.scene.movePlayer(this.forwardsAmount, this.rightAmount, this.upAmount);
        this.renderer.render(this.scene.getObjects());
        //console.log(this.scene.getObjects());
        if (running) {
            requestAnimationFrame(this.run);
        }
    }
    handleKeyPress(event: JQuery.KeyDownEvent) {
        this.keyLabel.innerHTML = event.code;
        if (event.code === "KeyW") {
            this.forwardsAmount = 0.1;
        }
        if (event.code === "KeyS") {
            this.forwardsAmount = -0.1;
        }
        if (event.code === "KeyA") {
            this.rightAmount = -0.1;
        }
        if (event.code === "KeyD") {
            this.rightAmount = 0.1;
        }
        if (event.code === "KeyE") {
            this.upAmount += 0.1;
        }
        if (event.code === "KeyQ") {
            this.upAmount += -0.1;
        }
    }

    handleKeyRelease(event: JQuery.KeyUpEvent) {
        this.keyLabel.innerHTML = event.code;
        if (event.code === "KeyW") {
            this.forwardsAmount = 0;
        }
        if (event.code === "KeyS") {
            this.forwardsAmount = 0;
        }
        if (event.code === "KeyA") {
            this.rightAmount = 0;
        }
        if (event.code === "KeyD") {
            this.rightAmount = 0;
        }
        if (event.code === "KeyE") {
            this.upAmount = 0;
        }
        if (event.code === "KeyQ") {
            this.upAmount = 0;
        }
    }

    handleMouseMove(event: MouseEvent) {
        this.mouseXLabel.innerHTML = event.clientX.toString()
        this.mouseYLabel.innerHTML = event.clientY.toString()
        this.scene.spinPlayer(event.movementX / 10, -event.movementY / 10);
    }
}