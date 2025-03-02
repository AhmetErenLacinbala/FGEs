import { mat4, vec3 } from "gl-matrix";
import { Deg2Rad } from "../utils";


export default class Camera {

    position: vec3;
    eulers: vec3;
    view!: mat4;
    forwards: vec3;
    right: vec3;
    up: vec3;


    constructor(position: vec3, theta: number, phi: number) {
        this.position = position;
        this.eulers = vec3.create();
        this.eulers = [0, phi, theta];
        this.forwards = vec3.create();
        this.right = vec3.create();
        this.up = vec3.create();

        /*const target: vec3 = vec3.fromValues(0, 0, 1);
        this.view = mat4.create();
        mat4.lookAt(this.view, this.position, target, [0, 1, 0]);*/
    }

    update() {

        this.forwards = [ //Convert from spherical coordinates to rectangular coordinates
            Math.cos(Deg2Rad(this.eulers[2])) * Math.cos(Deg2Rad(this.eulers[1])),
            Math.sin(Deg2Rad(this.eulers[2])) * Math.cos(Deg2Rad(this.eulers[1])),
            Math.sin(Deg2Rad(this.eulers[1]))
        ];
        vec3.cross(this.right, this.forwards, [0, 0, 1])
        vec3.cross(this.up, this.right, this.forwards)
        const target: vec3 = vec3.create();
        vec3.add(target, this.position, this.forwards);

        this.view = mat4.create();
        mat4.lookAt(this.view, this.position, target, this.up);
    }

    getView() {
        return this.view;
    }
}