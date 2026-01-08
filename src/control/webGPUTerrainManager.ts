/**
 * 🌍 WebGPU Terrain Manager
 * Main orchestrator for terrain tile streaming system with WebGPU vertex buffer management
 */

import {
    TerrainTile,
    TerrainManagerConfig,
    PlayerPosition,
    LoadingQueue,
    GPUMemoryStats,
    TerrainStreamingEvents,
    MeshGenerationRequest,
    GeographicCoordinates,
    WorldCoordinates,
    TileGridResponse,
    StreamingTileResponse
} from '../types/terrainStreaming';

import { VertexBufferManager } from '../view/vertexBufferManager';
import { TerrainWorkerManager } from '../workers/terrainWorkerManager';
import { terrainService } from '../services/terrainService';

export class WebGPUTerrainManager {
    private _device: GPUDevice;
    private config: TerrainManagerConfig;
    private vertexBufferManager: VertexBufferManager;
    private workerManager: TerrainWorkerManager;

    // Tile management
    private loadedTiles: Map<string, TerrainTile> = new Map();
    private currentPlayerPosition: PlayerPosition = { lat: 0, lng: 0 };
    private previousPlayerPosition: PlayerPosition = { lat: 0, lng: 0 };

    // Loading state
    private loadingQueue: LoadingQueue = {
        fetchQueue: new Set(),
        meshGenerationQueue: new Set(),
        gpuUploadQueue: new Set()
    };

    // Events
    private eventHandlers: Partial<TerrainStreamingEvents> = {};

    // Status tracking
    private statusCallback?: (status: any) => void;
    private logCallback?: (message: string, type: 'info' | 'success' | 'error' | 'warning') => void;

    // Performance tracking (reserved for future use)
    private _performanceMetrics = {
        tilesLoaded: 0,
        tilesUnloaded: 0,
        averageLoadTime: 0,
        lastUpdateTime: Date.now()
    };

    constructor(device: GPUDevice, config: Partial<TerrainManagerConfig> = {}) {
        this._device = device;

        // Set default configuration
        this.config = {
            tileMeshResolution: config.tileMeshResolution || 256,
            maxTilesInMemory: config.maxTilesInMemory || 100,
            preloadDistance: config.preloadDistance || 2,
            baseUrl: config.baseUrl || 'http://localhost:3000',
            defaultScale: config.defaultScale || 30,
            meshGenerationWorkers: config.meshGenerationWorkers || 4
        };

        // Initialize managers
        this.vertexBufferManager = new VertexBufferManager(device);
        this.workerManager = new TerrainWorkerManager(this.config.meshGenerationWorkers);

        console.log('🌍 WebGPUTerrainManager initialized', this.config);
    }

    /**
     * Initialize the terrain manager
     */
    async initialize(): Promise<void> {
        console.log('🚀 Initializing WebGPUTerrainManager...');

        // Initialize worker pool
        await this.workerManager.initialize();

        console.log('✅ WebGPUTerrainManager ready');
    }

    /**
     * Load initial terrain grid around player spawn position
     */
    async loadInitialGrid(playerLat: number, playerLng: number, gridRadius: number = 3): Promise<void> {
        console.log(`🌍 Loading initial terrain grid at ${playerLat}, ${playerLng} (radius: ${gridRadius})`);

        try {
            // Update player position
            this.currentPlayerPosition = { lat: playerLat, lng: playerLng };
            this.previousPlayerPosition = { lat: playerLat, lng: playerLng };

            // Fetch initial grid from backend
            const gridSize = (gridRadius * 2 + 1);
            this.logCallback?.(`📡 Fetching ${gridSize}x${gridSize} tile grid (${gridSize * gridSize} tiles) from backend...`, 'info');
            const gridResponse = await terrainService.fetchInitialGrid({
                playerLat,
                playerLng,
                gridRadius,
                scale: this.config.defaultScale
            });
            this.logCallback?.(`📥 Received ${gridResponse.totalTiles} tiles to load`, 'success');

            // Process tiles in parallel
            const loadPromises = gridResponse.tiles.map((tileInfo: TileGridResponse['tiles'][0]) => {
                return this.loadTile(tileInfo);
            });

            await Promise.allSettled(loadPromises);

            this.logCallback?.(`✅ Initial grid loaded: ${this.loadedTiles.size} tiles ready`, 'success');
            console.log(`✅ Initial grid loaded: ${this.loadedTiles.size} tiles ready`);

        } catch (error) {
            console.error('❌ Failed to load initial grid:', error);
            this.handleError('network', 'Failed to load initial terrain grid', error);
        }
    }

