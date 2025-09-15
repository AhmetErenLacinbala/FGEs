import { TileController } from '../control/tileController';
import { terrainService } from '../services/terrainService';
import { TileHeightmapData, TerrainTileRequest, ProcessingProgress } from '../types/terrain';
import { fromArrayBuffer } from 'geotiff';
import { apiService } from '../services/apiService';

export class TileExample {
    private tileController: TileController;
    private app: any; // Reference to main App for 3D terrain creation

    constructor(app?: any) {
        this.app = app;

        // Initialize the tile controller with callbacks
        this.tileController = new TileController('tile-ui', {
            onTileLoaded: this.handleTileLoaded.bind(this),
            onError: this.handleTileError.bind(this),
            onLoadingStateChange: this.handleTileLoadingStateChange.bind(this),
            onProgress: this.handleTileProgress.bind(this)
        });

        this.demonstrateTileGeneration();
    }

    private async handleTileLoaded(data: TileHeightmapData): Promise<void> {
        let minHeight = data.heightData[0];
        let maxHeight = data.heightData[0];

        for (let i = 1; i < data.heightData.length; i++) {
            const value = data.heightData[i];
            if (value < minHeight) minHeight = value;
            if (value > maxHeight) maxHeight = value;
        }

        console.log('🎯 Tile generated from working backend:', {
            filename: data.filename,
            centerCoordinates: data.centerCoordinates,
            dimensions: `${data.width}x${data.height}`,
            heightRange: `${minHeight.toFixed(1)}m - ${maxHeight.toFixed(1)}m`,
            scale: data.scale,
            tileSize: `${data.tileSize}° (~${(data.tileSize * 111).toFixed(1)}km)`,
            calculatedBounds: data.region,
            fileSizeKB: Math.round(data.heightData.byteLength / 1024),
            downloadUrl: data.downloadUrl,
            etag: data.etag,
            dataPoints: data.heightData.length
        });

        if (this.app && this.app.createTerrainFromTile) {
            try {
                console.log('🏔️ Creating 3D terrain from generated tile...');

                const lastResponse = terrainService.getTileState().lastResponse;
                if (lastResponse && (lastResponse as any).cacheInfo?.ghiTileUrl) {
                    console.log('☀️ GHI data available, downloading for texture...');
                    console.log('☀️ GHI URL:', (lastResponse as any).cacheInfo.ghiTileUrl);

                    try {
                        const ghiUrl = apiService.getGHIDataUrl((lastResponse as any).cacheInfo.ghiTileUrl);
                        const ghiResponse = await apiService.downloadSolarData(ghiUrl);

                        if (ghiResponse.ok) {
                            const ghiArrayBuffer = await ghiResponse.arrayBuffer();
                            console.log('☀️ GHI data downloaded, size:', ghiArrayBuffer.byteLength);

                            const ghiTiff = await fromArrayBuffer(ghiArrayBuffer);
                            const ghiImage = await ghiTiff.getImage();
                            const ghiRasters = await ghiImage.readRasters();

                            const ghiFloatData = new Float32Array(ghiRasters[0] as ArrayLike<number>);

                            let minGHI = ghiFloatData[0];
                            let maxGHI = ghiFloatData[0];
                            for (let i = 1; i < ghiFloatData.length; i++) {
                                const value = ghiFloatData[i];
                                if (value < minGHI) minGHI = value;
                                if (value > maxGHI) maxGHI = value;
                            }

                            const ghiData = {
                                width: ghiImage.getWidth(),
                                height: ghiImage.getHeight(),
                                ghiData: ghiFloatData,
                                minGHI,
                                maxGHI
                            };

                            console.log('☀️ GHI data processed:', {
                                width: ghiData.width,
                                height: ghiData.height,
                                minGHI: minGHI.toFixed(2),
                                maxGHI: maxGHI.toFixed(2),
                                sampleValues: Array.from(ghiFloatData.slice(0, 5))
                            });

                            await this.app.createTerrainFromTile(data);

                            await this.app.renderer.generateTerrainWithGHI(data, ghiData);
                            console.log('✅ Terrain created with GHI texture');
                            return;
                        }
                    } catch (ghiError) {
                        console.warn('⚠️ Failed to load GHI data, using regular terrain:', ghiError);
                    }
                }

                await this.app.createTerrainFromTile(data);
            } catch (error) {
                console.error('❌ Failed to create 3D terrain:', error);
            }
        }

        this.createWebGPUTileMesh(data);
    }

    private handleTileError(error: string): void {
        console.error('❌ Tile generation error:', error);
    }

