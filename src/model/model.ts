
import { Vertex, vertexSize } from "./definitions";
import { vec3, vec2 } from "@gltf-transform/core";
import Builder from "./builder";
import Material from "../view/material";
export default class Model {
    device: GPUDevice;
    vertices: Vertex[];
    indices: number[];
    vertexBuffer!: GPUBuffer;
    indexBuffer!: GPUBuffer;
    material!: Material;
    constructor(device: GPUDevice, builder: Builder) {
        this.vertices = builder.vertices;
        this.indices = builder.indices;
        this.device = device;
        this.createBuffer();
    }

    createBuffer() {
        const indexBufferSize = Uint32Array.BYTES_PER_ELEMENT * this.indices.length
        const alignedVertexBufferSize = Math.ceil(vertexSize * this.vertices.length / 16) * 16;
        const alignedIndexBufferSize = Math.ceil(indexBufferSize / 16) * 16;

        this.vertexBuffer = this.device.createBuffer({
            size: alignedVertexBufferSize,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
        });
        this.indexBuffer = this.device.createBuffer({
            size: alignedIndexBufferSize,
            usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST
        });
        console.log(`Vertex Buffer Created: ${alignedVertexBufferSize} bytes`);
        console.log(`Index Buffer Created: ${alignedIndexBufferSize} bytes`);
    }
    uploadData() {
        const vertexArray = new Float32Array(this.vertices.length * (vertexSize / 4)); // 4 bytes per float to calculate element count
        for (let i = 0; i < this.vertices.length; i++) {
            const v = this.vertices[i];
            vertexArray.set([...v.position, ...v.normal, ...v.uv, ...v.color], i * (vertexSize / 4));
        }
        const indexArray = new Uint32Array(this.indices);
        this.device.queue.writeBuffer(this.vertexBuffer, 0, vertexArray);
        this.device.queue.writeBuffer(this.indexBuffer, 0, indexArray);
        console.log(`Uploaded ${this.vertices.length} vertices and ${this.indices.length} indices.`);
    }
    bind(renderPass: GPURenderPassEncoder) {
        renderPass.setVertexBuffer(0, this.vertexBuffer);
        renderPass.setIndexBuffer(this.indexBuffer, "uint32");
    }
    draw(renderPass: GPURenderPassEncoder) {
        renderPass.drawIndexed(this.indices.length, 1, 0, 0, 0);
    }
}