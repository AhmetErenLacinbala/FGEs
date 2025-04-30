
import { Vertex, vertexSize, VertexTemp } from "./definitions";
import { vec3, vec2 } from "@gltf-transform/core";
import Builder from "./builder";
import Material from "../view/material";
export default class Model {
    device: GPUDevice;
    vertices!: Float32Array; //todo: fix this
    buffer!: GPUBuffer; //(vertexbuffer for now)
    bufferLayout!: GPUVertexBufferLayout;
    indices!: number[]; //todo: fix this
    vertexBuffer!: GPUBuffer;
    indexBuffer!: GPUBuffer;
    material!: Material;
    vertexCount: number;
    indexCount: number;
    constructor(device: GPUDevice, builder: Builder) {
        this.device = device;

        const vertexArray = builder.getFlattenedVertices();
        const indexArray = builder.getIndexArray();

        this.vertexCount = builder.vertices.length;
        this.indexCount = builder.indices.length;

        this.createBuffers(vertexArray, indexArray);
    }

    init() {



        this.vertexCount = this.vertices.length / 5;


        const usage: GPUBufferUsageFlags = GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST;
        const descriptor: GPUBufferDescriptor = {
            size: this.vertices.byteLength,
            usage: usage,
            mappedAtCreation: true,
        }
        this.buffer = this.device.createBuffer(descriptor);
        new Float32Array(this.buffer.getMappedRange()).set(this.vertices);
        this.buffer.unmap();

        this.bufferLayout = {
            arrayStride: 5 * 4,
            attributes: [
                {
                    shaderLocation: 0,
                    format: 'float32x3', //x y z
                    offset: 0
                },
                {
                    shaderLocation: 1,
                    format: 'float32x2', //r g b
                    offset: 3 * 4,
                }

            ]
        }

    }

    createBuffers(vertexArray: Float32Array, indexArray: Uint32Array) {
        // Vertex buffer
        this.vertexBuffer = this.device.createBuffer({
            size: vertexArray.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
            mappedAtCreation: true
        });
        new Float32Array(this.vertexBuffer.getMappedRange()).set(vertexArray);
        this.vertexBuffer.unmap();

        // Index buffer
        this.indexBuffer = this.device.createBuffer({
            size: indexArray.byteLength,
            usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
            mappedAtCreation: true
        });
        new Uint32Array(this.indexBuffer.getMappedRange()).set(indexArray);
        this.indexBuffer.unmap();

        // Buffer layout
        this.bufferLayout = {
            arrayStride: 5 * 4,
            attributes: [
                { shaderLocation: 0, format: 'float32x3', offset: 0 },
                { shaderLocation: 1, format: 'float32x2', offset: 3 * 4 }
            ]
        };
    }

    bind(renderPass: GPURenderPassEncoder) {
        renderPass.setVertexBuffer(0, this.vertexBuffer);
        renderPass.setIndexBuffer(this.indexBuffer, "uint32");
    }

    draw(renderPass: GPURenderPassEncoder, objectsDrawn: number) {
        renderPass.drawIndexed(this.indexCount, 1, 0, 0, objectsDrawn);
    }


}