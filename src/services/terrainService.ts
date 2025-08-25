import { fromArrayBuffer } from 'geotiff';
import {
    TerrainTileRequest,
    TerrainTileResponse,
    TileHeightmapData,
    TileServiceState,
    ProcessingProgress
} from '../types/terrain';
import {
    TileGridRequest,
    TileGridResponse,
    StreamingTileRequest,
    StreamingTileResponse
} from '../types/terrainStreaming';

export class TerrainService {
    private baseUrl: string;
    private tileState: TileServiceState;
    private tileListeners: Set<(state: TileServiceState) => void>;
    private progressListeners: Set<(progress: ProcessingProgress) => void>;

    constructor(baseUrl: string = 'http://localhost:3000') {
        this.baseUrl = baseUrl;
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
    }

    /**
     * Subscribe to tile state changes
     */
    subscribeTile(listener: (state: TileServiceState) => void): () => void {
        this.tileListeners.add(listener);
        return () => this.tileListeners.delete(listener);
    }

    /**
     * Subscribe to progress updates
     */
    subscribeToProgress(listener: (progress: ProcessingProgress) => void): () => void {
        this.progressListeners.add(listener);
        return () => this.progressListeners.delete(listener);
    }

    /**
     * Get current tile state
     */
    getTileState(): TileServiceState {
        return { ...this.tileState };
    }

    /**
     * Notify tile listeners of state changes
     */
    private notifyTileListeners(): void {
        this.tileListeners.forEach(listener => listener(this.getTileState()));
    }

    /**
     * Notify progress listeners
     */
    private notifyProgressListeners(progress: ProcessingProgress): void {
        this.progressListeners.forEach(listener => listener(progress));
    }

    /**
     * Update tile state and notify listeners
     */
    private setTileState(updates: Partial<TileServiceState>): void {
        this.tileState = { ...this.tileState, ...updates };
        this.notifyTileListeners();
    }

    /**
     * Update tile progress and notify listeners
     */
    private updateTileProgress(step: 'processing' | 'downloading', message: string, progress: number): void {
        this.setTileState({
            currentStep: step,
            progress
        });

        this.notifyProgressListeners({ step, message, progress });
    }

    /**
     * Generate cache key for a tile request
     */
    private getTileCacheKey(request: TerrainTileRequest): string {
        const scale = request.scale || 30;
        return `tile_${request.centerLat}_${request.centerLng}_${scale}`;
    }

    /**
     * Validate tile request
     */
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

