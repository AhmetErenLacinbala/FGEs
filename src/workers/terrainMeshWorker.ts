/**
 * 🧵 Terrain Mesh Generation Web Worker
 * Generates triangle meshes from heightmap data without blocking the main thread
 */

import { MeshGenerationRequest, MeshGenerationResponse, TerrainMeshData } from '../types/terrainStreaming';

// Worker message types
type WorkerMessage = {
    type: 'generate';
    data: MeshGenerationRequest;
} | {
    type: 'terminate';
};

type WorkerResponse = {
    type: 'result';
    data: MeshGenerationResponse;
} | {
    type: 'error';
    error: string;
};

/**
 * Generate terrain mesh from heightmap data
 */
function generateTerrainMesh(request: MeshGenerationRequest): TerrainMeshData {
    const { heightmapData, width, height, resolution, worldPosition } = request;

    console.log(`🧵 Worker: Generating mesh for tile ${request.tileId} (${width}x${height} -> ${resolution}x${resolution})`);

    // Convert ImageData to height values
    const heightValues = extractHeightValues(heightmapData);

    // Generate mesh vertices and indices
    const meshData = createMeshFromHeights(heightValues, width, height, resolution, worldPosition);

    console.log(`🧵 Worker: Generated ${meshData.vertexCount} vertices, ${meshData.indexCount} indices`);

    return meshData;
}

/**
 * Extract height values from ImageData
 */
function extractHeightValues(imageData: ImageData): Float32Array {
    const { data, width, height } = imageData;
    const heightValues = new Float32Array(width * height);

    // Assuming grayscale heightmap where R=G=B represents height
    for (let i = 0; i < width * height; i++) {
        const pixelIndex = i * 4; // RGBA
        // Use red channel as height value (0-255 -> 0-1 -> scaled)
        const normalizedHeight = data[pixelIndex] / 255.0;
        // Scale height to reasonable world units (adjust as needed)
        heightValues[i] = normalizedHeight * 100.0; // 0-100 meter range
    }

    return heightValues;
}

/**
 * Create triangle mesh from height values
 */
function createMeshFromHeights(
    heightValues: Float32Array,
    width: number,
    height: number,
    resolution: number,
    worldPosition: { x: number; z: number }
): TerrainMeshData {

    // Calculate sampling step for desired resolution
    const stepX = Math.max(1, Math.floor(width / resolution));
    const stepY = Math.max(1, Math.floor(height / resolution));

    const actualResX = Math.floor(width / stepX);
    const actualResY = Math.floor(height / stepY);

    console.log(`🧵 Worker: Mesh resolution ${actualResX}x${actualResY} (step: ${stepX}x${stepY})`);

    // Generate vertices
    const vertexCount = actualResX * actualResY;
    const vertices = new Float32Array(vertexCount * 8); // pos(3) + normal(3) + uv(2)

    const terrainScale = 0.02; // Scale factor for terrain size
    const heightScale = 0.1;   // Scale factor for height variation

    for (let y = 0; y < actualResY; y++) {
        for (let x = 0; x < actualResX; x++) {
            const vertexIndex = (y * actualResX + x) * 8;

            // Sample heightmap
            const hx = Math.min(x * stepX, width - 1);
            const hy = Math.min(y * stepY, height - 1);
            const heightIndex = hy * width + hx;
            const centerHeight = heightValues[heightIndex];

            // World position
            const worldX = (x - actualResX / 2) * terrainScale + worldPosition.x;
            const worldY = (centerHeight - 1000) * terrainScale * heightScale; // Adjust base height
            const worldZ = (y - actualResY / 2) * terrainScale + worldPosition.z;

            // Calculate normal using neighboring heights
            const normal = calculateNormal(heightValues, width, height, hx, hy, terrainScale, heightScale);

            // UV coordinates
            const u = x / (actualResX - 1);
            const v = y / (actualResY - 1);

            // Store vertex data: position(3) + normal(3) + uv(2)
            vertices[vertexIndex + 0] = worldX;     // position.x
            vertices[vertexIndex + 1] = worldY;     // position.y
            vertices[vertexIndex + 2] = worldZ;     // position.z
            vertices[vertexIndex + 3] = normal[0];  // normal.x
            vertices[vertexIndex + 4] = normal[1];  // normal.y
            vertices[vertexIndex + 5] = normal[2];  // normal.z
            vertices[vertexIndex + 6] = u;          // uv.u
            vertices[vertexIndex + 7] = v;          // uv.v
        }
    }

    // Generate indices for triangle list
    const indexCount = (actualResX - 1) * (actualResY - 1) * 6; // 6 indices per quad (2 triangles)
    const indices = new Uint32Array(indexCount);

    let indexPos = 0;
    for (let y = 0; y < actualResY - 1; y++) {
        for (let x = 0; x < actualResX - 1; x++) {
            const topLeft = y * actualResX + x;
            const topRight = y * actualResX + (x + 1);
            const bottomLeft = (y + 1) * actualResX + x;
            const bottomRight = (y + 1) * actualResX + (x + 1);

            // First triangle: topLeft -> bottomLeft -> topRight
            indices[indexPos++] = topLeft;
            indices[indexPos++] = bottomLeft;
            indices[indexPos++] = topRight;

            // Second triangle: topRight -> bottomLeft -> bottomRight
            indices[indexPos++] = topRight;
            indices[indexPos++] = bottomLeft;
            indices[indexPos++] = bottomRight;
        }
    }

    return {
        vertices,
        indices,
        vertexCount,
        indexCount
    };
}

