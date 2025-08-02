export interface ProcessingProgress {
    step: 'processing' | 'downloading';
    message: string;
    progress: number; // 0-100
}

// === TERRAIN TILE GENERATION INTERFACES ===

export interface TerrainTileRequest {
    centerLat: number;    // Center latitude coordinate
    centerLng: number;    // Center longitude coordinate  
    scale?: number;       // Optional scale in meters (default: 30)
}

export interface TerrainTileResponse {
    geeResult: {
        success: boolean;
        filename: string;
        region: {
            west: number;
            south: number;
            east: number;
            north: number;
        };
        scale: number;
    };
    r2Result: {
        objectKey: string;
        uri: string;
        etag: string;
        versionId: string;
    };
    cacheInfo: {
        filename: string;
        backendUrl: string;        // Relative URL: /terrain/files/{filename}
        downloadUrl: string;       // Full URL: http://localhost:3000/terrain/files/{filename}
        region: {
            west: number;
            south: number;
            east: number;
            north: number;
        };
        scale: number;
        centerCoordinates: {
            lat: number;
            lng: number;
        };
        tileSize: number;          // Fixed at 0.01 degrees
    };
}

export interface TileHeightmapData {
    width: number;
    height: number;
    heightData: Float32Array;
    centerCoordinates: {
        lat: number;
        lng: number;
    };
    region: {
        west: number;
        south: number;
        east: number;
        north: number;
    };
    scale: number;
    tileSize: number;
    filename: string;
    downloadUrl: string;
    etag: string;
}

export interface TileServiceState {
    isLoading: boolean;
    currentStep: 'idle' | 'processing' | 'downloading' | 'complete';
    progress: number; // 0-100
    error: string | null;
    currentRequest: TerrainTileRequest | null;
    lastResponse: TerrainTileResponse | null;
    tileCache: Map<string, TileHeightmapData>;
} 