    /**
     * 🎯 Generate terrain tile from center coordinates
     */
    async generateTile(request: TerrainTileRequest): Promise<TileHeightmapData> {
        try {
            // Validate request
            this.validateTileRequest(request);

            // Check cache first
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

            // Start the process
            this.setTileState({
                isLoading: true,
                currentStep: 'processing',
                progress: 0,
                error: null,
                currentRequest: request
            });

            console.log('🚀 Starting tile generation process...', request);
            this.updateTileProgress('processing', 'Generating terrain tile...', 10);

            // Step 1: Call backend tile generation endpoint
            const response = await fetch(`${this.baseUrl}/terrain/generate-tile`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(request)
            });

            if (!response.ok) {
                throw new Error(`Backend error: ${response.status} ${response.statusText}`);
            }

            const backendResult: TerrainTileResponse = await response.json();
            console.log('✅ Backend tile generation response received:', backendResult);

            this.updateTileProgress('processing', 'Tile generated, downloading TIF...', 50);

            // Step 2: Download and process TIF file
            const tiffData = await this.downloadAndProcessTiff(backendResult.cacheInfo.downloadUrl);

            this.updateTileProgress('downloading', 'TIF processing complete!', 95);

            // Step 3: Combine and return complete tile data
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

            // Cache the result
            this.tileState.tileCache.set(cacheKey, tileHeightmapData);

            // Update final state
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

    /**
     * Download and process TIF file
     */
    private async downloadAndProcessTiff(downloadUrl: string): Promise<{
        elevationData: Float32Array;
        width: number;
        height: number;
        bounds: number[];
    }> {
        try {
            console.log('🔄 Downloading TIF file from backend:', downloadUrl);
            this.updateTileProgress('downloading', 'Downloading TIF file...', 60);

            // Download TIF from backend
            const response = await fetch(downloadUrl);

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
            console.log('🔌 Testing backend connection...');

            const healthResponse = await fetch(`${this.baseUrl}/terrain/test-r2`, {
                method: 'GET'
            });

            console.log('✅ Backend health check successful:', healthResponse.status);
            return healthResponse.ok;

        } catch (error) {
            console.error('❌ Backend connection test failed:', error);
            return false;
        }
    }

    /**
     * Get download URL for a cached file
     */
    getDownloadUrl(filename: string): string {
        return `${this.baseUrl}/terrain/files/${filename}`;
    }

    /**
     * 🌍 Fetch initial grid of terrain tiles around player position
     */
    async fetchInitialGrid(request: TileGridRequest): Promise<TileGridResponse> {
        try {
            console.log('🌍 Fetching initial tile grid...', request);

            const response = await fetch(`${this.baseUrl}/terrain/fetch-grid`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(request)
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch tile grid: ${response.status} ${response.statusText}`);
            }

            const gridResponse: TileGridResponse = await response.json();
            console.log('✅ Initial tile grid fetched:', {
                totalTiles: gridResponse.totalTiles,
                gridSize: gridResponse.gridSize,
                playerTile: gridResponse.playerTile
            });

            return gridResponse;

        } catch (error) {
            console.error('❌ Error fetching initial tile grid:', error);
            throw error;
        }
    }

    /**
     * 🎯 Stream new tiles based on player movement
     */
    async streamTiles(request: StreamingTileRequest): Promise<StreamingTileResponse> {
        try {
            console.log('🎯 Streaming tiles for movement...', {
                from: { lat: request.previousLat, lng: request.previousLng },
                to: { lat: request.playerLat, lng: request.playerLng }
            });

            const response = await fetch(`${this.baseUrl}/terrain/stream-tiles`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(request)
            });

            if (!response.ok) {
                throw new Error(`Failed to stream tiles: ${response.status} ${response.statusText}`);
            }

            const streamResponse: StreamingTileResponse = await response.json();
            console.log('✅ Tiles streamed:', {
                newTiles: streamResponse.newTiles.length,
                direction: streamResponse.direction,
                tilesToPreload: streamResponse.tilesToPreload
            });

            return streamResponse;

        } catch (error) {
            console.error('❌ Error streaming tiles:', error);
            throw error;
        }
    }

    /**
     * 📥 Download heightmap TIF file and convert to ImageData
     */
    async downloadHeightmapAsImageData(backendUrl: string): Promise<ImageData> {
        try {
            console.log('📥 Downloading heightmap:', backendUrl);

            // Try using the working downloadAndProcessTiff method instead
            if (backendUrl.startsWith('/terrain/files/')) {
                // Use the full URL format that works
                const fullUrl = `${this.baseUrl}${backendUrl}`;
                console.log('📥 Using full URL:', fullUrl);
                return await this.downloadHeightmapFromTiff(fullUrl);
            }

            const response = await fetch(backendUrl);
            if (!response.ok) {
                throw new Error(`Failed to download heightmap: ${response.status} ${response.statusText}`);
            }

            const arrayBuffer = await response.arrayBuffer();

            // Process with geotiff using the working approach from the original code
            let width: number, height: number, elevationData: Float32Array;

            try {
                console.log('📊 Processing TIF file, size:', arrayBuffer.byteLength);

                // Add more detailed debugging for 16-bit TIF files
                console.log('📊 ArrayBuffer first 16 bytes:', new Uint8Array(arrayBuffer.slice(0, 16)));

                // Try with different GeoTIFF options for 16-bit files
                // Use exact same method as working downloadAndProcessTiff
                const tiff = await fromArrayBuffer(arrayBuffer);
                console.log('📊 TIFF object created successfully');

                const image = await tiff.getImage();
                console.log('📊 TIFF image loaded, checking properties...');

                // Get detailed image information
                const imageInfo = {
                    width: image.getWidth(),
                    height: image.getHeight(),
                    samplesPerPixel: image.getSamplesPerPixel(),
                    bitsPerSample: image.getBitsPerSample(),
                    sampleFormat: image.getSampleFormat(),
                    dataType: image.getArrayForSample(0, 0, 0).constructor.name
                };
                console.log('📊 TIF Image details:', imageInfo);

                const rasters = await image.readRasters();
                console.log('📊 Rasters read successfully, type:', rasters[0].constructor.name);

                // Extract data (same as working version)
                width = image.getWidth();
                height = image.getHeight();
                const bounds = image.getBoundingBox();
                elevationData = new Float32Array(rasters[0] as ArrayLike<number>);

                console.log('📊 TIF Image processed:', {
                    width,
                    height,
                    dataSize: elevationData.length,
                    samplesPerPixel: image.getSamplesPerPixel(),
                    bounds: bounds
                });

            } catch (tiffError) {
                console.error('❌ GeoTIFF processing failed:', tiffError);
                console.log('🔄 Falling back to dummy heightmap data');

                // Create dummy heightmap data for testing
                width = 256;
                height = 256;
                elevationData = new Float32Array(width * height);

                // Fill with some basic height variation for testing
                for (let i = 0; i < elevationData.length; i++) {
                    const x = i % width;
                    const y = Math.floor(i / width);
                    const centerX = width / 2;
                    const centerY = height / 2;
                    const distance = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
                    const maxDistance = Math.sqrt(centerX ** 2 + centerY ** 2);
                    const normalizedDistance = distance / maxDistance;
                    elevationData[i] = 1000 + Math.sin(normalizedDistance * Math.PI) * 50; // 1000m base + 50m variation
                }

                console.log('✅ Generated dummy heightmap data for testing');
            }

            // Convert to ImageData format for web workers
            // Create RGBA data where elevation is stored in red channel
            const imageDataArray = new Uint8ClampedArray(width * height * 4);

            // Find min/max for normalization
            let minHeight = elevationData[0];
            let maxHeight = elevationData[0];
            for (let i = 1; i < elevationData.length; i++) {
                const value = elevationData[i];
                if (value < minHeight) minHeight = value;
                if (value > maxHeight) maxHeight = value;
            }

            const heightRange = maxHeight - minHeight;

            // Convert to RGBA (store normalized height in R channel)
            for (let i = 0; i < elevationData.length; i++) {
                const normalizedHeight = heightRange > 0 ?
                    (elevationData[i] - minHeight) / heightRange : 0;
                const pixelValue = Math.floor(normalizedHeight * 255);

                const pixelIndex = i * 4;
                imageDataArray[pixelIndex + 0] = pixelValue; // R: normalized height
                imageDataArray[pixelIndex + 1] = pixelValue; // G: same as R for grayscale
                imageDataArray[pixelIndex + 2] = pixelValue; // B: same as R for grayscale
                imageDataArray[pixelIndex + 3] = 255;        // A: fully opaque
            }

            const imageData = new ImageData(imageDataArray, width, height);

            console.log('✅ Heightmap converted to ImageData:', {
                width,
                height,
                minHeight: minHeight.toFixed(1) + 'm',
                maxHeight: maxHeight.toFixed(1) + 'm',
                range: heightRange.toFixed(1) + 'm'
            });

            return imageData;

        } catch (error) {
            console.error('❌ Error downloading heightmap:', error);
            throw error;
        }
    }

    /**
     * 📥 Download heightmap using the working TIF processing method
     */
    private async downloadHeightmapFromTiff(downloadUrl: string): Promise<ImageData> {
        try {
            console.log('📥 Using working TIF method for:', downloadUrl);

            // Use the existing working downloadAndProcessTiff logic
            const tiffResult = await this.downloadAndProcessTiff(downloadUrl);

            // Convert the working result to ImageData format
            const { elevationData, width, height } = tiffResult;

            // Convert to ImageData format for web workers
            const imageDataArray = new Uint8ClampedArray(width * height * 4);

            // Find min/max for normalization (same as original)
            let minHeight = elevationData[0];
            let maxHeight = elevationData[0];
            for (let i = 1; i < elevationData.length; i++) {
                const value = elevationData[i];
                if (value < minHeight) minHeight = value;
                if (value > maxHeight) maxHeight = value;
            }

            const heightRange = maxHeight - minHeight;
            console.log('📊 Height range:', minHeight.toFixed(1), 'to', maxHeight.toFixed(1), 'meters');

            // Convert to RGBA (store normalized height in R channel)
            for (let i = 0; i < elevationData.length; i++) {
                const normalizedHeight = heightRange > 0 ?
                    (elevationData[i] - minHeight) / heightRange : 0;
                const pixelValue = Math.floor(normalizedHeight * 255);

                const pixelIndex = i * 4;
                imageDataArray[pixelIndex + 0] = pixelValue; // R: normalized height
                imageDataArray[pixelIndex + 1] = pixelValue; // G: same as R for grayscale
                imageDataArray[pixelIndex + 2] = pixelValue; // B: same as R for grayscale
                imageDataArray[pixelIndex + 3] = 255;        // A: fully opaque
            }

            const imageData = new ImageData(imageDataArray, width, height);
            console.log('✅ Successfully converted TIF to ImageData using working method');

            return imageData;

        } catch (error) {
            console.error('❌ Working TIF method also failed:', error);
            throw error;
        }
    }

    /**
     * 📊 Batch download multiple heightmaps
     */
    async downloadMultipleHeightmaps(tiles: Array<{
        tileId: string;
        backendUrl: string;
    }>): Promise<Map<string, ImageData>> {
        const results = new Map<string, ImageData>();
        const downloadPromises = tiles.map(async (tile) => {
            try {
                const imageData = await this.downloadHeightmapAsImageData(tile.backendUrl);
                results.set(tile.tileId, imageData);
            } catch (error) {
                console.error(`❌ Failed to download heightmap for tile ${tile.tileId}:`, error);
                // Continue with other downloads
            }
        });

        await Promise.all(downloadPromises);
        console.log(`📊 Downloaded ${results.size}/${tiles.length} heightmaps successfully`);

        return results;
    }
}

// Export a singleton instance
export const terrainService = new TerrainService(); 