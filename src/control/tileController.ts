import { terrainService, TerrainService } from '../services/terrainService';
import { TerrainTileRequest, TileHeightmapData, ProcessingProgress } from '../types/terrain';

export class TileController {
  private terrainService: TerrainService;
  private uiContainer: HTMLElement;
  private callbacks: {
    onTileLoaded?: (data: TileHeightmapData) => void;
    onError?: (error: string) => void;
    onLoadingStateChange?: (isLoading: boolean) => void;
    onProgress?: (progress: ProcessingProgress) => void;
  };

  constructor(containerId: string, callbacks: {
    onTileLoaded?: (data: TileHeightmapData) => void;
    onError?: (error: string) => void;
    onLoadingStateChange?: (isLoading: boolean) => void;
    onProgress?: (progress: ProcessingProgress) => void;
  } = {}) {
    this.terrainService = terrainService;
    this.callbacks = callbacks;

    const container = document.getElementById(containerId);
    if (!container) {
      throw new Error(`Container with id '${containerId}' not found`);
    }
    this.uiContainer = container;

    this.init();
  }

  private init(): void {
    this.createUI();
    this.setupEventListeners();

    // Subscribe to tile service state changes
    this.terrainService.subscribeTile((state) => {
      this.updateUI(state);

      // Call callbacks
      if (this.callbacks.onLoadingStateChange) {
        this.callbacks.onLoadingStateChange(state.isLoading);
      }

      if (state.error && this.callbacks.onError) {
        this.callbacks.onError(state.error);
      }
    });

    // Subscribe to progress updates
    this.terrainService.subscribeToProgress((progress) => {
      this.updateProgressUI(progress);

      if (this.callbacks.onProgress) {
        this.callbacks.onProgress(progress);
      }
    });
  }

  private createUI(): void {
    this.uiContainer.innerHTML = `
      <div class="tile-panel">
        <h3>🎯 Terrain Tile Generator</h3>
        
        <div class="backend-status" id="tile-backend-status">
          <span class="status-indicator" id="tile-status-indicator">⚪</span>
          <span id="tile-status-text">Ready for tile generation</span>
        </div>
        
        <div class="coordinates-input">
          <div class="coordinate-row">
            <label>
              Center Latitude: <input type="number" id="center-lat" step="0.001" value="40.0" placeholder="Center latitude">
            </label>
            <label>
              Center Longitude: <input type="number" id="center-lng" step="0.001" value="32.75" placeholder="Center longitude">
            </label>
          </div>
          <div class="coordinate-row">
            <label>
              Scale (m): <input type="number" id="tile-scale" step="1" value="30" placeholder="Scale in meters">
            </label>
          </div>
          <div class="coordinate-info">
            <small>📏 Tile size: 0.01° (~1.1km) | Generated bounds will be calculated automatically</small>
          </div>
        </div>

        <div class="actions">
          <button id="generate-tile" class="fetch-btn">Generate Tile</button>
          <button id="clear-tile-cache" class="clear-btn">Clear Tile Cache</button>
          <button id="test-tile-backend" class="test-btn">Test Backend</button>
        </div>

        <div class="status" id="tile-status">
          Ready to generate terrain tile from center coordinates
        </div>

        <div class="progress-container" id="tile-progress-container" style="display: none;">
          <div class="progress-steps">
            <div class="step" id="tile-step-processing">
              <div class="step-indicator">1</div>
              <div class="step-label">Processing</div>
            </div>
            <div class="step-arrow">→</div>
            <div class="step" id="tile-step-downloading">
              <div class="step-indicator">2</div>
              <div class="step-label">Downloading</div>
            </div>
          </div>
          
          <div class="progress-bar-container">
            <div class="progress-bar">
              <div class="progress-fill" id="tile-progress-fill"></div>
            </div>
            <div class="progress-text" id="tile-progress-text">Initializing...</div>
            <div class="progress-percentage" id="tile-progress-percentage">0%</div>
          </div>
        </div>

        <div class="results" id="tile-results" style="display: none;">
          <h4>🎯 Tile Results</h4>
          <div class="result-item">
            <strong>Filename:</strong> <span id="tile-result-filename">-</span>
          </div>
          <div class="result-item">
            <strong>Center:</strong> <span id="tile-result-center">-</span>
          </div>
          <div class="result-item">
            <strong>Calculated Bounds:</strong> <span id="tile-result-bounds">-</span>
          </div>
          <div class="result-item">
            <strong>Dimensions:</strong> <span id="tile-result-dimensions">-</span>
          </div>
          <div class="result-item">
            <strong>Height Range:</strong> <span id="tile-result-height-range">-</span>
          </div>
          <div class="result-item">
            <strong>Scale:</strong> <span id="tile-result-scale">-</span>
          </div>
          <div class="result-item">
            <strong>Tile Size:</strong> <span id="tile-result-tile-size">-</span>
          </div>
          <div class="result-item">
            <strong>File Size:</strong> <span id="tile-result-file-size">-</span>
          </div>
          <div class="result-item">
            <strong>Download:</strong> <a id="tile-result-url" href="#" target="_blank">Download TIF</a>
          </div>
        </div>

        <div class="cache-info" id="tile-cache-info">
          <h4>💾 Tile Cache Status</h4>
          <div class="cache-stats">
            <span id="tile-cache-count">0</span> tiles cached | 
            <span id="tile-cache-size">0 KB</span> total
          </div>
        </div>
      </div>
    `;
  }

