/**
 * 🎮 WebGPU Vertex Buffer Manager
 * Dynamic allocation and management of vertex/index buffers for terrain tiles
 */

import {
    VertexBufferManager as IVertexBufferManager,
    TerrainTile,
    GPUMemoryStats
} from '../types/terrainStreaming';

interface BufferPool {
    available: GPUBuffer[];
    inUse: Map<GPUBuffer, { size: number; allocated: number }>;
    totalAllocated: number;
}

export class VertexBufferManager implements IVertexBufferManager {
    private device: GPUDevice;
    private vertexBufferPool: BufferPool;
    private indexBufferPool: BufferPool;
    private maxBufferSize: number;
    private minBufferSize: number;

    constructor(device: GPUDevice, options: {
        maxBufferSize?: number;
        minBufferSize?: number;
    } = {}) {
        this.device = device;
        this.maxBufferSize = options.maxBufferSize || 64 * 1024 * 1024; // 64MB max per buffer
        this.minBufferSize = options.minBufferSize || 1024; // 1KB min buffer size

        this.vertexBufferPool = {
            available: [],
            inUse: new Map(),
            totalAllocated: 0
        };

        this.indexBufferPool = {
            available: [],
            inUse: new Map(),
            totalAllocated: 0
        };

        console.log('🎮 VertexBufferManager initialized', {
            maxBufferSize: this.maxBufferSize,
            minBufferSize: this.minBufferSize
        });
    }

    /**
     * Allocate a vertex buffer with the specified size
     */
    allocateVertexBuffer(size: number): GPUBuffer {
        return this.allocateBuffer(size, GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST, this.vertexBufferPool);
    }

    /**
     * Allocate an index buffer with the specified size
     */
    allocateIndexBuffer(size: number): GPUBuffer {
        return this.allocateBuffer(size, GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST, this.indexBufferPool);
    }

    /**
     * Generic buffer allocation with pooling
     */
    private allocateBuffer(size: number, usage: GPUBufferUsageFlags, pool: BufferPool): GPUBuffer {
        // Ensure size meets minimum requirements
        const actualSize = Math.max(size, this.minBufferSize);

        // Check if we can reuse an existing buffer
        const reusableBuffer = this.findReusableBuffer(actualSize, pool);
        if (reusableBuffer) {
            // Move from available to in-use
            const index = pool.available.indexOf(reusableBuffer);
            pool.available.splice(index, 1);
            pool.inUse.set(reusableBuffer, { size: actualSize, allocated: Date.now() });

            console.log(`🔄 Reusing buffer: ${actualSize} bytes`);
            return reusableBuffer;
        }

        // Create new buffer if none available
        const buffer = this.device.createBuffer({
            size: actualSize,
            usage: usage
        });

        pool.inUse.set(buffer, { size: actualSize, allocated: Date.now() });
        pool.totalAllocated += actualSize;

        console.log(`🆕 Created new buffer: ${actualSize} bytes, total allocated: ${pool.totalAllocated}`);
        return buffer;
    }

    /**
     * Find a reusable buffer that can accommodate the requested size
     */
    private findReusableBuffer(size: number, pool: BufferPool): GPUBuffer | null {
        // Look for buffer that's big enough but not too wasteful (within 2x size)
        for (const buffer of pool.available) {
            const bufferInfo = pool.inUse.get(buffer);
            if (bufferInfo && bufferInfo.size >= size && bufferInfo.size <= size * 2) {
                return buffer;
            }
        }
        return null;
    }

    /**
     * Update vertex buffer data
     */
    updateVertexData(buffer: GPUBuffer, data: Float32Array, offset: number = 0): void {
        try {
            this.device.queue.writeBuffer(buffer, offset, data);
            console.log(`📝 Updated vertex buffer: ${data.byteLength} bytes at offset ${offset}`);
        } catch (error) {
            console.error('❌ Failed to update vertex buffer:', error);
            throw error;
        }
    }

    /**
     * Update index buffer data
     */
    updateIndexData(buffer: GPUBuffer, data: Uint32Array, offset: number = 0): void {
        try {
            this.device.queue.writeBuffer(buffer, offset, data);
            console.log(`📝 Updated index buffer: ${data.byteLength} bytes at offset ${offset}`);
        } catch (error) {
            console.error('❌ Failed to update index buffer:', error);
            throw error;
        }
    }

    /**
     * Deallocate a buffer (move to available pool for reuse)
     */
    deallocateBuffer(buffer: GPUBuffer): void {
        // Check vertex buffer pool first
        if (this.vertexBufferPool.inUse.has(buffer)) {
            this.vertexBufferPool.inUse.delete(buffer);
            this.vertexBufferPool.available.push(buffer);
            console.log('♻️ Moved vertex buffer to available pool');
            return;
        }

        // Check index buffer pool
        if (this.indexBufferPool.inUse.has(buffer)) {
            this.indexBufferPool.inUse.delete(buffer);
            this.indexBufferPool.available.push(buffer);
            console.log('♻️ Moved index buffer to available pool');
            return;
        }

        console.warn('⚠️ Attempted to deallocate unknown buffer');
    }

    /**
     * Force destroy a buffer and remove from all pools
     */
    destroyBuffer(buffer: GPUBuffer): void {
        // Remove from vertex pool
        this.removeBufferFromPool(buffer, this.vertexBufferPool);

        // Remove from index pool
        this.removeBufferFromPool(buffer, this.indexBufferPool);

        // Destroy the actual GPU resource
        try {
            buffer.destroy();
            console.log('💥 Buffer destroyed');
        } catch (error) {
            console.warn('⚠️ Error destroying buffer:', error);
        }
    }

