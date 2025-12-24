/**
 * 🌍 Terrain Tile Streaming System Types
 * WebGPU-based terrain tile management for dynamic loading
 */

// === BACKEND API INTERFACES ===

export interface TileGridRequest {
    playerLat: number;
    playerLng: number;
    gridRadius?: number; // default: 3 (creates 7x7 grid = 49 tiles)
    scale?: number; // default: 30 meters per pixel
}

export interface TileGridResponse {
    tiles: Array<{
        tileId: string;
        tileX: number;
        tileY: number;
        centerLat: number;
        centerLng: number;
        filename: string;
        backendUrl: string; // e.g., "/terrain/files/heightmap_tile_1_2_30.tif"
        cached: boolean;
    }>;
    playerTile: { tileX: number; tileY: number };
    gridSize: number;
    totalTiles: number;
}

export interface StreamingTileRequest {
    playerLat: number;
    playerLng: number;
    previousLat: number;
    previousLng: number;
    preloadDistance?: number; // default: 2 tiles ahead
    scale?: number; // default: 30
}

export interface StreamingTileResponse {
    newTiles: Array<{
        tileId: string;
        tileX: number;
        tileY: number;
        centerLat: number;
        centerLng: number;
        filename: string;
        backendUrl: string;
        cached: boolean;
    }>;
    playerTile: { tileX: number; tileY: number };
    direction: { x: number; y: number };
    tilesToPreload: number;
}

// === WEBGPU TERRAIN RESOURCES ===

export interface TerrainMeshData {
    vertices: Float32Array; // positions, normals, UVs
    indices: Uint32Array;
    vertexCount: number;
    indexCount: number;
}

export interface TerrainTile {
    // Tile identification
    tileId: string;
    tileX: number;
    tileY: number;
    centerLat: number;
    centerLng: number;
    worldPosition: { x: number; z: number };

    // Heightmap data
    heightmapData?: ImageData;
    width: number;
    height: number;

    // WebGPU Resources
    vertexBuffer?: GPUBuffer;
    indexBuffer?: GPUBuffer;
    heightTexture?: GPUTexture;
    normalTexture?: GPUTexture;

    // Mesh data
    meshData?: TerrainMeshData;

    // State management
    isLoaded: boolean;
    isGeneratingMesh: boolean;
    gpuResourcesCreated: boolean;
    loadStartTime?: number;
    lastAccessTime: number;

    // Backend info
    filename: string;
    backendUrl: string;
    cached: boolean;
}

// === VERTEX BUFFER MANAGEMENT ===

export interface VertexBufferManager {
    // Buffer allocation
    allocateVertexBuffer(size: number): GPUBuffer;
    allocateIndexBuffer(size: number): GPUBuffer;

    // Buffer updates
    updateVertexData(buffer: GPUBuffer, data: Float32Array, offset?: number): void;
    updateIndexData(buffer: GPUBuffer, data: Uint32Array, offset?: number): void;

    // Memory management
    deallocateBuffer(buffer: GPUBuffer): void;
    getMemoryUsage(): { vertex: number; index: number; total: number };

    // Batch operations
    updateMultipleTiles(tiles: TerrainTile[]): Promise<void>;
}

export interface GPUMemoryStats {
    totalVertexBuffers: number;
    totalIndexBuffers: number;
    totalVertexMemory: number;
    totalIndexMemory: number;
    totalTiles: number;
    loadedTiles: number;
    tilesWithGPUResources: number;
}

// === TERRAIN MANAGER CONFIGURATION ===

export interface TerrainManagerConfig {
    tileMeshResolution: number; // vertices per tile edge (e.g., 256x256)
    maxTilesInMemory: number; // maximum tiles to keep in GPU memory
    preloadDistance: number; // tiles to preload ahead of player
    baseUrl: string; // backend URL
    defaultScale: number; // default meters per pixel
    meshGenerationWorkers?: number; // number of web workers for mesh generation
}

// === AUTO-FETCH SYSTEM ===

export interface PlayerPosition {
    lat: number;
    lng: number;
    tileX?: number;
    tileY?: number;
}

export interface TileLoadPriority {
    tileId: string;
    distance: number;
    priority: number; // higher = more important
}

export interface LoadingQueue {
    fetchQueue: Set<string>; // tileIds being fetched
    meshGenerationQueue: Set<string>; // tiles generating meshes
    gpuUploadQueue: Set<string>; // tiles uploading to GPU
}

// === MESH GENERATION (WEB WORKER) ===

export interface MeshGenerationRequest {
    tileId: string;
    heightmapData: ImageData;
    width: number;
    height: number;
    resolution: number;
    worldPosition: { x: number; z: number };
}

export interface MeshGenerationResponse {
    tileId: string;
    success: boolean;
    meshData?: TerrainMeshData;
    error?: string;
    processingTime: number;
}

// === RENDERING INTEGRATION ===

export interface TerrainRenderData {
    visibleTiles: TerrainTile[];
    viewMatrix: Float32Array;
    projectionMatrix: Float32Array;
    cameraPosition: { x: number; y: number; z: number };
}

export interface TerrainRenderPass {
    renderPipeline: GPURenderPipeline;
    bindGroupLayout: GPUBindGroupLayout;

    // Per-tile rendering
    renderTile(tile: TerrainTile, viewMatrix: Float32Array, projMatrix: Float32Array): void;

    // Batch rendering
    renderVisibleTiles(visibleTiles: TerrainTile[]): void;
}

// === COORDINATE CONVERSION ===

export interface TileCoordinates {
    tileX: number;
    tileY: number;
    localX?: number; // position within tile [0-1]
    localY?: number; // position within tile [0-1]
}

export interface WorldCoordinates {
    x: number;
    z: number;
}

export interface GeographicCoordinates {
    lat: number;
    lng: number;
}

// === ERROR HANDLING ===

export interface TerrainError {
    type: 'network' | 'gpu' | 'mesh_generation' | 'memory' | 'invalid_data';
    message: string;
    tileId?: string;
    timestamp: number;
    retryable: boolean;
}

// === PERFORMANCE MONITORING ===

export interface PerformanceMetrics {
    frameRate: number;
    tileLoadTime: number; // average ms to load a tile
    meshGenerationTime: number; // average ms to generate mesh
    gpuUploadTime: number; // average ms to upload to GPU
    memoryUsage: GPUMemoryStats;
    activeWorkers: number;
    queueSizes: {
        fetch: number;
        meshGeneration: number;
        gpuUpload: number;
    };
}

// === EVENTS ===

export interface TerrainStreamingEvents {
    onTileLoaded: (tile: TerrainTile) => void;
    onTileUnloaded: (tileId: string) => void;
    onMeshGenerated: (tileId: string, meshData: TerrainMeshData) => void;
    onGPUResourcesCreated: (tileId: string) => void;
    onError: (error: TerrainError) => void;
    onPerformanceUpdate: (metrics: PerformanceMetrics) => void;
}

// === CACHING ===

export interface TileCacheEntry {
    tileId: string;
    heightmapData: ImageData;
    meshData?: TerrainMeshData;
    lastAccessed: number;
    accessCount: number;
    memorySize: number;
}

export interface CacheStats {
    totalEntries: number;
    totalMemoryUsage: number;
    hitRate: number;
    oldestEntry: number;
    newestEntry: number;
}
