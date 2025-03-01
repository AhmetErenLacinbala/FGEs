import { mat4, vec3 } from "gl-matrix";
import { Deg2Rad } from "../utils";


export default class Triangle {

    position: vec3;
    eulers: vec3;
    model!: mat4;

    constructor(position: vec3, theta: number) {
        this.position = position;
        this.eulers = vec3.create();
        this.eulers[2] = theta;
    }

    update() {
        this.eulers[2] += 6;
        this.eulers[2] %= 360
        this.model = mat4.create();
        mat4.translate(this.model, this.model, this.position);
        mat4.rotateZ(this.model, this.model, Deg2Rad(this.eulers[2]));
    }

    getModel() {
        return this.model;
    }
}