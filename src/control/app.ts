import Renderer from "../view/renderer";
import Scene from "../model/scene";
import $ from "jquery";

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

    run = () => {
        let running: boolean = true;
        this.scene.update();
        this.scene.movePlayer(this.forwardsAmount, this.rightAmount, this.upAmount);
        this.renderer.render(this.scene.getPlayer(), this.scene.getTriangles());
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