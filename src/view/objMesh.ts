import { vec2, vec3 } from "gl-matrix";

export default class ObjMesh {
    buffer!: GPUBuffer;
    bufferLayout!: GPUVertexBufferLayout;
    v: vec3[];
    vt: vec2[];
    vn: vec3[];
    vertices!: Float32Array;
    vertexCount!: number;

    constructor() {
        this.v = [];
        this.vt = [];
        this.vn = [];
    }

    async init(device: GPUDevice, url: string) {
        await this.readFile(url);
        this.vertexCount = this.vertices.length / 5;


        const usage: GPUBufferUsageFlags = GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST;
        const descriptor: GPUBufferDescriptor = {
            size: this.vertices.byteLength,
            usage: usage,
            mappedAtCreation: true,
        }
        this.buffer = device.createBuffer(descriptor);
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

    async readFile(url: string) {

        let result: number[] = [];
        const response: Response = await fetch(url);
        const blob: Blob = await response.blob();
        const fileContents = (await blob.text());
        const lines = fileContents.split('\n');

        lines.forEach((line) => {
            if (line[0] === "v" && line[1] === " ") {
                this.readVertexLine(line);
            }
            else if (line[0] === "v" && line[1] === "t") {
                this.readTextureCoordLine(line);
            }
            else if (line[0] === "v" && line[1] === "n") {
                this.readNormalLine(line);
            }
            else if (line[0] === "f") {
                this.readFaceLine(line, result);
            }
        })

        this.vertices = new Float32Array(result);
    }

    readVertexLine(line: string) {
        const component = line.split(" ");
        const newVertex: vec3 = [
            Number(component[1]).valueOf(),
            Number(component[2]).valueOf(),
            Number(component[3]).valueOf()
        ]
        this.v.push(newVertex);
    }
    readTextureCoordLine(line: string) {
        const component = line.split(" ");
        const data: vec2 = [
            Number(component[1]).valueOf(),
            Number(component[2]).valueOf(),
        ]
        this.vt.push(data);
    }
    readNormalLine(line: string) {
        const component = line.split(" ");
        const data: vec3 = [
            Number(component[1]).valueOf(),
            Number(component[2]).valueOf(),
            Number(component[3]).valueOf()
        ]
        this.vn.push(data);
    }
    readFaceLine(line: string, result: number[]) {
        line = line.replace("\n", "");
        const vertexDesriptions = line.split(" ");
        const triangleCount = vertexDesriptions.length - 3;
        for (let i = 0; i < triangleCount; i++) {
            this.readCorner(vertexDesriptions[1], result);
            this.readCorner(vertexDesriptions[2 + i], result);
            this.readCorner(vertexDesriptions[3 + i], result);
        }
    }
    readCorner(vertexDesriptions: string, result: number[]) {
        const v_vt_vn = vertexDesriptions.split("/");
        const v = this.v[Number(v_vt_vn[0]).valueOf() - 1];
        const vt = this.vt[Number(v_vt_vn[1]).valueOf() - 1];
        result.push(v[0]);
        result.push(v[1]);
        result.push(v[2]);
        result.push(vt[0]);
        result.push(vt[1]);
    }
}