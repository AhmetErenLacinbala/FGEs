import { fromArrayBuffer } from 'geotiff';
import { apiService } from './apiService';
export interface TileRequest {
    centerLat: number;
    centerLng: number;
    scale: number;
}

export interface TileResponse {
    geeResult: {
        success: boolean;
        filename: string;
    };
    ghiResult: {
        success: boolean;
        filename: string;
        resolution: number;
        dataShape: [number, number];
    };
    cacheInfo: {
        downloadUrl: string;
        ghiTileUrl: string;
        region: {
            west: number;
            south: number;
            east: number;
            north: number;
        };
        centerCoordinates: {
            lat: number;
            lng: number;
        };
        tileSize: number;
    };
}

export interface ProcessedTileData {
    tileId: string;
    bounds: {
        west: number;
        south: number;
        east: number;
        north: number;
    };
    center: {
        lat: number;
        lng: number;
    };

    // Heightmap data for 3D terrain
    heightmap: {
        width: number;
        height: number;
        elevationData: Float32Array;
        minHeight: number;
        maxHeight: number;
    };

    // Solar radiation data for overlay
    solarData: {
        width: number;
        height: number;
        ghiData: Float32Array;
        minGHI: number;
        maxGHI: number;
        unit: string; // kWh/m²/day
    };

    // URLs for caching
    heightmapUrl: string;
    solarUrl: string;
}

export class SolarTerrainService {
    private tileCache: Map<string, ProcessedTileData> = new Map();

    constructor() {
        console.log('🌞 SolarTerrainService initialized with API service');
        console.log('🌐 Environment:', apiService.getEnvironmentInfo());
    }

    async generateCompleteTile(request: TileRequest): Promise<ProcessedTileData> {
        try {
            console.log('🚀 Requesting complete tile...', request);

            const response = await apiService.generateTile(request);

            if (!response.ok) {
                throw new Error(`Backend error: ${response.status} ${response.statusText}`);
            }

            const tileResponse: TileResponse = await response.json();
            console.log('✅ Backend response received:', tileResponse);

            console.log('🔍 Checking GHI data in response:');
            console.log('  - GHI Success:', tileResponse.ghiResult?.success);
            console.log('  - GHI Filename:', tileResponse.ghiResult?.filename);
            console.log('  - GHI URL:', tileResponse.cacheInfo?.ghiTileUrl);
            console.log('  - GHI Resolution:', tileResponse.ghiResult?.resolution);
            console.log('  - GHI Data Shape:', tileResponse.ghiResult?.dataShape);

            const [heightmapData, solarData] = await Promise.all([
                this.downloadAndProcessHeightmap(tileResponse.cacheInfo.downloadUrl),
                this.downloadAndProcessSolarData(apiService.getGHIDataUrl(tileResponse.cacheInfo.ghiTileUrl))
            ]);

            const tileId = this.generateTileId(request);
            const processedTile: ProcessedTileData = {
                tileId,
                bounds: tileResponse.cacheInfo.region,
                center: tileResponse.cacheInfo.centerCoordinates,
                heightmap: heightmapData,
                solarData: solarData,
                heightmapUrl: tileResponse.cacheInfo.downloadUrl,
                solarUrl: apiService.getGHIDataUrl(tileResponse.cacheInfo.ghiTileUrl)
            };

            this.tileCache.set(tileId, processedTile);

            console.log('✅ Complete tile processed:', {
                tileId,
                heightmapSize: `${heightmapData.width}x${heightmapData.height}`,
                solarSize: `${solarData.width}x${solarData.height}`,
                heightRange: `${heightmapData.minHeight.toFixed(1)}m to ${heightmapData.maxHeight.toFixed(1)}m`,
                ghiRange: `${solarData.minGHI.toFixed(2)} to ${solarData.maxGHI.toFixed(2)} ${solarData.unit}`
            });

            return processedTile;

        } catch (error) {
            console.error('❌ Failed to generate complete tile:', error);
            throw error;
        }
    }

    private async downloadAndProcessHeightmap(downloadUrl: string): Promise<ProcessedTileData['heightmap']> {
        try {
            console.log('📥 Downloading heightmap:', downloadUrl);

            const response = await apiService.downloadFile(downloadUrl);
            if (!response.ok) {
                throw new Error(`Failed to download heightmap: ${response.status}`);
            }

            const arrayBuffer = await response.arrayBuffer();
            console.log('📊 Heightmap downloaded, size:', arrayBuffer.byteLength);

            const tiff = await fromArrayBuffer(arrayBuffer);
            const image = await tiff.getImage();
            const rasters = await image.readRasters();

            const width = image.getWidth();
            const height = image.getHeight();
            const elevationData = new Float32Array(rasters[0] as ArrayLike<number>);

            let minHeight = elevationData[0];
            let maxHeight = elevationData[0];
            for (let i = 1; i < elevationData.length; i++) {
                const value = elevationData[i];
                if (value < minHeight) minHeight = value;
                if (value > maxHeight) maxHeight = value;
            }

            console.log('✅ Heightmap processed:', {
                width, height,
                minHeight: minHeight.toFixed(1) + 'm',
                maxHeight: maxHeight.toFixed(1) + 'm'
            });

            return {
                width,
                height,
                elevationData,
                minHeight,
                maxHeight
            };

        } catch (error) {
            console.error('❌ Failed to process heightmap:', error);
            throw error;
        }
    }

