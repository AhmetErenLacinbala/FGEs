
import { ProcessedTileData } from '../services/solarTerrainService';
import { mat4 } from 'gl-matrix';

export interface TerrainMeshData {
    vertices: Float32Array;
    indices: Uint32Array;
    vertexCount: number;
    indexCount: number;
}

export interface SolarTerrainTile {
    tileData: ProcessedTileData;
    meshData: TerrainMeshData;

    vertexBuffer: GPUBuffer;
    indexBuffer: GPUBuffer;
    heightTexture: GPUTexture;
    solarTexture: GPUTexture;

    modelMatrix: mat4;
    worldPosition: { x: number; y: number; z: number };
}

export class SolarTerrainRenderer {
    private tiles: Map<string, SolarTerrainTile> = new Map();


    constructor(_device: GPUDevice) {
        console.log('🌞 SolarTerrainRenderer initialized');
    }


    async addTile(tileData: ProcessedTileData): Promise<void> {
        console.log(`🌞 Solar terrain tile received: ${tileData.tileId}`);
        console.log('📊 Tile data summary:', {
            heightmapSize: `${tileData.heightmap.width}x${tileData.heightmap.height}`,
            solarSize: `${tileData.solarData.width}x${tileData.solarData.height}`,
            heightRange: `${tileData.heightmap.minHeight.toFixed(1)}m to ${tileData.heightmap.maxHeight.toFixed(1)}m`,
            ghiRange: `${tileData.solarData.minGHI.toFixed(2)} to ${tileData.solarData.maxGHI.toFixed(2)} ${tileData.solarData.unit}`
        });

        // This will be implemented when we integrate with the main renderer
        console.log('✅ Solar terrain tile logged (integration pending)');
    }


    /**
     * 🏗️ Generate terrain mesh from heightmap and solar data
     */









    /**
     * ☀️ Create solar texture from GHI data
     */


    getAllTiles(): SolarTerrainTile[] {
        return Array.from(this.tiles.values());
    }


    removeTile(tileId: string): void {
        const tile = this.tiles.get(tileId);
        if (tile) {
            // Cleanup GPU resources
            tile.vertexBuffer.destroy();
            tile.indexBuffer.destroy();
            tile.heightTexture.destroy();
            tile.solarTexture.destroy();

            this.tiles.delete(tileId);
            console.log(`🗑️ Removed tile ${tileId}`);
        }
    }


    destroy(): void {
        for (const tileId of this.tiles.keys()) {
            this.removeTile(tileId);
        }
        console.log('💥 SolarTerrainRenderer destroyed');
    }
}
