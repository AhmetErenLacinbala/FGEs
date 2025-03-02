import Triangle from "./triangle";
import Camera from "./camera";
import { vec3, mat4 } from "gl-matrix";

export default class Scene {
    triangles: Triangle[];
    player: Camera;
    object_data: Float32Array;
    triangle_count: number;

    constructor() {
        this.triangles = [];
        this.object_data = new Float32Array(16 * 1024);
        this.triangle_count = 0;


        let i: number = 0;
        for (let y = -5; y < 5; y++) {
            this.triangles.push(
                new Triangle([2., y, 0.], 0.0)
            );

            let blank_matrix = mat4.create();
            for (let j = 0; j < 16; j++) {
                this.object_data[16 * i + j] = <number>blank_matrix.at(j);
            }
            i++;
            this.triangle_count++;
        }
        this.player = new Camera([-2.0, 0.0, 0.], 0, 0);
    }
    update() {
        let i = 0;
        this.triangles.forEach((triangle: Triangle) => {
            triangle.update();
            let model = triangle.getModel();
            for (let j = 0; j < 16; j++) {
                this.object_data[16 * i + j] = <number>model.at(j);
            }
            i++;
        });
        this.player.update();
    }
    getPlayer(): Camera {
        return this.player;
    }
    getTriangles(): Float32Array {
        return this.object_data;
    }

    spinPlayer(dX: number, dY: number) {
        this.player.eulers[2] -= dX;
        this.player.eulers[2] %= 360;

        this.player.eulers[1] = Math.min(89, Math.max(-89, this.player.eulers[1] + dY))

    }

    movePlayer(forwardsAmount: number, rightAmount: number, upAmount: number) {
        vec3.scaleAndAdd(
            this.player.position, this.player.position, this.player.forwards, forwardsAmount
        );
        vec3.scaleAndAdd(
            this.player.position, this.player.position, this.player.right, rightAmount
        );
        vec3.scaleAndAdd(
            this.player.position, this.player.position, this.player.up, upAmount
        );
    }
}