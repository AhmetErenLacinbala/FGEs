
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

    /**
     * 🏔️ Populate terrain mesh from heightmap data
     * @param heightData Float32Array from TIF16 file (elevation values in meters)
     * @param width Width of the heightmap in pixels
     * @param height Height of the heightmap in pixels
     * @param scale World scale factor (default: 1.0)
     * @returns boolean indicating success
     */
    populateTerrainData(heightData: Float32Array, width: number, height: number, _scale: number = 1.0): boolean {
        // Validate input data
        if (!heightData || heightData.length === 0) {
            console.error('Invalid heightmap data: empty or null');
            return false;
        }

        if (width <= 0 || height <= 0) {
            console.error(`Invalid heightmap dimensions: ${width}x${height}`);
            return false;
        }

        if (heightData.length !== width * height) {
            console.error(`Heightmap data size mismatch: expected ${width * height}, got ${heightData.length}`);
            return false;
        }

        const cols = width;
        const rows = height;

        console.log(`🏔️ Generating terrain: ${cols}x${rows} (${heightData.length} pixels)`);


        this.vertices = [];
        this.indices = [];


        const getHeightAt = (row: number, col: number): number => {
            if (row >= 0 && row < rows && col >= 0 && col < cols) {
                return heightData[row * cols + col];
            }
            return 0.0;
        };

        // Generate vertices
        this.vertices = new Array(rows * cols);
        let vertexCounter = 0;

        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {

                const terrainScale = 0.02;
                const x = (col - cols / 2) * terrainScale;
                const z = (row - rows / 2) * terrainScale;

                const y = (getHeightAt(row, col) - 1000) * terrainScale * 0.1;
                const left = getHeightAt(row, col - 1);
                const right = getHeightAt(row, col + 1);
                const up = getHeightAt(row - 1, col);
                const down = getHeightAt(row + 1, col);


                const dX = (right - left) * terrainScale * 0.01;
                const dZ = (down - up) * terrainScale * 0.01;


                const normal = vec3.create();
                vec3.set(normal, -dX, terrainScale * 0.1, -dZ);


                vec3.normalize(normal, normal);


                const vertex: Vertex = {
                    position: vec3.fromValues(x, y, z),
                    color: vec3.fromValues(
                        Math.min(y * 0.5 + 0.3, 1.0),
                        0.5,
                        Math.max(0.2, 1.0 - y * 0.5)
                    ),
                    normal: normal,
                    uv: vec2.fromValues(
                        col / (cols - 1),
                        row / (rows - 1)
                    )
                };

                this.vertices[vertexCounter++] = vertex;
            }
        }

        this.indices = [];
        for (let row = 0; row < rows - 1; row++) {
            for (let col = 0; col < cols - 1; col++) {
                const topLeft = row * cols + col;
                const topRight = row * cols + (col + 1);
                const bottomLeft = (row + 1) * cols + col;
                const bottomRight = (row + 1) * cols + (col + 1);

                // First triangle: topLeft -> bottomLeft -> topRight
                this.indices.push(topLeft);
                this.indices.push(bottomLeft);
                this.indices.push(topRight);

                // Second triangle: topRight -> bottomLeft -> bottomRight
                this.indices.push(topRight);
                this.indices.push(bottomLeft);
                this.indices.push(bottomRight);
            }
        }

        // Update counters
        this.vertexCount = this.vertices.length;
        this.indexCount = this.indices.length;

        console.log(`🏔️ Terrain generated: ${this.vertexCount} vertices, ${this.indexCount} indices`);
        return true;
    }

    /**
     * 🎯 Helper method to create terrain from tile data
     * @param tileData TileHeightmapData from tile generation system
     * @param worldScale Scale factor for world coordinates
     */
    populateTerrainFromTile(tileData: any, worldScale: number = 1.0): boolean {
        console.log(`🎯 Creating terrain from tile: ${tileData.width}x${tileData.height} pixels`);
        return this.populateTerrainData(tileData.heightData, tileData.width, tileData.height, worldScale);
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