  private setupEventListeners(): void {

    const generateBtn = document.getElementById('generate-tile') as HTMLButtonElement;
    generateBtn?.addEventListener('click', () => this.generateTile());


    const clearCacheBtn = document.getElementById('clear-tile-cache') as HTMLButtonElement;
    clearCacheBtn?.addEventListener('click', () => this.clearCache());


    const testBtn = document.getElementById('test-tile-backend') as HTMLButtonElement;
    testBtn?.addEventListener('click', () => this.testBackend());


    this.updateCacheInfo();
  }

  private async generateTile(): Promise<void> {
    try {
      const centerLatInput = document.getElementById('center-lat') as HTMLInputElement;
      const centerLngInput = document.getElementById('center-lng') as HTMLInputElement;
      const scaleInput = document.getElementById('tile-scale') as HTMLInputElement;

      const request: TerrainTileRequest = {
        centerLat: parseFloat(centerLatInput.value),
        centerLng: parseFloat(centerLngInput.value),
        scale: parseInt(scaleInput.value) || 30
      };

      console.log('🎯 Generating tile with request:', request);

      const data = await this.terrainService.generateTile(request);


      this.displayTileResults(data);


      this.updateCacheInfo();


      if (this.callbacks.onTileLoaded) {
        this.callbacks.onTileLoaded(data);
      }

    } catch (error) {
      console.error('❌ Error generating tile:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      const statusElement = document.getElementById('tile-status');
      if (statusElement) {
        statusElement.textContent = `❌ Error: ${errorMessage}`;
        statusElement.className = 'status error';
      }

      if (this.callbacks.onError) {
        this.callbacks.onError(errorMessage);
      }
    }
  }

  private displayTileResults(data: TileHeightmapData): void {

    let minHeight = data.heightData[0];
    let maxHeight = data.heightData[0];

    for (let i = 1; i < data.heightData.length; i++) {
      const value = data.heightData[i];
      if (value < minHeight) minHeight = value;
      if (value > maxHeight) maxHeight = value;
    }


    const elements = {
      filename: document.getElementById('tile-result-filename'),
      center: document.getElementById('tile-result-center'),
      bounds: document.getElementById('tile-result-bounds'),
      dimensions: document.getElementById('tile-result-dimensions'),
      heightRange: document.getElementById('tile-result-height-range'),
      scale: document.getElementById('tile-result-scale'),
      tileSize: document.getElementById('tile-result-tile-size'),
      fileSize: document.getElementById('tile-result-file-size'),
      url: document.getElementById('tile-result-url') as HTMLAnchorElement
    };

    if (elements.filename) elements.filename.textContent = data.filename;
    if (elements.center) elements.center.textContent = `${data.centerCoordinates.lat.toFixed(4)}, ${data.centerCoordinates.lng.toFixed(4)}`;
    if (elements.bounds) elements.bounds.textContent = `${data.region.west.toFixed(4)}, ${data.region.south.toFixed(4)} → ${data.region.east.toFixed(4)}, ${data.region.north.toFixed(4)}`;
    if (elements.dimensions) elements.dimensions.textContent = `${data.width}×${data.height}`;
    if (elements.heightRange) elements.heightRange.textContent = `${minHeight.toFixed(1)}m - ${maxHeight.toFixed(1)}m`;
    if (elements.scale) elements.scale.textContent = `${data.scale}m`;
    if (elements.tileSize) elements.tileSize.textContent = `${data.tileSize}° (~${(data.tileSize * 111).toFixed(1)}km)`;
    if (elements.fileSize) elements.fileSize.textContent = `${Math.round(data.heightData.byteLength / 1024)} KB`;

    if (elements.url) {
      elements.url.href = data.downloadUrl;
      elements.url.textContent = 'Download TIF';
    }


    const resultsElement = document.getElementById('tile-results');
    if (resultsElement) {
      resultsElement.style.display = 'block';
    }
  }

  private updateUI(state: any): void {
    const statusElement = document.getElementById('tile-status');
    const progressContainer = document.getElementById('tile-progress-container');
    const generateBtn = document.getElementById('generate-tile') as HTMLButtonElement;

    if (state.isLoading) {
      if (statusElement) {
        statusElement.textContent = 'Generating tile...';
        statusElement.className = 'status loading';
      }
      if (progressContainer) progressContainer.style.display = 'block';
      if (generateBtn) generateBtn.disabled = true;
    } else {
      if (statusElement) {
        statusElement.textContent = state.error || 'Ready to generate terrain tile';
        statusElement.className = state.error ? 'status error' : 'status';
      }
      if (progressContainer) progressContainer.style.display = 'none';
      if (generateBtn) generateBtn.disabled = false;
    }

    this.updateCacheInfo();
  }

  private updateProgressUI(progress: ProcessingProgress): void {
    const fillElement = document.getElementById('tile-progress-fill');
    const textElement = document.getElementById('tile-progress-text');
    const percentageElement = document.getElementById('tile-progress-percentage');
    const stepProcessing = document.getElementById('tile-step-processing');
    const stepDownloading = document.getElementById('tile-step-downloading');

    if (fillElement) {
      fillElement.style.width = `${progress.progress}%`;
    }

    if (textElement) {
      textElement.textContent = progress.message;
    }

    if (percentageElement) {
      percentageElement.textContent = `${progress.progress}%`;
    }


    if (stepProcessing && stepDownloading) {
      stepProcessing.className = progress.step === 'processing' ? 'step active' : 'step completed';
      stepDownloading.className = progress.step === 'downloading' ? 'step active' : 'step';
    }
  }

  private async clearCache(): Promise<void> {
    this.terrainService.clearTileCache();
    this.updateCacheInfo();

    const statusElement = document.getElementById('tile-status');
    if (statusElement) {
      statusElement.textContent = '🧹 Tile cache cleared';
    }
  }

  private async testBackend(): Promise<void> {
    const statusElement = document.getElementById('tile-status');
    const indicator = document.getElementById('tile-status-indicator');
    const statusText = document.getElementById('tile-status-text');

    if (statusElement) statusElement.textContent = '🔌 Testing backend connection...';

    try {
      const isConnected = await this.terrainService.testConnection();

      if (indicator) indicator.textContent = isConnected ? '🟢' : '🔴';
      if (statusText) statusText.textContent = isConnected ? 'Backend connected' : 'Backend disconnected';
      if (statusElement) statusElement.textContent = isConnected ? '✅ Backend connection successful' : '❌ Backend connection failed';
    } catch (error) {
      if (indicator) indicator.textContent = '🔴';
      if (statusText) statusText.textContent = 'Backend error';
      if (statusElement) statusElement.textContent = '❌ Backend connection failed';
    }
  }

  private updateCacheInfo(): void {
    const stats = this.terrainService.getTileCacheStats();

    const countElement = document.getElementById('tile-cache-count');
    const sizeElement = document.getElementById('tile-cache-size');

    if (countElement) countElement.textContent = stats.count.toString();
    if (sizeElement) sizeElement.textContent = `${Math.round(stats.totalSize / 1024)} KB`;
  }

  /**
   * Public method to generate tile programmatically
   */
  async generateTileData(request: TerrainTileRequest): Promise<TileHeightmapData> {
    try {
      const data = await this.terrainService.generateTile(request);
      this.displayTileResults(data);
      this.updateCacheInfo();
      return data;
    } catch (error) {
      console.error('❌ Error generating tile programmatically:', error);
      throw error;
    }
  }

  /**
   * Get cached tile data
   */
  getTileFromCache(request: TerrainTileRequest): TileHeightmapData | null {
    return this.terrainService.getCachedTile(request);
  }
} 