import { mat4 } from "gl-matrix";

export enum ObjectTypes {
    TRIANGLE,
    QUAD
}

export interface RenderData {
    viewTransform: mat4;
    modelTransform: Float32Array;
    objectCounts: { [obj in ObjectTypes]: number }
}