import { mat4, vec3 } from "gl-matrix";


export default class Quad {

    position: vec3;
    model!: mat4;

    constructor(position: vec3) {
        this.position = position;

    }

    update() {
        this.model = mat4.create();
        mat4.translate(this.model, this.model, this.position);
    }

    getModel() {
        return this.model;
    }
}