    /**
     * Update player position and trigger streaming if needed
     */
    async updatePlayerPosition(lat: number, lng: number): Promise<void> {
        const oldPosition = this.currentPlayerPosition;
        this.currentPlayerPosition = { lat, lng };

        // Calculate movement distance
        const movementDistance = this.calculateDistance(
            oldPosition.lat, oldPosition.lng,
            lat, lng
        );

        // Only trigger streaming if player moved significantly (e.g., > 100m)
        if (movementDistance > 0.001) { // ~100m at equator
            console.log(`🎯 Player moved ${(movementDistance * 111000).toFixed(0)}m, checking for new tiles...`);

            try {
                // Stream new tiles based on movement
                const streamResponse = await terrainService.streamTiles({
                    playerLat: lat,
                    playerLng: lng,
                    previousLat: this.previousPlayerPosition.lat,
                    previousLng: this.previousPlayerPosition.lng,
                    preloadDistance: this.config.preloadDistance,
                    scale: this.config.defaultScale
                });

                // Load new tiles
                if (streamResponse.newTiles.length > 0) {
                    const loadPromises = streamResponse.newTiles.map((tileInfo: StreamingTileResponse['newTiles'][0]) => {
                        return this.loadTile(tileInfo);
                    });

                    await Promise.allSettled(loadPromises);
                    console.log(`📥 Loaded ${streamResponse.newTiles.length} new tiles`);
                }

                // Clean up distant tiles
                this.cleanupDistantTiles();

                this.previousPlayerPosition = { lat, lng };

            } catch (error) {
                console.error('❌ Failed to stream tiles:', error);
                this.handleError('network', 'Failed to stream new tiles', error);
            }
        }
    }

    /**
     * Load a single terrain tile
     */
    private async loadTile(tileInfo: any): Promise<void> {
        const tileId = tileInfo.tileId;

        // Skip if already loaded or loading
        if (this.loadedTiles.has(tileId) || this.loadingQueue.fetchQueue.has(tileId)) {
            return;
        }

        this.loadingQueue.fetchQueue.add(tileId);
        const loadStartTime = Date.now();

        try {
            // Create tile entry
            const tile: TerrainTile = {
                tileId,
                tileX: tileInfo.tileX,
                tileY: tileInfo.tileY,
                centerLat: tileInfo.centerLat,
                centerLng: tileInfo.centerLng,
                worldPosition: this.geoToWorldCoordinates({
                    lat: tileInfo.centerLat,
                    lng: tileInfo.centerLng
                }),
                width: 0,
                height: 0,
                isLoaded: false,
                isGeneratingMesh: false,
                gpuResourcesCreated: false,
                lastAccessTime: Date.now(),
                filename: tileInfo.filename,
                backendUrl: tileInfo.backendUrl,
                cached: tileInfo.cached
            };

            this.loadedTiles.set(tileId, tile);

            // Download heightmap
            const heightmapData = await terrainService.downloadHeightmapAsImageData(tileInfo.backendUrl);
            tile.heightmapData = heightmapData;
            tile.width = heightmapData.width;
            tile.height = heightmapData.height;

            console.log(`📥 Downloaded heightmap for ${tileId}: ${tile.width}x${tile.height}`);

            // Generate mesh in Web Worker
            await this.generateMeshForTile(tile);

            // Create GPU resources
            await this.createGPUResourcesForTile(tile);

            tile.isLoaded = true;
            const loadTime = Date.now() - loadStartTime;

            console.log(`✅ Tile ${tileId} loaded in ${loadTime}ms`);
            this.eventHandlers.onTileLoaded?.(tile);
            this.emitStatusUpdate();

        } catch (error) {
            console.error(`❌ Failed to load tile ${tileId}:`, error);
            this.loadedTiles.delete(tileId);
            this.handleError('network', `Failed to load tile ${tileId}`, error);
        } finally {
            this.loadingQueue.fetchQueue.delete(tileId);
        }
    }

