import { WebIO, Primitive } from "@gltf-transform/core";
import { vec3 } from "gl-matrix";
import { MeshData, createMeshData, STANDARD_BUFFER_LAYOUT } from "./MeshData";

/**
 * MeshFactory - Factory for creating meshes from various sources
 * 
 * Usage:
 *   const submeshes = await MeshFactory.fromGLTF(device, "models/character.glb");
 *   const mesh = MeshFactory.triangle(device);
 *   const mesh = MeshFactory.fromHeightmap(device, heightData, width, height);
 */
export default class MeshFactory {

    /**
     * Create a simple triangle mesh
     */
    static triangle(device: GPUDevice): MeshData {
        const vertices = new Float32Array([
            // x, y, z, u, v
            0.0, 0.0, 0.5, 0.5, 0.0,
            0.0, -0.5, -0.5, 0.0, 1.0,
            0.0, 0.5, -0.5, 1.0, 1.0,
        ]);

        return createMeshData(device, vertices);
    }

    /**
     * Create a quad mesh
     */
    static quad(device: GPUDevice, size: number = 1.0): MeshData {
        const h = size / 2;
        const vertices = new Float32Array([
            // x, y, z, u, v
            -h, -h, 0, 0, 0,
            h, -h, 0, 1, 0,
            h, h, 0, 1, 1,
            -h, h, 0, 0, 1,
        ]);

        const indices = new Uint32Array([
            0, 1, 2,
            0, 2, 3
        ]);

        return createMeshData(device, vertices, indices);
    }

