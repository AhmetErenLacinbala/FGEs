import { mat4, vec3 } from "gl-matrix";
import { Deg2Rad } from "../utils";


export default class GameObject {
    private static idCounter: number = 0;
    public readonly id: number;

    position: vec3;
    eulers: vec3;
    model!: mat4;


    constructor(position: vec3, eulers: vec3) {
        this.id = GameObject.idCounter++;
        this.position = position;
        this.eulers = eulers;

    }

    update() {
        // No rotation for simpler debugging
        this.model = mat4.create();
        mat4.translate(this.model, this.model, this.position);
    }

    getModel() {
        return this.model;
    }

    getId() {
        return this.id;
    }
}
