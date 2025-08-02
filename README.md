# 🌍 WebGPU Private Terrain Heightmap Integration

A WebGPU application with integrated private terrain heightmap fetching from Google Earth Engine via a secure NestJS backend with private R2 storage.

## Features

- **🏔️ Real-time Terrain Fetching**: Fetch 16-bit TIFF heightmaps from Google Earth Engine
- **🔐 Private R2 Storage**: Secure terrain data storage with no public access
- **⚡ WebGPU Rendering**: High-performance 3D rendering with WebGPU
- **🎯 Type-Safe API**: Full TypeScript support with comprehensive interfaces
- **💾 Smart Caching**: Client-side caching to avoid duplicate requests
- **🎨 Modern UI**: Beautiful, responsive terrain fetching interface with progress tracking
- **📊 Two-Step Process**: Processing + Download with detailed progress indicators

## Architecture Overview

```
Frontend (Port 3001) → Backend API (Port 3000) → Google Earth Engine → Private R2 Storage → Backend File Server → Frontend
```

✅ **Private & Secure**: All file access goes through backend endpoints  
✅ **No Public URLs**: R2 storage is completely private  
✅ **Controlled Access**: Backend validates and serves all files  
✅ **Built-in Caching**: Both client and server-side caching  

## Backend Requirements

Make sure your NestJS backend is running at `http://localhost:3000` with these endpoints:

- `POST /terrain/fetch-and-cache` - Main pipeline (GEE → Private R2 → Backend URLs)
- `GET /terrain/files/:filename` - Private file server (downloads from R2, serves to frontend)
- `GET /terrain/test-r2` - Test R2 connection (for debugging)

## Installation

```bash
npm install
npm run dev
```

Your application will be available at:
- **Frontend**: http://localhost:3001
- **Backend**: http://localhost:3000

## Usage

### 1. Using the UI Interface

The application includes a private terrain panel where you can:
- **Backend Status**: Real-time connection indicator
- **Coordinate Input**: Enter geographic bounds (west, south, east, north)
- **Scale Selection**: Set resolution in meters (default: 30m)
- **Two-Step Progress**: Visual progress for "Processing" and "Downloading" phases
- **Results Display**: View heightmap details and download from private backend
- **Cache Management**: View cached regions and clear cache

### 2. Programmatic API Usage

```typescript
import { terrainService } from './src/services/terrainService';
import { TerrainRequest } from './src/types/terrain';

// Test backend connection
const isConnected = await terrainService.testConnection();

// Fetch terrain data (two-step process)
const request: TerrainRequest = {
  west: 32.0,
  south: 39.2,
  east: 32.4,
  north: 39.5,
  scale: 30
};

try {
  const heightmapData = await terrainService.fetchTerrain(request);
  console.log('Terrain data:', heightmapData);
  // heightmapData.downloadUrl contains the private backend URL
} catch (error) {
  console.error('Failed to fetch terrain:', error);
}
```

### 3. Integration with WebGPU Renderer

```typescript
import { TerrainController } from './src/control/terrainController';

const terrainController = new TerrainController('terrain-ui', {
  onHeightmapLoaded: (data) => {
    // Create terrain mesh for WebGPU rendering
    const vertices = generateTerrainVertices(data);
    const normals = generateTerrainNormals(data);
    const indices = generateTerrainIndices(data);
    
    // Add to your WebGPU scene
    createTerrainMesh(vertices, normals, indices);
  },
  onProgress: (progress) => {
    console.log(`${progress.step}: ${progress.message} (${progress.progress}%)`);
  }
});
```

## API Reference

### TerrainService

#### Methods

- `fetchTerrain(request: TerrainRequest): Promise<HeightmapData>`
- `getCachedHeightmap(request: TerrainRequest): HeightmapData | null`
- `clearCache(): void`
- `getCacheStats(): { count: number; keys: string[]; totalSize: number }`
- `testConnection(): Promise<boolean>`
- `getDownloadUrl(filename: string): string`
- `subscribe(listener: (state: TerrainServiceState) => void): () => void`
- `subscribeToProgress(listener: (progress: ProcessingProgress) => void): () => void`

### TerrainController

#### Constructor
```typescript
new TerrainController(containerId: string, callbacks?: {
  onHeightmapLoaded?: (data: HeightmapData) => void;
  onError?: (error: string) => void;
  onLoadingStateChange?: (isLoading: boolean) => void;
  onProgress?: (progress: ProcessingProgress) => void;
})
```

#### Methods
- `getCurrentHeightmapData(): HeightmapData | null`

### Data Types