    private async downloadAndProcessSolarData(solarUrl: string): Promise<ProcessedTileData['solarData']> {
        try {
            console.log('☀️ Downloading solar data:', solarUrl);
            console.log('☀️ Full GHI URL:', solarUrl);

            const response = await apiService.downloadSolarData(solarUrl);
            console.log('☀️ GHI Response status:', response.status, response.statusText);

            if (!response.ok) {
                throw new Error(`Failed to download solar data: ${response.status} ${response.statusText}`);
            }

            const arrayBuffer = await response.arrayBuffer();
            console.log('📊 Solar data downloaded successfully!');
            console.log('  - Size:', arrayBuffer.byteLength, 'bytes');
            console.log('  - First 16 bytes:', new Uint8Array(arrayBuffer.slice(0, 16)));

            console.log('☀️ Processing GHI TIF with geotiff library...');
            const tiff = await fromArrayBuffer(arrayBuffer);
            console.log('☀️ GeoTIFF object created successfully');

            const image = await tiff.getImage();
            console.log('☀️ GeoTIFF image loaded');
            console.log('  - Width:', image.getWidth());
            console.log('  - Height:', image.getHeight());
            console.log('  - Samples per pixel:', image.getSamplesPerPixel());
            console.log('  - Bits per sample:', image.getBitsPerSample());

            const rasters = await image.readRasters();
            console.log('☀️ Rasters read successfully');
            console.log('  - Raster type:', rasters[0].constructor.name);
            console.log('  - Raster length:', (rasters[0] as any).length);

            const width = image.getWidth();
            const height = image.getHeight();
            const ghiData = new Float32Array(rasters[0] as ArrayLike<number>);

            console.log('☀️ GHI data converted to Float32Array');
            console.log('  - Array length:', ghiData.length);
            console.log('  - First 5 values:', Array.from(ghiData.slice(0, 5)));

            let minGHI = ghiData[0];
            let maxGHI = ghiData[0];
            for (let i = 1; i < ghiData.length; i++) {
                const value = ghiData[i];
                if (value < minGHI) minGHI = value;
                if (value > maxGHI) maxGHI = value;
            }

            console.log('✅ Solar data processed:', {
                width, height,
                minGHI: minGHI.toFixed(2) + ' kWh/m²/day',
                maxGHI: maxGHI.toFixed(2) + ' kWh/m²/day'
            });

            return {
                width,
                height,
                ghiData,
                minGHI,
                maxGHI,
                unit: 'kWh/m²/day'
            };

        } catch (error) {
            console.error('❌ Failed to process solar data:', error);
            throw error;
        }
    }

    private generateTileId(request: TileRequest): string {
        return `tile_${request.centerLat}_${request.centerLng}_${request.scale}`;
    }

    getCachedTile(request: TileRequest): ProcessedTileData | null {
        const tileId = this.generateTileId(request);
        return this.tileCache.get(tileId) || null;
    }

    getCacheStats(): { count: number; totalSize: number } {
        let totalSize = 0;
        this.tileCache.forEach(tile => {
            totalSize += tile.heightmap.elevationData.byteLength;
            totalSize += tile.solarData.ghiData.byteLength;
        });

        return {
            count: this.tileCache.size,
            totalSize
        };
    }

    clearCache(): void {
        this.tileCache.clear();
        console.log('🧹 Tile cache cleared');
    }

    /**
     * 🌍 Request multiple tiles in a grid
     */
    async generateTileGrid(centerLat: number, centerLng: number, gridSize: number = 3, scale: number = 30): Promise<ProcessedTileData[]> {
        const tiles: ProcessedTileData[] = [];
        const tileSpacing = 0.1; // 0.1 degree spacing between tile centers

        const promises: Promise<ProcessedTileData>[] = [];

        for (let x = 0; x < gridSize; x++) {
            for (let y = 0; y < gridSize; y++) {
                const offsetX = (x - Math.floor(gridSize / 2)) * tileSpacing;
                const offsetY = (y - Math.floor(gridSize / 2)) * tileSpacing;

                const tileLat = centerLat + offsetY;
                const tileLng = centerLng + offsetX;

                const request: TileRequest = {
                    centerLat: tileLat,
                    centerLng: tileLng,
                    scale
                };

                promises.push(this.generateCompleteTile(request));
            }
        }

        const results = await Promise.allSettled(promises);

        results.forEach((result, index) => {
            if (result.status === 'fulfilled') {
                tiles.push(result.value);
            } else {
                console.error(`❌ Failed to load tile ${index}:`, result.reason);
            }
        });

        console.log(`✅ Generated ${tiles.length}/${gridSize * gridSize} tiles in grid`);
        return tiles;
    }
}

// Export singleton instance
export const solarTerrainService = new SolarTerrainService();