    /**
     * Create a quad from 4 custom world-space points
     * Points should be in order: bottom-left, bottom-right, top-right, top-left
     * UVs are automatically assigned to corners
     */
    /**
     * Create a subdivided quad from 4 corner points
     * Points: [0]=bottom-left, [1]=bottom-right, [2]=top-right, [3]=top-left
     * Subdivisions create a grid that interpolates between corners
     */
    static customQuad(device: GPUDevice, points: vec3[], subdivisions: number = 1): MeshData {
        if (points.length !== 4) {
            throw new Error(`customQuad requires exactly 4 points, got ${points.length}`);
        }

        const rows = subdivisions + 1;
        const cols = subdivisions + 1;
        const vertexCount = rows * cols;
        const vertices = new Float32Array(vertexCount * 5);

        // Generate grid vertices with bilinear interpolation
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const u = col / subdivisions;
                const v = row / subdivisions;
                const idx = (row * cols + col) * 5;

                // Bilinear interpolation between 4 corners
                // p0(0,0) --- p1(1,0)
                //   |           |
                // p3(0,1) --- p2(1,1)
                const x = (1 - u) * (1 - v) * points[0][0] + u * (1 - v) * points[1][0] +
                    u * v * points[2][0] + (1 - u) * v * points[3][0];
                const y = (1 - u) * (1 - v) * points[0][1] + u * (1 - v) * points[1][1] +
                    u * v * points[2][1] + (1 - u) * v * points[3][1];
                const z = (1 - u) * (1 - v) * points[0][2] + u * (1 - v) * points[1][2] +
                    u * v * points[2][2] + (1 - u) * v * points[3][2];

                vertices[idx + 0] = x;
                vertices[idx + 1] = y;
                vertices[idx + 2] = z;
                vertices[idx + 3] = u;
                vertices[idx + 4] = v;
            }
        }

        // Generate indices for triangle grid
        const numQuads = subdivisions * subdivisions;
        const indices = new Uint32Array(numQuads * 6);
        let indexIdx = 0;

        for (let row = 0; row < subdivisions; row++) {
            for (let col = 0; col < subdivisions; col++) {
                const topLeft = row * cols + col;
                const topRight = topLeft + 1;
                const bottomLeft = (row + 1) * cols + col;
                const bottomRight = bottomLeft + 1;

                indices[indexIdx++] = topLeft;
                indices[indexIdx++] = bottomLeft;
                indices[indexIdx++] = topRight;

                indices[indexIdx++] = topRight;
                indices[indexIdx++] = bottomLeft;
                indices[indexIdx++] = bottomRight;
            }
        }

        return createMeshData(device, vertices, indices);
    }

    /**
     * Create a plane mesh (horizontal)
     */
    static plane(device: GPUDevice, width: number = 1.0, depth: number = 1.0): MeshData {
        const hw = width / 2;
        const hd = depth / 2;

        const vertices = new Float32Array([
            // x, y, z, u, v (y is up)
            -hw, 0, -hd, 0, 0,
            hw, 0, -hd, 1, 0,
            hw, 0, hd, 1, 1,
            -hw, 0, hd, 0, 1,
        ]);

        const indices = new Uint32Array([
            0, 2, 1,
            0, 3, 2
        ]);

        return createMeshData(device, vertices, indices);
    }

    /**
     * Parse a single GLTF primitive into MeshData
     */
    private static parsePrimitive(device: GPUDevice, primitive: Primitive, name: string): MeshData {
        const positions = primitive.getAttribute('POSITION')?.getArray();
        const uvs = primitive.getAttribute('TEXCOORD_0')?.getArray();
        const indicesArray = primitive.getIndices()?.getArray();

        if (!positions) {
            throw new Error(`Missing position data in primitive: ${name}`);
        }

        const vertexCount = positions.length / 3;
        const vertices = new Float32Array(vertexCount * 5);

        for (let i = 0; i < vertexCount; i++) {
            vertices[i * 5 + 0] = positions[i * 3 + 0];
            vertices[i * 5 + 1] = positions[i * 3 + 1];
            vertices[i * 5 + 2] = positions[i * 3 + 2];
            vertices[i * 5 + 3] = uvs ? uvs[i * 2 + 0] : 0;
            vertices[i * 5 + 4] = uvs ? uvs[i * 2 + 1] : 0;
        }

        const indices = indicesArray ? new Uint32Array(indicesArray) : undefined;
        return createMeshData(device, vertices, indices);
    }

    /**
     * Returns array of MeshData, one for each primitive across all meshes
     */
    static async fromGLTF(device: GPUDevice, url: string): Promise<MeshData[]> {
        const io = new WebIO();
        const document = await io.read(url);
        const root = document.getRoot();
        const meshes = root.listMeshes();

        if (meshes.length === 0) {
            throw new Error(`No meshes found in glTF file: ${url}`);
        }

        const result: MeshData[] = [];

        for (let meshIdx = 0; meshIdx < meshes.length; meshIdx++) {
            const mesh = meshes[meshIdx];
            const primitives = mesh.listPrimitives();

            for (let primIdx = 0; primIdx < primitives.length; primIdx++) {
                const name = `${url}[mesh=${meshIdx}, primitive=${primIdx}]`;
                result.push(this.parsePrimitive(device, primitives[primIdx], name));
            }
        }

        console.log(`MeshFactory: Loaded ${result.length} submeshes from ${url}`);
        return result;
    }

    /**
     * Create terrain mesh from heightmap data
     * XZ plane fits within a fixed world-space box (default: -10 to +10)
     * Y uses real height values from heightmap (in meters)
     */
    static fromHeightmap(
        device: GPUDevice,
        heightData: Float32Array,
        width: number,
        height: number,
        options: {
            /** Target world size for XZ plane (default: 20, meaning -10 to +10) */
            targetSize?: number;
            /** Scale factor for height values (default: 0.001 to convert meters to world units) */
            heightScale?: number;
        } = {}
    ): MeshData {
        const {
            targetSize = 20,      // -10 to +10 on XZ
            heightScale = 0.001   // Convert meters to reasonable world units
        } = options;

        if (heightData.length !== width * height) {
            throw new Error(`Heightmap data size mismatch: expected ${width * height}, got ${heightData.length}`);
        }

        const cols = width;
        const rows = height;
        const halfSize = targetSize / 2; // 10

        // Find min/max height for logging
        let minHeight = heightData[0];
        let maxHeight = heightData[0];
        for (let i = 1; i < heightData.length; i++) {
            if (heightData[i] < minHeight) minHeight = heightData[i];
            if (heightData[i] > maxHeight) maxHeight = heightData[i];
        }

        // Generate vertices
        const vertices = new Float32Array(rows * cols * 5);

        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const idx = (row * cols + col) * 5;

                // Map col/row to -halfSize..+halfSize (e.g., -10 to +10)
                const x = (col / (cols - 1)) * targetSize - halfSize;
                const z = (row / (rows - 1)) * targetSize - halfSize;

                // Use real height value, just scaled
                const y = heightData[row * cols + col] * heightScale;

                vertices[idx + 0] = x;
                vertices[idx + 1] = y;
                vertices[idx + 2] = z;
                vertices[idx + 3] = col / (cols - 1); // u
                vertices[idx + 4] = row / (rows - 1); // v
            }
        }

        // Generate indices
        const numQuads = (rows - 1) * (cols - 1);
        const indices = new Uint32Array(numQuads * 6);
        let indexIdx = 0;

        for (let row = 0; row < rows - 1; row++) {
            for (let col = 0; col < cols - 1; col++) {
                const topLeft = row * cols + col;
                const topRight = topLeft + 1;
                const bottomLeft = (row + 1) * cols + col;
                const bottomRight = bottomLeft + 1;

                // First triangle
                indices[indexIdx++] = topLeft;
                indices[indexIdx++] = bottomLeft;
                indices[indexIdx++] = topRight;

                // Second triangle
                indices[indexIdx++] = topRight;
                indices[indexIdx++] = bottomLeft;
                indices[indexIdx++] = bottomRight;
            }
        }

        console.log(`MeshFactory: Terrain ${cols}x${rows} in ${targetSize}x${targetSize} box, height: ${minHeight.toFixed(1)}m - ${maxHeight.toFixed(1)}m`);

        return createMeshData(device, vertices, indices);
    }

    /**
     * Create mesh from raw vertex/index data
     */
    static fromRawData(
        device: GPUDevice,
        vertices: Float32Array,
        indices?: Uint32Array,
        layout?: GPUVertexBufferLayout
    ): MeshData {
        return createMeshData(device, vertices, indices, layout ?? STANDARD_BUFFER_LAYOUT);
    }
}

