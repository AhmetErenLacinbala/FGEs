/**
 * MeshData - Unified container for GPU mesh buffers
 * This is the GPU-side representation of any mesh
 */
export interface MeshData {
    vertexBuffer: GPUBuffer;
    indexBuffer: GPUBuffer | null;
    vertexCount: number;
    indexCount: number;
    bufferLayout: GPUVertexBufferLayout;
    useIndexBuffer: boolean;
}

/**
 * Standard buffer layout for position (vec3) + uv (vec2)
 */
export const STANDARD_BUFFER_LAYOUT: GPUVertexBufferLayout = {
    arrayStride: 5 * 4, // 5 floats * 4 bytes
    attributes: [
        {
            shaderLocation: 0,
            format: 'float32x3', // position xyz
            offset: 0
        },
        {
            shaderLocation: 1,
            format: 'float32x2', // uv
            offset: 3 * 4
        }
    ]
};

/**
 * Create GPU buffers from raw vertex/index data
 */
export function createMeshData(
    device: GPUDevice,
    vertices: Float32Array,
    indices?: Uint32Array,
    layout: GPUVertexBufferLayout = STANDARD_BUFFER_LAYOUT
): MeshData {
    // Create vertex buffer
    const vertexBuffer = device.createBuffer({
        size: vertices.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        mappedAtCreation: true
    });
    new Float32Array(vertexBuffer.getMappedRange()).set(vertices);
    vertexBuffer.unmap();

    // Create index buffer if indices provided
    let indexBuffer: GPUBuffer | null = null;
    if (indices && indices.length > 0) {
        indexBuffer = device.createBuffer({
            size: indices.byteLength,
            usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
            mappedAtCreation: true
        });
        new Uint32Array(indexBuffer.getMappedRange()).set(indices);
        indexBuffer.unmap();
    }

    return {
        vertexBuffer,
        indexBuffer,
        vertexCount: vertices.length / 5, // Assuming 5 floats per vertex
        indexCount: indices?.length ?? 0,
        bufferLayout: layout,
        useIndexBuffer: indices !== undefined && indices.length > 0
    };
}

/**
 * Destroy mesh data and free GPU resources
 */
export function destroyMeshData(meshData: MeshData): void {
    meshData.vertexBuffer.destroy();
    if (meshData.indexBuffer) {
        meshData.indexBuffer.destroy();
    }
}

