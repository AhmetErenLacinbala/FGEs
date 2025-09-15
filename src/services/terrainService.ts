import { fromArrayBuffer } from 'geotiff';
import {
    TerrainTileRequest,
    TerrainTileResponse,
    TileHeightmapData,
    TileServiceState,
    ProcessingProgress
} from '../types/terrain';
import { apiService } from './apiService';

export class TerrainService {
    private tileState: TileServiceState;
    private tileListeners: Set<(state: TileServiceState) => void>;
    private progressListeners: Set<(progress: ProcessingProgress) => void>;

    constructor() {
        this.tileState = {
            isLoading: false,
            currentStep: 'idle',
            progress: 0,
            error: null,
            currentRequest: null,
            lastResponse: null,
            tileCache: new Map()
        };
        this.tileListeners = new Set();
        this.progressListeners = new Set();

        console.log('🏔️ TerrainService initialized with API service');
        console.log('🌐 Environment:', apiService.getEnvironmentInfo());
    }

    subscribeTile(listener: (state: TileServiceState) => void): () => void {
        this.tileListeners.add(listener);
        return () => this.tileListeners.delete(listener);
    }

    subscribeToProgress(listener: (progress: ProcessingProgress) => void): () => void {
        this.progressListeners.add(listener);
        return () => this.progressListeners.delete(listener);
    }

    getTileState(): TileServiceState {
        return { ...this.tileState };
    }

    private notifyTileListeners(): void {
        this.tileListeners.forEach(listener => listener(this.getTileState()));
    }

    private notifyProgressListeners(progress: ProcessingProgress): void {
        this.progressListeners.forEach(listener => listener(progress));
    }

    private setTileState(updates: Partial<TileServiceState>): void {
        this.tileState = { ...this.tileState, ...updates };
        this.notifyTileListeners();
    }

    private updateTileProgress(step: 'processing' | 'downloading', message: string, progress: number): void {
        this.setTileState({
            currentStep: step,
            progress
        });

        this.notifyProgressListeners({ step, message, progress });
    }

    private getTileCacheKey(request: TerrainTileRequest): string {
        const scale = request.scale || 30;
        return `tile_${request.centerLat}_${request.centerLng}_${scale}`;
    }

    private validateTileRequest(request: TerrainTileRequest): void {
        if (Math.abs(request.centerLat) > 90) {
            throw new Error('Center latitude must be between -90 and 90');
        }
        if (Math.abs(request.centerLng) > 180) {
            throw new Error('Center longitude must be between -180 and 180');
        }
        if (request.scale && request.scale <= 0) {
            throw new Error('Scale must be positive');
        }
    }

    async generateTile(request: TerrainTileRequest): Promise<TileHeightmapData> {
        try {
            this.validateTileRequest(request);

            const cacheKey = this.getTileCacheKey(request);
            const cached = this.tileState.tileCache.get(cacheKey);
            if (cached) {
                console.log('🎯 Returning cached tile data for:', cacheKey);
                this.setTileState({
                    currentStep: 'complete',
                    progress: 100,
                    lastResponse: null
                });
                return cached;
            }

            this.setTileState({
                isLoading: true,
                currentStep: 'processing',
                progress: 0,
                error: null,
                currentRequest: request
            });

            console.log('🚀 Starting tile generation process...', request);
            this.updateTileProgress('processing', 'Generating terrain tile...', 10);

            const response = await apiService.generateTile(request);

            if (!response.ok) {
                throw new Error(`Backend error: ${response.status} ${response.statusText}`);
            }

            const backendResult: TerrainTileResponse = await response.json();
            console.log('✅ Backend tile generation response received:', backendResult);

            this.updateTileProgress('processing', 'Tile generated, downloading TIF...', 50);

            const tiffData = await this.downloadAndProcessTiff(backendResult.cacheInfo.downloadUrl);

            this.updateTileProgress('downloading', 'TIF processing complete!', 95);

            const tileHeightmapData: TileHeightmapData = {
                width: tiffData.width,
                height: tiffData.height,
                heightData: tiffData.elevationData,
                centerCoordinates: backendResult.cacheInfo.centerCoordinates,
                region: backendResult.cacheInfo.region,
                scale: backendResult.cacheInfo.scale,
                tileSize: backendResult.cacheInfo.tileSize,
                filename: backendResult.cacheInfo.filename,
                downloadUrl: backendResult.cacheInfo.downloadUrl,
                etag: backendResult.r2Result.etag
            };

            this.tileState.tileCache.set(cacheKey, tileHeightmapData);

            this.setTileState({
                isLoading: false,
                currentStep: 'complete',
                progress: 100,
                lastResponse: backendResult,
                error: null
            });

            console.log('✅ Tile generation completed successfully');
            return tileHeightmapData;

        } catch (error) {
            console.error('❌ Error in tile generation process:', error);

            let errorMessage = 'Unknown error occurred';

            if (error instanceof Error) {
                errorMessage = error.message;
            }

            this.setTileState({
                isLoading: false,
                currentStep: 'idle',
                progress: 0,
                error: errorMessage
            });

            throw new Error(errorMessage);
        }
    }