    /**
     * Remove buffer from a specific pool
     */
    private removeBufferFromPool(buffer: GPUBuffer, pool: BufferPool): void {
        // Remove from in-use
        const bufferInfo = pool.inUse.get(buffer);
        if (bufferInfo) {
            pool.inUse.delete(buffer);
            pool.totalAllocated -= bufferInfo.size;
        }

        // Remove from available
        const availableIndex = pool.available.indexOf(buffer);
        if (availableIndex >= 0) {
            pool.available.splice(availableIndex, 1);
        }
    }

    /**
     * Get current GPU memory usage statistics
     */
    getMemoryUsage(): { vertex: number; index: number; total: number } {
        const vertexMemory = this.vertexBufferPool.totalAllocated;
        const indexMemory = this.indexBufferPool.totalAllocated;

        return {
            vertex: vertexMemory,
            index: indexMemory,
            total: vertexMemory + indexMemory
        };
    }

    /**
     * Get detailed memory statistics
     */
    getDetailedStats(): GPUMemoryStats {
        const vertexInUse = this.vertexBufferPool.inUse.size;
        const indexInUse = this.indexBufferPool.inUse.size;
        const vertexAvailable = this.vertexBufferPool.available.length;
        const indexAvailable = this.indexBufferPool.available.length;

        return {
            totalVertexBuffers: vertexInUse + vertexAvailable,
            totalIndexBuffers: indexInUse + indexAvailable,
            totalVertexMemory: this.vertexBufferPool.totalAllocated,
            totalIndexMemory: this.indexBufferPool.totalAllocated,
            totalTiles: vertexInUse, // Assuming 1 vertex buffer per tile
            loadedTiles: vertexInUse,
            tilesWithGPUResources: vertexInUse
        };
    }

    /**
     * Update multiple tiles efficiently in batch
     */
    async updateMultipleTiles(tiles: TerrainTile[]): Promise<void> {
        const updatePromises: Promise<void>[] = [];

        for (const tile of tiles) {
            if (tile.meshData && tile.vertexBuffer && tile.indexBuffer) {
                // Queue vertex buffer update
                updatePromises.push(
                    Promise.resolve(this.updateVertexData(tile.vertexBuffer, tile.meshData.vertices))
                );

                // Queue index buffer update
                updatePromises.push(
                    Promise.resolve(this.updateIndexData(tile.indexBuffer, tile.meshData.indices))
                );
            }
        }

        // Execute all updates in parallel
        await Promise.all(updatePromises);
        console.log(`📊 Batch updated ${tiles.length} tiles`);
    }

    /**
     * Clean up unused buffers based on age and memory pressure
     */
    cleanupUnusedBuffers(maxAge: number = 30000): number { // 30 seconds default
        const now = Date.now();
        let cleanedCount = 0;

        // Clean vertex buffers
        cleanedCount += this.cleanupPoolBuffers(this.vertexBufferPool, now, maxAge);

        // Clean index buffers
        cleanedCount += this.cleanupPoolBuffers(this.indexBufferPool, now, maxAge);

        if (cleanedCount > 0) {
            console.log(`🧹 Cleaned up ${cleanedCount} unused buffers`);
        }

        return cleanedCount;
    }

    /**
     * Clean up buffers in a specific pool
     */
    private cleanupPoolBuffers(pool: BufferPool, now: number, maxAge: number): number {
        let cleanedCount = 0;

        // Only clean available buffers (in-use should not be cleaned)
        pool.available = pool.available.filter(buffer => {
            const bufferInfo = pool.inUse.get(buffer);
            if (bufferInfo && (now - bufferInfo.allocated) > maxAge) {
                // Buffer is too old, destroy it
                try {
                    buffer.destroy();
                    pool.totalAllocated -= bufferInfo.size;
                    cleanedCount++;
                } catch (error) {
                    console.warn('⚠️ Error destroying old buffer:', error);
                }
                return false; // Remove from available array
            }
            return true; // Keep in available array
        });

        return cleanedCount;
    }

    /**
     * Emergency cleanup when memory pressure is high
     */
    emergencyCleanup(): void {
        console.warn('🚨 Emergency GPU memory cleanup initiated');

        // Destroy all available buffers immediately
        this.vertexBufferPool.available.forEach(buffer => {
            try {
                buffer.destroy();
            } catch (error) {
                console.warn('⚠️ Error in emergency cleanup:', error);
            }
        });

        this.indexBufferPool.available.forEach(buffer => {
            try {
                buffer.destroy();
            } catch (error) {
                console.warn('⚠️ Error in emergency cleanup:', error);
            }
        });

        // Clear available pools
        this.vertexBufferPool.available = [];
        this.indexBufferPool.available = [];

        console.log('🚨 Emergency cleanup completed');
    }

    /**
     * Destroy all resources
     */
    destroy(): void {
        console.log('💥 Destroying VertexBufferManager...');

        // Destroy all vertex buffers
        [...this.vertexBufferPool.inUse.keys(), ...this.vertexBufferPool.available].forEach(buffer => {
            try {
                buffer.destroy();
            } catch (error) {
                console.warn('⚠️ Error destroying buffer:', error);
            }
        });

        // Destroy all index buffers
        [...this.indexBufferPool.inUse.keys(), ...this.indexBufferPool.available].forEach(buffer => {
            try {
                buffer.destroy();
            } catch (error) {
                console.warn('⚠️ Error destroying buffer:', error);
            }
        });

        // Clear all references
        this.vertexBufferPool.inUse.clear();
        this.vertexBufferPool.available = [];
        this.indexBufferPool.inUse.clear();
        this.indexBufferPool.available = [];

        console.log('💥 VertexBufferManager destroyed');
    }
}