    private handleTileLoadingStateChange(isLoading: boolean): void {
        console.log('🔄 Tile loading state changed:', isLoading);
    }

    private handleTileProgress(progress: ProcessingProgress): void {
        console.log(`📊 Tile Progress: ${progress.step} - ${progress.message} (${progress.progress}%)`);
    }

    /**
     * 🧪 Demonstrate tile generation with working backend
     */
    private async demonstrateTileGeneration(): Promise<void> {
        // Test backend connection on startup
        const isConnected = await terrainService.testConnection();
        console.log('🔌 Backend connection test:', isConnected ? 'SUCCESS ✅' : 'FAILED ❌');

        if (!isConnected) {
            console.error('🚨 Backend not available! Make sure NestJS server is running on:', apiService.getBaseUrl());
            return;
        }

        console.log('🎯 TileExample initialized with working backend integration');
        console.log('💡 Click "Generate Tile" button to create terrain in 3D scene');
    }

    /**
     * 🎯 Generate terrain tile programmatically
     */
    async generateTileData(request: TerrainTileRequest): Promise<TileHeightmapData> {
        try {
            console.log('🎯 Generating terrain tile programmatically:', request);

            const data = await this.tileController.generateTileData(request);

            console.log('✅ Tile generation completed:', {
                center: data.centerCoordinates,
                bounds: data.region,
                dimensions: `${data.width}x${data.height}`,
                tileSize: data.tileSize
            });

            return data;
        } catch (error) {
            console.error('❌ Error generating tile programmatically:', error);
            throw error;
        }
    }

    /**
     * Get tile from cache
     */
    getTileFromCache(request: TerrainTileRequest): TileHeightmapData | null {
        return this.tileController.getTileFromCache(request);
    }

    /**
     * 🎮 Create WebGPU mesh from tile data (placeholder for integration)
     */
    private createWebGPUTileMesh(data: TileHeightmapData): void {
        console.log('🎮 Creating WebGPU tile mesh from heightmap data...');
        console.log('📐 Tile mesh parameters:', {
            center: data.centerCoordinates,
            bounds: data.region,
            dimensions: `${data.width}x${data.height}`,
            heightmapSize: data.heightData.length,
            tileSize: `${data.tileSize}° (~${(data.tileSize * 111).toFixed(1)}km)`
        });

        // 🎯 TODO: Integrate with your actual WebGPU renderer
        // You can access the heightmap data via: data.heightData (Float32Array)
        // And the tile bounds via: data.region
        // Center coordinates: data.centerCoordinates

        console.log('💡 Ready to create tile mesh with center coordinates and calculated bounds');
    }

    /**
     * 🎯 Generate multiple tiles in a grid pattern (example utility)
     */
    async generateTileGrid(centerLat: number, centerLng: number, gridSize: number = 3, scale: number = 30): Promise<TileHeightmapData[]> {
        console.log(`🗂️ Generating ${gridSize}x${gridSize} tile grid centered at (${centerLat}, ${centerLng})`);

        const tiles: TileHeightmapData[] = [];
        const tileSize = 0.01; // Fixed tile size in degrees
        const halfGrid = Math.floor(gridSize / 2);

        for (let i = -halfGrid; i <= halfGrid; i++) {
            for (let j = -halfGrid; j <= halfGrid; j++) {
                const tileLat = centerLat + (i * tileSize);
                const tileLng = centerLng + (j * tileSize);

                try {
                    const tile = await this.generateTileData({
                        centerLat: tileLat,
                        centerLng: tileLng,
                        scale
                    });
                    tiles.push(tile);
                    console.log(`✅ Generated tile ${tiles.length}/${gridSize * gridSize} at (${tileLat.toFixed(4)}, ${tileLng.toFixed(4)})`);
                } catch (error) {
                    console.error(`❌ Failed to generate tile at (${tileLat.toFixed(4)}, ${tileLng.toFixed(4)}):`, error);
                }
            }
        }

        console.log(`🎉 Grid generation complete: ${tiles.length}/${gridSize * gridSize} tiles successfully generated`);
        return tiles;
    }

    /**
     * 📊 Get tile cache statistics
     */
    getTileStats(): { count: number; totalSizeKB: number } {
        const stats = terrainService.getTileCacheStats();
        return {
            count: stats.count,
            totalSizeKB: Math.round(stats.totalSize / 1024)
        };
    }

    /**
     * 🧹 Clear all cached tiles
     */
    clearCache(): void {
        terrainService.clearTileCache();
        console.log('🧹 Tile cache cleared');
    }
}

/**
 * Initialize the tile integration system
 */
export function initializeTileIntegration(app?: any): TileExample {
    return new TileExample(app);
} 