    /**
     * Generate mesh for a tile using Web Worker
     */
    private async generateMeshForTile(tile: TerrainTile): Promise<void> {
        if (!tile.heightmapData) {
            throw new Error(`No heightmap data for tile ${tile.tileId}`);
        }

        this.loadingQueue.meshGenerationQueue.add(tile.tileId);
        tile.isGeneratingMesh = true;

        try {
            const request: MeshGenerationRequest = {
                tileId: tile.tileId,
                heightmapData: tile.heightmapData,
                width: tile.width,
                height: tile.height,
                resolution: this.config.tileMeshResolution,
                worldPosition: tile.worldPosition
            };

            const response = await this.workerManager.generateMesh(request);

            if (response.success && response.meshData) {
                tile.meshData = response.meshData;
                console.log(`🏔️ Mesh generated for ${tile.tileId} in ${response.processingTime.toFixed(1)}ms`);
                this.eventHandlers.onMeshGenerated?.(tile.tileId, response.meshData);
            } else {
                throw new Error(response.error || 'Mesh generation failed');
            }

        } finally {
            this.loadingQueue.meshGenerationQueue.delete(tile.tileId);
            tile.isGeneratingMesh = false;
        }
    }

    /**
     * Create GPU resources for a tile
     */
    private async createGPUResourcesForTile(tile: TerrainTile): Promise<void> {
        if (!tile.meshData) {
            throw new Error(`No mesh data for tile ${tile.tileId}`);
        }

        this.loadingQueue.gpuUploadQueue.add(tile.tileId);

        try {
            // Allocate vertex buffer
            tile.vertexBuffer = this.vertexBufferManager.allocateVertexBuffer(
                tile.meshData.vertices.byteLength
            );

            // Allocate index buffer
            tile.indexBuffer = this.vertexBufferManager.allocateIndexBuffer(
                tile.meshData.indices.byteLength
            );

            // Upload data to GPU
            this.vertexBufferManager.updateVertexData(tile.vertexBuffer, tile.meshData.vertices);
            this.vertexBufferManager.updateIndexData(tile.indexBuffer, tile.meshData.indices);

            tile.gpuResourcesCreated = true;

            console.log(`🎮 GPU resources created for ${tile.tileId}`);
            this.eventHandlers.onGPUResourcesCreated?.(tile.tileId);

        } finally {
            this.loadingQueue.gpuUploadQueue.delete(tile.tileId);
        }
    }

    /**
     * Get tiles that are currently visible/renderable
     */
    getVisibleTiles(_cameraPosition?: { x: number; y: number; z: number }): TerrainTile[] {
        const visibleTiles: TerrainTile[] = [];

        for (const tile of this.loadedTiles.values()) {
            if (tile.isLoaded && tile.gpuResourcesCreated && tile.meshData) {
                // Update last access time
                tile.lastAccessTime = Date.now();
                visibleTiles.push(tile);
            }
        }

        console.log(`👁️ ${visibleTiles.length}/${this.loadedTiles.size} tiles are visible`);
        return visibleTiles;
    }

    /**
     * Clean up tiles that are too far from player
     */
    private cleanupDistantTiles(): void {
        const maxDistance = this.config.preloadDistance * 2; // Unload tiles beyond 2x preload distance
        const tilesToRemove: string[] = [];

        for (const [tileId, tile] of this.loadedTiles) {
            const distance = this.calculateDistance(
                this.currentPlayerPosition.lat,
                this.currentPlayerPosition.lng,
                tile.centerLat,
                tile.centerLng
            );

            // Convert to approximate tile distance (assuming ~22km per tile)
            const tileDistance = distance * 111000 / 22000; // Distance in tile units

            if (tileDistance > maxDistance) {
                tilesToRemove.push(tileId);
            }
        }

        if (tilesToRemove.length > 0) {
            console.log(`🧹 Cleaning up ${tilesToRemove.length} distant tiles`);

            for (const tileId of tilesToRemove) {
                this.unloadTile(tileId);
            }
        }
    }