/**
 * Calculate vertex normal using neighboring heights
 */
function calculateNormal(
    heightValues: Float32Array,
    width: number,
    height: number,
    x: number,
    y: number,
    terrainScale: number,
    heightScale: number
): [number, number, number] {

    // Get neighboring heights
    const getHeight = (hx: number, hy: number): number => {
        if (hx >= 0 && hx < width && hy >= 0 && hy < height) {
            return heightValues[hy * width + hx];
        }
        return heightValues[y * width + x]; // Use center height for out-of-bounds
    };

    const left = getHeight(x - 1, y);
    const right = getHeight(x + 1, y);
    const up = getHeight(x, y - 1);
    const down = getHeight(x, y + 1);

    // Calculate gradients
    const dX = (right - left) * terrainScale * heightScale * 0.5;
    const dZ = (down - up) * terrainScale * heightScale * 0.5;

    // Normal vector: cross product of tangent vectors
    // Tangent X = (1, dX, 0)
    // Tangent Z = (0, dZ, 1)
    // Normal = TangentX × TangentZ = (-dX, 1, -dZ)
    const normal: [number, number, number] = [-dX, 1.0, -dZ];

    // Normalize
    const length = Math.sqrt(normal[0] * normal[0] + normal[1] * normal[1] + normal[2] * normal[2]);
    if (length > 0) {
        normal[0] /= length;
        normal[1] /= length;
        normal[2] /= length;
    }

    return normal;
}

// Worker message handler
self.addEventListener('message', (event: MessageEvent<WorkerMessage>) => {
    const message = event.data;

    try {
        switch (message.type) {
            case 'generate': {
                const startTime = performance.now();
                const meshData = generateTerrainMesh(message.data);
                const processingTime = performance.now() - startTime;

                const response: WorkerResponse = {
                    type: 'result',
                    data: {
                        tileId: message.data.tileId,
                        success: true,
                        meshData,
                        processingTime
                    }
                };

                self.postMessage(response);
                break;
            }

            case 'terminate':
                self.close();
                break;

            default:
                throw new Error(`Unknown message type: ${(message as any).type}`);
        }
    } catch (error) {
        const response: WorkerResponse = {
            type: 'error',
            error: error instanceof Error ? error.message : 'Unknown error'
        };

        self.postMessage(response);
    }
});

// Signal that worker is ready
self.postMessage({ type: 'ready' });

export { }; // Make this a module
