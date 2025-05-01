
import { Vertex } from "./definitions";
import { vec3, vec2 } from "gl-matrix";
import { Primitive, WebIO, } from "@gltf-transform/core";
export default class Builder {
    vertices: Vertex[];
    indices: number[];
    vertexCount!: number;
    indexCount!: number;


    constructor() {
        this.vertices = [];
        this.indices = [];
    }
    async loadGLTF(url: string) {
        const io = new WebIO();
        const document = await io.read(url);
        const root = document.getRoot();
        const mesh = root.listMeshes()[0]
        console.log(mesh);

        if (!mesh) {
            console.error("No meshes found in glTF file.");
            return;
        }

        const primitive: Primitive = mesh.listPrimitives()[0];
        if (!primitive) {
            console.error("No primitives found in the mesh.");
            return;
        }

        const positions = primitive.getAttribute('POSITION')?.getArray();
        const normals = primitive.getAttribute('NORMAL')?.getArray();
        const uvs = primitive.getAttribute('TEXCOORD_0')?.getArray();
        const indices = primitive.getIndices()?.getArray();


        if (!positions || !indices) {
            console.error("Missing position or index data!");
            return;
        }

        // Create unique vertices directly from position/normal/uv attributes
        const vertexCount = positions.length / 3;

        for (let i = 0; i < vertexCount; i++) {
            this.vertices.push({
                position: vec3.fromValues(
                    positions[i * 3],
                    positions[i * 3 + 1],
                    positions[i * 3 + 2]
                ),
                color: vec3.fromValues(1, 1, 1),
                normal: normals
                    ? vec3.fromValues(
                        normals[i * 3],
                        normals[i * 3 + 1],
                        normals[i * 3 + 2]
                    )
                    : vec3.create(),
                uv: uvs
                    ? vec2.fromValues(uvs[i * 2], uvs[i * 2 + 1])
                    : vec2.create()
            });
        }

        this.indices = Array.from(indices);

    }
    getFlattenedVertices(): Float32Array {
        const vertexArray = new Float32Array(this.vertices.length * 5); // position (3) + uv (2)

        for (let i = 0; i < this.vertices.length; i++) {
            const v = this.vertices[i];
            vertexArray.set([...v.position, ...v.uv], i * 5);
        }

        return vertexArray;
    }

    getIndexArray(): Uint32Array {
        return new Uint32Array(this.indices);
    }

    async loadFile(url: string) {
        const response: Response = await fetch(url);
        const blob: Blob = await response.blob();
        return await blob.text();
    }
}

