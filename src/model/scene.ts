import Triangle from "./triangle";
import Camera from "./camera";
import { vec3, mat4 } from "gl-matrix";
import Quad from "./quad";
import { ObjectTypes, RenderData } from "./definitions";
import GameObject from "./object";
import Terrain from "./terrain";

export default class Scene {
    triangles: Triangle[];
    //quads: Quad[]
    terrains: Terrain[];
    player: Camera;
    object_data: Float32Array;
    triangle_count: number;
    //statue: Statue;
    //quad_count: number;
    terrain_count: number;
    vase: GameObject;

    constructor() {
        this.triangles = [];
        //this.quads = []
        this.terrains = [];
        this.object_data = new Float32Array(16 * 1024);
        this.triangle_count = 0;
        //this.quad_count = 0;
        this.terrain_count = 0;


        this.makeTriangles();
        //this.makeQuads();
        this.vase = new GameObject([0., 0, .0], [0., 0., 0.]);
        //this.statue = new Statue([0., 0., 0.], [0., 0., 0.]);

        // Position camera for better terrain view: closer, higher up, looking down at origin
        this.player = new Camera([0.0, 10.0, 10.0], 0, -45); // Looking down at 45 degrees toward origin
    }

    makeTriangles() {
        let i: number = 0;
        for (let y = -5; y <= 5; y++) {
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
    }

    /*makeQuads() {
        var i: number = this.triangle_count;
        for (let x = -10; x <= 10; x++) {

            for (let y = -10; y <= 10; y++) {
                this.quads.push(
                    new Quad([x, y, -0.5])
                );

                let blank_matrix = mat4.create();
                for (let j = 0; j < 16; j++) {
                    this.object_data[16 * i + j] = <number>blank_matrix.at(j);
                }
                i++;
                this.quad_count++;
            }
        }
    }*/

    /**
     * 🏔️ Add terrain to the scene
     */
    addTerrain(position: vec3) {
        const terrain = new Terrain(position);
        this.terrains.push(terrain);
        this.terrain_count++;
        console.log(`🏔️ Terrain added at position: ${position}`);
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

        /*this.quads.forEach((quad: Quad) => {
            quad.update();
            let model = quad.getModel();
            for (let j = 0; j < 16; j++) {
                this.object_data[16 * i + j] = <number>model.at(j);
            }
            i++;
        });*/

        this.terrains.forEach((terrain: Terrain) => {
            terrain.update();
            let model = terrain.getModel();
            for (let j = 0; j < 16; j++) {
                this.object_data[16 * i + j] = <number>model.at(j);
            }
            i++;
        });

        this.vase.update();
        let model = this.vase.getModel();
        for (let j = 0; j < 16; j++) {
            this.object_data[16 * i + j] = <number>model.at(j);
        }
        /*this.statue.update();
        let model = this.statue.getModel();
        for (let j = 0; j < 16; j++) {
            this.object_data[16 * i + j] = <number>model.at(j);
        }*/
        i++;
        this.player.update();
    }
    getPlayer(): Camera {
        return this.player;
    }
    getObjects(): RenderData {
        return {
            viewTransform: this.player.getView(),
            modelTransform: this.object_data,
            objectCounts: {
                [ObjectTypes.TRIANGLE]: this.triangle_count,
                [ObjectTypes.QUAD]: 0, // Quads are disabled
                [ObjectTypes.TERRAIN]: this.terrain_count
            }
        }
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