#### TerrainRequest
```typescript
interface TerrainRequest {
  west: number;   // Western longitude boundary (-180 to 180)
  south: number;  // Southern latitude boundary (-90 to 90)
  east: number;   // Eastern longitude boundary (-180 to 180)
  north: number;  // Northern latitude boundary (-90 to 90)
  scale?: number; // Optional scale in meters (default: 30)
}
```

#### HeightmapData
```typescript
interface HeightmapData {
  width: number;           // Width in pixels
  height: number;          // Height in pixels
  heightData: Float32Array; // 16-bit height values
  region: TerrainRequest;  // Geographic bounds
  scale: number;           // Scale in meters
  filename: string;        // TIFF filename
  downloadUrl: string;     // Private backend download URL
  etag: string;           // R2 file etag for caching
}
```

#### PrivateTerrainResponse
```typescript
interface PrivateTerrainResponse {
  geeResult: { success: boolean; filename: string; region: object; scale: number };
  r2Result: { objectKey: string; uri: string; etag: string; versionId: string };
  cacheInfo: {
    filename: string;
    backendUrl: string;      // "/terrain/files/filename.tif" (relative)
    downloadUrl: string;     // "http://localhost:3000/terrain/files/filename.tif" (full)
    region: object;
    scale: number;
  };
}
```

## Two-Step Process

### Step 1: Processing (0-50%)
- Request sent to backend
- Google Earth Engine processing
- Upload to private R2 storage
- Backend URL generation

### Step 2: Downloading (50-100%)
- Download TIFF from private backend endpoint
- TIFF file parsing with geotiff library
- Height data extraction to Float32Array
- Cache storage

## Security Features

- **🔐 No Public R2 Access**: All files served through backend authentication
- **🛡️ Private File Serving**: Backend validates and controls all file access
- **🔒 Authentication Ready**: Easy to add auth middleware to file endpoints
- **📊 Access Logging**: All file access logged on backend
- **⚡ Rate Limiting Ready**: Backend can implement request limits

## Error Handling

The service includes comprehensive error handling for:
- **Network Issues**: Connection failures, timeouts
- **Invalid Coordinates**: Bounds validation (west < east, south < north)
- **Backend API Errors**: GEE processing failures, R2 upload issues
- **File Access Errors**: Download failures, TIFF processing errors
- **Validation Errors**: Coordinate range validation (-180/180, -90/90)

## Caching Strategy

- **Client-side Caching**: Avoids duplicate requests for same coordinates
- **Cache Keys**: Generated from coordinates and scale parameters
- **Memory Efficient**: Uses Map for O(1) lookups with size tracking
- **Cache Management**: Clear cache functionality with statistics

## Performance Considerations

- **Two-Step Progress**: Detailed UX feedback during 5-8 second processing time
- **Lazy Loading**: TIFF files (~1.6MB) downloaded only when needed
- **Timeout Handling**: 45s for processing, 30s for downloads
- **Memory Management**: Efficient Float32Array usage for height data
- **Connection Testing**: Backend health checks before operations

## Development

### Project Structure
```
src/
├── types/terrain.ts           # TypeScript interfaces (updated for private backend)
├── services/terrainService.ts # Two-step terrain service
├── control/terrainController.ts # UI controller with progress tracking
├── example/terrainExample.ts  # Integration examples with mesh generation
└── style.css                 # Enhanced UI styles
```

### Building
```bash
npm run build
```

### Type Checking
```bash
npx tsc --noEmit
```

## Private Backend Integration

Expected backend response format:
```typescript
{
  "geeResult": {
    "success": true,
    "filename": "heightmap_32.0_39.2_32.4_39.5_30_20250731_045722.tif",
    "region": {"west": 32, "south": 39.2, "east": 32.4, "north": 39.5},
    "scale": 30
  },
  "r2Result": {
    "objectKey": "heightmaps/heightmap_32.0_39.2_32.4_39.5_30_20250731_045722.tif",
    "etag": "\"38ca06fe450fa0359a890dbfbf6159d3\""
  },
  "cacheInfo": {
    "filename": "heightmap_32.0_39.2_32.4_39.5_30_20250731_045722.tif",
    "backendUrl": "/terrain/files/heightmap_32.0_39.2_32.4_39.5_30_20250731_045722.tif",
    "downloadUrl": "http://localhost:3000/terrain/files/heightmap_32.0_39.2_32.4_39.5_30_20250731_045722.tif",
    "region": {"west": 32, "south": 39.2, "east": 32.4, "north": 39.5},
    "scale": 30
  }
}
```

## Browser Support

- Chrome 113+ (WebGPU support required)
- Edge 113+
- Firefox 121+ (with WebGPU enabled)
- Safari 18+ (WebGPU preview)

## License

MIT License 