import { mat4, vec3, vec2 } from "gl-matrix";

export enum ObjectTypes {
    TRIANGLE,
    QUAD
}

export interface RenderData {
    viewTransform: mat4;
    modelTransform: Float32Array;
    objectCounts: { [obj in ObjectTypes]: number }
}

export interface Vertex {
    position: vec3;
    color: vec3;
    normal: vec3;
    uv: vec2;
}

export const vertexSize =
    3 * Float32Array.BYTES_PER_ELEMENT + // Position
    3 * Float32Array.BYTES_PER_ELEMENT + // Normal
    2 * Float32Array.BYTES_PER_ELEMENT + // UV
    3 * Float32Array.BYTES_PER_ELEMENT;  // Color