    private async downloadAndProcessTiff(downloadUrl: string): Promise<{
        elevationData: Float32Array;
        width: number;
        height: number;
        bounds: number[];
    }> {
        try {
            console.log('🔄 Downloading TIF file from backend:', downloadUrl);
            this.updateTileProgress('downloading', 'Downloading TIF file...', 60);

            const response = await apiService.downloadFile(downloadUrl);

            if (!response.ok) {
                throw new Error(`Failed to download TIF: ${response.status} ${response.statusText}`);
            }

            const arrayBuffer = await response.arrayBuffer();
            console.log('✅ TIF downloaded, size:', arrayBuffer.byteLength);

            this.updateTileProgress('downloading', 'Processing TIF file...', 80);

            // Process with geotiff
            const tiff = await fromArrayBuffer(arrayBuffer);
            const image = await tiff.getImage();
            const rasters = await image.readRasters();

            // Extract data
            const width = image.getWidth();
            const height = image.getHeight();
            const bounds = image.getBoundingBox();
            const elevationData = new Float32Array(rasters[0] as ArrayLike<number>);

            // Calculate min/max height efficiently
            let minHeight = elevationData[0];
            let maxHeight = elevationData[0];

            for (let i = 1; i < elevationData.length; i++) {
                const value = elevationData[i];
                if (value < minHeight) minHeight = value;
                if (value > maxHeight) maxHeight = value;
            }

            console.log('✅ TIF processed:', {
                width,
                height,
                dataSize: elevationData.length,
                minHeight: minHeight.toFixed(1) + 'm',
                maxHeight: maxHeight.toFixed(1) + 'm',
                range: (maxHeight - minHeight).toFixed(1) + 'm'
            });

            return {
                elevationData,
                width,
                height,
                bounds: [bounds[0], bounds[1], bounds[2], bounds[3]]
            };

        } catch (error) {
            console.error('❌ Error downloading/processing TIF:', error);
            throw new Error(`Failed to process TIF: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Get cached tile data
     */
    getCachedTile(request: TerrainTileRequest): TileHeightmapData | null {
        const cacheKey = this.getTileCacheKey(request);
        return this.tileState.tileCache.get(cacheKey) || null;
    }

    /**
     * Clear tile cache
     */
    clearTileCache(): void {
        console.log('🧹 Clearing tile cache...');
        this.setTileState({
            tileCache: new Map()
        });
    }

    /**
     * Get tile cache statistics
     */
    getTileCacheStats(): { count: number; keys: string[]; totalSize: number } {
        let totalSize = 0;
        this.tileState.tileCache.forEach(data => {
            totalSize += data.heightData.byteLength;
        });

        return {
            count: this.tileState.tileCache.size,
            keys: Array.from(this.tileState.tileCache.keys()),
            totalSize
        };
    }

    /**
     * Test backend connection
     */
    async testConnection(): Promise<boolean> {
        try {
            return await apiService.testConnection();
        } catch (error) {
            console.error('❌ Backend connection test failed:', error);
            return false;
        }
    }

    /**
     * Get download URL for a cached file
     */
    getDownloadUrl(filename: string): string {
        return apiService.getFileDownloadUrl(filename);
    }
}

// Export a singleton instance
export const terrainService = new TerrainService(); 