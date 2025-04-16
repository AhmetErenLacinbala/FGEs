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
        this.eulers[2] += 6;
        this.eulers[2] %= 360
        this.model = mat4.create();
        mat4.translate(this.model, this.model, this.position);
        mat4.rotateY(this.model, this.model, Deg2Rad(this.eulers[1]));
        mat4.rotateZ(this.model, this.model, Deg2Rad(this.eulers[2]));

        mat4.scale(this.model, this.model, vec3.fromValues(2, 2, 2));
    }

    getModel() {
        return this.model;
    }

    getId() {
        return this.id;
    }
}
