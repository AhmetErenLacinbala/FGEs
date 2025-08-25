export default class TerrainMesh {
    vertexBuffer: GPUBuffer;
    indexBuffer: GPUBuffer;
    bufferLayout: GPUVertexBufferLayout;
    indexCount: number;

    constructor(device: GPUDevice) {
        // Initialize with empty buffers - will be populated later
        this.indexCount = 0;

        // Create empty buffers initially
        const initialVertexDescriptor: GPUBufferDescriptor = {
            size: 1024, // Small initial size
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        };
        this.vertexBuffer = device.createBuffer(initialVertexDescriptor);

        const initialIndexDescriptor: GPUBufferDescriptor = {
            size: 1024, // Small initial size  
            usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
        };
        this.indexBuffer = device.createBuffer(initialIndexDescriptor);

        // Buffer layout for streaming terrain (position + normal + uv)
        this.bufferLayout = {
            arrayStride: 8 * 4, // position (3) + normal (3) + uv (2)
            attributes: [
                {
                    shaderLocation: 0,
                    format: 'float32x3', // position xyz
                    offset: 0
                },
                {
                    shaderLocation: 1,
                    format: 'float32x3', // normal xyz
                    offset: 3 * 4,
                },
                {
                    shaderLocation: 2,
                    format: 'float32x2', // uv
                    offset: 6 * 4,
                }
            ]
        };
    }

    /**
     * 🏔️ Update terrain mesh with new vertex and index data
     */
    updateTerrain(device: GPUDevice, vertices: Float32Array, indices: Uint32Array) {
        // Destroy old buffers
        this.vertexBuffer.destroy();
        this.indexBuffer.destroy();

        // Create new vertex buffer
        const vertexDescriptor: GPUBufferDescriptor = {
            size: vertices.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
            mappedAtCreation: true,
        };
        this.vertexBuffer = device.createBuffer(vertexDescriptor);
        new Float32Array(this.vertexBuffer.getMappedRange()).set(vertices);
        this.vertexBuffer.unmap();

        // Create new index buffer
        const indexDescriptor: GPUBufferDescriptor = {
            size: indices.byteLength,
            usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
            mappedAtCreation: true,
        };
        this.indexBuffer = device.createBuffer(indexDescriptor);
        new Uint32Array(this.indexBuffer.getMappedRange()).set(indices);
        this.indexBuffer.unmap();

        this.indexCount = indices.length;

        console.log(`🏔️ Terrain mesh updated: ${vertices.length / 8} vertices, ${indices.length} indices`);
    }

    /**
     * 🎯 Check if terrain has been populated
     */
    hasData(): boolean {
        return this.indexCount > 0;
    }
} 