    /**
     * Unload a tile and free its GPU resources
     */
    private unloadTile(tileId: string): void {
        const tile = this.loadedTiles.get(tileId);
        if (!tile) return;

        // Free GPU resources
        if (tile.vertexBuffer) {
            this.vertexBufferManager.deallocateBuffer(tile.vertexBuffer);
        }
        if (tile.indexBuffer) {
            this.vertexBufferManager.deallocateBuffer(tile.indexBuffer);
        }

        // Remove from loaded tiles
        this.loadedTiles.delete(tileId);

        console.log(`🗑️ Unloaded tile ${tileId}`);
        this.eventHandlers.onTileUnloaded?.(tileId);
        this.emitStatusUpdate();
    }

    /**
     * Convert geographic coordinates to world coordinates
     */
    private geoToWorldCoordinates(geo: GeographicCoordinates): WorldCoordinates {
        // Much smaller scale for better visualization - keep tiles close to origin
        const x = (geo.lng + 74.006) * 10; // Offset from NYC center and scale down
        const z = (geo.lat - 40.7128) * 10; // Offset from NYC center and scale down

        return { x, z };
    }

    /**
     * Calculate distance between two geographic points (in degrees)
     */
    private calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
        const dLat = lat2 - lat1;
        const dLng = lng2 - lng1;
        return Math.sqrt(dLat * dLat + dLng * dLng);
    }

    /**
     * Get memory usage statistics
     */
    getMemoryStats(): GPUMemoryStats {
        return this.vertexBufferManager.getDetailedStats();
    }

    /**
     * Register event handler
     */
    on<K extends keyof TerrainStreamingEvents>(
        event: K,
        handler: TerrainStreamingEvents[K]
    ): void {
        this.eventHandlers[event] = handler;
    }

    /**
     * Set status update callback
     */
    setStatusCallback(callback: (status: any) => void): void {
        this.statusCallback = callback;
    }

    /**
     * Set log callback
     */
    setLogCallback(callback: (message: string, type: 'info' | 'success' | 'error' | 'warning') => void): void {
        this.logCallback = callback;
    }

    /**
     * Get current status for UI
     */
    getCurrentStatus(): any {
        const memoryStats = this.vertexBufferManager.getMemoryUsage();
        const workerStats = this.workerManager.getStats();

        return {
            tilesLoaded: this.loadedTiles.size,
            memoryUsage: (memoryStats.total / (1024 * 1024)).toFixed(1), // Convert to MB
            workersActive: workerStats.busyWorkers,
            totalWorkers: workerStats.totalWorkers,
            queueSize: this.loadingQueue.fetchQueue.size + this.loadingQueue.meshGenerationQueue.size + this.loadingQueue.gpuUploadQueue.size,
            playerCoords: this.currentPlayerPosition
        };
    }

    /**
     * Emit status update
     */
    private emitStatusUpdate(): void {
        if (this.statusCallback) {
            this.statusCallback(this.getCurrentStatus());
        }
    }

    /**
     * Handle errors
     */
    private handleError(type: string, message: string, error: any): void {
        console.error(`❌ Terrain Error [${type}]:`, message, error);

        this.eventHandlers.onError?.({
            type: type as any,
            message,
            timestamp: Date.now(),
            retryable: type === 'network'
        });
    }

    /**
     * Clean up and destroy all resources
     */
    async destroy(): Promise<void> {
        console.log('💥 Destroying WebGPUTerrainManager...');

        // Unload all tiles
        for (const tileId of this.loadedTiles.keys()) {
            this.unloadTile(tileId);
        }

        // Destroy managers
        this.vertexBufferManager.destroy();
        await this.workerManager.terminate();

        console.log('💥 WebGPUTerrainManager destroyed');
    }
}
