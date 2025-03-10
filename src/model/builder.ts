import ObjFileParser from "obj-file-parser";
import { Vertex } from "./definitions";
import { vec3, vec2 } from "gl-matrix";
import { NodeIO, Primitive, WebIO, } from "@gltf-transform/core";
export default class Builder {
    vertices: Vertex[];
    indices: number[];


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

        this.indices = Array.from(indices);
        for (let i = 0; i < indices.length; i++) {
            const idx = indices[i];

            this.vertices.push({
                position: vec3.fromValues(
                    positions[idx * 3], positions[idx * 3 + 1], positions[idx * 3 + 2]
                ),
                color: vec3.fromValues(1, 1, 1),
                normal: normals
                    ? vec3.fromValues(normals[idx * 3], normals[idx * 3 + 1], normals[idx * 3 + 2])
                    : vec3.create(),
                uv: uvs
                    ? vec2.fromValues(uvs[idx * 2], uvs[idx * 2 + 1])
                    : vec2.create()
            });
        }
        /*console.log("Vertex Positions:", positions);
        console.log("Vertex Normals:", normals);
        console.log("Texture UVs:", uvs);
        console.log("Indices:", indices);
        console.log("vertex:", this.vertices);
        console.log("index:", this.indices);*/
    }
    /*async loadObj(url: string) {

        const objFile = await new ObjFileParser(await this.loadFile(url))
        const objData = objFile.parse();
        let vertexOffset = 0;
        console.log(objData.models);
        objData.models.forEach((model) => {
            console.log(`Merging model: ${model.name}`);
            for (let i = 0; i < model.vertices.length; i++) {

                console.log(`Merging model: ${model.name}, vertex: ${i}`);
                let vertex: Vertex
                vertex = {
                    position: vec3.fromValues(model.vertices[i].x, model.vertices[i].y, model.vertices[i].z),
                    color: vec3.fromValues(1, 1, 1),
                    normal: model.vertexNormals && model.vertexNormals.length > 0
                        ? vec3.fromValues(model.vertexNormals[i]?.x, model.vertexNormals[i]?.y, model.vertexNormals[i]?.z)
                        : vec3.create(),
                    uv: model.textureCoords && model.textureCoords.length > 0
                        ? vec2.fromValues(model.textureCoords[i]?.u, model.textureCoords[i]?.v)
                        : vec2.create()

                }
                console.log(vertex);
            }

        })
        console.log(objFile.parse());
    }*/

    async loadFile(url: string) {
        const response: Response = await fetch(url);
        const blob: Blob = await response.blob();
        return await blob.text();
    }
}