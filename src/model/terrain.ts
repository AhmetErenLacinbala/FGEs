import { vec3, mat4 } from "gl-matrix";

export default class Terrain {
    position: vec3;
    model: mat4;

    constructor(position: vec3) {
        this.position = position;
        this.model = mat4.create();
    }

    update() {
        mat4.identity(this.model);
        mat4.translate(this.model, this.model, this.position);
        // Rotate 90 degrees around X-axis to make terrain lie flat on ground
        mat4.rotateX(this.model, this.model, -Math.PI / 2);
    }

    getModel(): mat4 {
        return this.model;
    }
} 