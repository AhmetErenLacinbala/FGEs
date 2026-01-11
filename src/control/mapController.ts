/**
 * MapController - Handles Google Maps integration for coordinate selection
 * Uses AdvancedMarkerElement (new API, replaces deprecated Marker)
 */

import App from './app.new';
import { solarTerrainService } from '../services/solarTerrainService';
import { MeshFactory, MaterialFactory, RenderableObject, Transform, RenderType } from '../core';
import { vec3 } from 'gl-matrix';

declare global {
    interface Window {
        google: typeof google;
    }
}

export interface MapControllerOptions {
    defaultLat?: number;
    defaultLng?: number;
    defaultZoom?: number;
    mapId?: string;
    apiKey?: string;
}

export default class MapController {
    private app: App;
    private map: google.maps.Map | null = null;
    private marker: google.maps.marker.AdvancedMarkerElement | null = null;

    private inputLat: HTMLInputElement;
    private inputLng: HTMLInputElement;
    private inputScale: HTMLInputElement;
    private scaleValue: HTMLElement;
    private btnGenerate: HTMLButtonElement;
    private statusMessage: HTMLElement;
    private objectCount: HTMLElement;
    private searchInput: HTMLInputElement;
    private searchResults: HTMLElement;
    private useSatelliteCheckbox: HTMLInputElement;
    private satelliteOpacitySlider: HTMLInputElement;
    private satelliteOpacityValue: HTMLElement;

    // Current state
    private currentLat: number;
    private currentLng: number;
    private currentScale: number = 30;
    private isGenerating: boolean = false;
    private mapId: string;

    // API Key (from environment variable)
    private readonly apiKey: string;
    private searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(app: App, options: MapControllerOptions = {}) {
        this.app = app;
        this.currentLat = options.defaultLat ?? 39.925;
        this.currentLng = options.defaultLng ?? 32.837;
        this.mapId = options.mapId ?? 'DEMO_MAP_ID';
        this.apiKey = options.apiKey ?? '';

        this.inputLat = document.getElementById('input-lat') as HTMLInputElement;
        this.inputLng = document.getElementById('input-lng') as HTMLInputElement;
        this.inputScale = document.getElementById('input-scale') as HTMLInputElement;
        this.scaleValue = document.getElementById('scale-value') as HTMLElement;
        this.btnGenerate = document.getElementById('btn-generate') as HTMLButtonElement;
        this.statusMessage = document.getElementById('status-message') as HTMLElement;
        this.objectCount = document.getElementById('object-count') as HTMLElement;
        this.searchInput = document.getElementById('place-search') as HTMLInputElement;
        this.searchResults = document.getElementById('search-results') as HTMLElement;
        this.useSatelliteCheckbox = document.getElementById('use-satellite') as HTMLInputElement;
        this.satelliteOpacitySlider = document.getElementById('satellite-opacity') as HTMLInputElement;
        this.satelliteOpacityValue = document.getElementById('satellite-opacity-value') as HTMLElement;

        this.setupEventListeners();
        this.setupPlacesSearch();
        this.setupSatelliteToggle();
        this.initGoogleMaps(options.defaultZoom ?? 10);
    }

    private setupEventListeners(): void {
        // Coordinate inputs
        this.inputLat.addEventListener('change', () => {
            this.currentLat = parseFloat(this.inputLat.value);
            this.updateMarker();
        });

        this.inputLng.addEventListener('change', () => {
            this.currentLng = parseFloat(this.inputLng.value);
            this.updateMarker();
        });

        // Scale slider
        this.inputScale.addEventListener('input', () => {
            this.currentScale = parseInt(this.inputScale.value);
            this.scaleValue.textContent = this.currentScale.toString();
        });

        // Generate button
        this.btnGenerate.addEventListener('click', () => {
            this.generateTerrain();
        });

        // Quick location buttons
        document.querySelectorAll('.quick-loc-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = e.target as HTMLElement;
                const lat = parseFloat(target.dataset.lat || '0');
                const lng = parseFloat(target.dataset.lng || '0');
                this.setLocation(lat, lng);
            });
        });

        // Update object count periodically
        setInterval(() => {
            this.objectCount.textContent = this.app.scene.count.toString();
        }, 500);
    }

    private initGoogleMaps(zoom: number): void {
        // Wait for Google Maps to load
        if (window.google && window.google.maps) {
            this.createMap(zoom);
        } else {
            window.addEventListener('google-maps-ready', () => {
                this.createMap(zoom);
            });
        }
    }

    private async createMap(zoom: number): Promise<void> {
        const mapElement = document.getElementById('google-map');
        if (!mapElement) return;

        // Create map with mapId (required for AdvancedMarkerElement)
        this.map = new google.maps.Map(mapElement, {
            center: { lat: this.currentLat, lng: this.currentLng },
            zoom: zoom,
            mapId: this.mapId,
            mapTypeId: 'terrain',
            disableDefaultUI: true,
            zoomControl: true
        });

        // Create custom marker content element
        const markerContent = document.createElement('div');
        markerContent.innerHTML = `
            <div style = "
            width: 24px;
            height: 24px;
            background: #4ecdc4;
            border: 3px solid #fff;
            border - radius: 50 %;
            box - shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
            cursor: grab;
            border-radius: 100%;
            "></div>
        `;

        // Create AdvancedMarkerElement (new API)
        const { AdvancedMarkerElement } = await google.maps.importLibrary("marker") as google.maps.MarkerLibrary;

        this.marker = new AdvancedMarkerElement({
            position: { lat: this.currentLat, lng: this.currentLng },
            map: this.map,
            gmpDraggable: true,
            content: markerContent,
            title: 'Selected Location'
        });

        // Map click to place marker
        this.map.addListener('click', (e: google.maps.MapMouseEvent) => {
            if (e.latLng) {
                this.setLocation(e.latLng.lat(), e.latLng.lng());
            }
        });

        // Marker drag end event (new event name for AdvancedMarkerElement)
        this.marker.addListener('gmp-dragend', () => {
            const pos = this.marker?.position;
            if (pos && typeof pos === 'object' && 'lat' in pos) {
                this.currentLat = pos.lat as number;
                this.currentLng = pos.lng as number;
                this.updateInputs();
            }
        });

        console.log('🗺️ Google Maps initialized with AdvancedMarkerElement');
    }

    /**
     * Setup Places API (New) search
     */
    private setupPlacesSearch(): void {
        if (!this.searchInput || !this.searchResults) return;

        // Handle input with debounce
        this.searchInput.addEventListener('input', () => {
            const query = this.searchInput.value.trim();

            if (this.searchDebounceTimer) {
                clearTimeout(this.searchDebounceTimer);
            }

            if (query.length < 2) {
                this.hideSearchResults();
                return;
            }

            this.searchDebounceTimer = setTimeout(() => {
                this.searchPlaces(query);
            }, 300);
        });

        // Hide results when clicking outside
        document.addEventListener('click', (e) => {
            if (!this.searchInput.contains(e.target as Node) &&
                !this.searchResults.contains(e.target as Node)) {
                this.hideSearchResults();
            }
        });

        // Handle keyboard navigation
        this.searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.hideSearchResults();
            }
        });

        console.log('🔍 Places API (New) search initialized');
    }

    /**
     * Search places using Places API (New)
     */
    private async searchPlaces(query: string): Promise<void> {
        this.searchResults.innerHTML = '<div class="search-loading">Searching...</div>';
        this.searchResults.classList.add('visible');

        try {
            const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Goog-Api-Key': this.apiKey,
                    'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location'
                },
                body: JSON.stringify({
                    textQuery: query,
                    maxResultCount: 5
                })
            });

            if (!response.ok) {
                throw new Error(`Places API error: ${response.status} `);
            }

            const data = await response.json();
            this.displaySearchResults(data.places || []);

        } catch (error) {
            console.error('Places search error:', error);
            this.searchResults.innerHTML = '<div class="search-loading">Search failed</div>';
        }
    }

    /**
     * Display search results
     */
    private displaySearchResults(places: any[]): void {
        if (places.length === 0) {
            this.searchResults.innerHTML = '<div class="search-loading">No results found</div>';
            return;
        }

        this.searchResults.innerHTML = places.map(place => `
            <div class="search-result-item" data-lat="${place.location?.latitude}" data-lng="${place.location?.longitude}">
                <div class="name">${place.displayName?.text || 'Unknown'}</div>
                <div class="address">${place.formattedAddress || ''}</div>
            </div>
        `).join('');

        // Add click handlers to results
        this.searchResults.querySelectorAll('.search-result-item').forEach(item => {
            item.addEventListener('click', () => {
                const lat = parseFloat((item as HTMLElement).dataset.lat || '0');
                const lng = parseFloat((item as HTMLElement).dataset.lng || '0');
                const name = item.querySelector('.name')?.textContent || '';

                this.setLocation(lat, lng);
                this.searchInput.value = name;
                this.hideSearchResults();

                if (this.map) {
                    this.map.setZoom(12);
                }

                console.log(`📍 Selected: ${name} `);
            });
        });
    }

    /**
     * Hide search results dropdown
     */
    private hideSearchResults(): void {
        this.searchResults.classList.remove('visible');
    }

    private setLocation(lat: number, lng: number): void {
        this.currentLat = lat;
        this.currentLng = lng;
        this.updateInputs();
        this.updateMarker();

        // Pan map to location
        if (this.map) {
            this.map.panTo({ lat, lng });
        }
    }

    private updateInputs(): void {
        this.inputLat.value = this.currentLat.toFixed(4);
        this.inputLng.value = this.currentLng.toFixed(4);
    }

    private updateMarker(): void {
        if (this.marker) {
            // AdvancedMarkerElement uses position property directly
            this.marker.position = { lat: this.currentLat, lng: this.currentLng };
        }
        if (this.map) {
            this.map.panTo({ lat: this.currentLat, lng: this.currentLng });
        }
    }

    private showStatus(message: string, type: 'loading' | 'success' | 'error'): void {
        this.statusMessage.textContent = message;
        this.statusMessage.className = `status visible ${type} `;
    }

    private hideStatus(): void {
        this.statusMessage.className = 'status';
    }

    async generateTerrain(): Promise<void> {
        if (this.isGenerating) return;

        this.isGenerating = true;
        this.btnGenerate.disabled = true;
        this.showStatus(' Fetching terrain data...', 'loading');

        try {
            console.log(`🏔️ Generating terrain at ${this.currentLat}, ${this.currentLng} (scale: ${this.currentScale}m)`);

            // Fetch terrain data from backend
            const tileData = await solarTerrainService.generateCompleteTile({
                centerLat: this.currentLat,
                centerLng: this.currentLng,
                scale: this.currentScale
            });

            this.showStatus(' Building 3D mesh...', 'loading');

            // Create terrain mesh
            const device = this.app.renderer.getDevice();
            const terrainLayout = this.app.renderer.getTerrainMaterialGroupLayout();
            const blendBuffer = this.app.renderer.getBlendSettingsBuffer();

            const terrainMesh = MeshFactory.fromHeightmap(
                device,
                tileData.heightmap.elevationData,
                tileData.heightmap.width,
                tileData.heightmap.height,
                {
                    targetSize: 20,    // XZ fits in -10 to +10 box
                    heightScale: 0.003 // Real height values (meters → world units)
                }
            );

            // Always fetch satellite imagery (for V key toggle to work)
            this.showStatus(' Fetching satellite imagery...', 'loading');
            const zoom = this.calculateSatelliteZoom(this.currentScale);

            const satelliteImage = await MaterialFactory.fetchSatelliteImage(
                this.currentLat,
                this.currentLng,
                this.apiKey,
                { zoom, size: 640, scale: 2 }
            );

            // Set initial opacity based on checkbox and slider state
            const useSatellite = this.useSatelliteCheckbox?.checked ?? false;
            const sliderOpacity = parseInt(this.satelliteOpacitySlider?.value ?? '20') / 100;
            this.app.renderer.updateBlendSettings(useSatellite ? sliderOpacity : 0);

            // Create dual-texture terrain material
            const terrainMaterial = MaterialFactory.createTerrainMaterial(
                device,
                {
                    data: tileData.solarData.ghiData,
                    width: tileData.solarData.width,
                    height: tileData.solarData.height,
                    minGHI: tileData.solarData.minGHI,
                    maxGHI: tileData.solarData.maxGHI
                },
                { data: satelliteImage },
                terrainLayout,
                blendBuffer,
                this.app.renderer.getSelectionQuadBuffer()
            );

            // Create terrain object
            for (const object of this.app.scene.getAll()) {
                this.app.scene.removeById(object.id)
            }

            const terrain = new RenderableObject({
                mesh: terrainMesh,
                material: terrainMaterial.bindGroup,
                renderType: RenderType.Terrain,
                transform: new Transform(
                    vec3.fromValues(0, 0, -5),
                    vec3.fromValues(0, 0, 0),
                    vec3.fromValues(1, 1, 1)
                )
            });


            this.app.scene.add(terrain);

            this.app.setTerrainComputeInfo(
                terrainMesh.vertexBuffer,
                terrainMesh.vertexCount
            );
            this.app.setTerrainMetadata(tileData.bounds, 20);
            this.app.setGHIData(
                tileData.solarData.ghiData,
                tileData.solarData.width,
                tileData.solarData.height,
                tileData.solarData.minGHI,
                tileData.solarData.maxGHI
            );

            this.showStatus(`✅ Terrain loaded!(${tileData.heightmap.width}x${tileData.heightmap.height})`, 'success');
            console.log('✅ Terrain added to scene');

            // Hide status after 3 seconds
            setTimeout(() => this.hideStatus(), 3000);

        } catch (error) {
            console.error('❌ Failed to generate terrain:', error);
            this.showStatus(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'} `, 'error');
        } finally {
            this.isGenerating = false;
            this.btnGenerate.disabled = false;
        }
    }

    /**
     * Setup satellite toggle (V key + checkbox + slider)
     */
    private setupSatelliteToggle(): void {
        // Get current slider value as opacity (0-1)
        const getSliderOpacity = () => {
            return parseInt(this.satelliteOpacitySlider?.value ?? '20') / 100;
        };

        // Update slider display
        const updateSliderDisplay = (value: number) => {
            if (this.satelliteOpacityValue) {
                this.satelliteOpacityValue.textContent = `${Math.round(value * 100)}%`;
            }
        };

        // Checkbox change handler - toggle satellite on/off using slider value
        if (this.useSatelliteCheckbox) {
            this.useSatelliteCheckbox.addEventListener('change', () => {
                const opacity = this.useSatelliteCheckbox.checked ? getSliderOpacity() : 0;
                this.app.renderer.updateBlendSettings(opacity);
            });
        }

        // Slider change handler - update opacity in real-time
        if (this.satelliteOpacitySlider) {
            this.satelliteOpacitySlider.addEventListener('input', () => {
                const opacity = getSliderOpacity();
                updateSliderDisplay(opacity);

                // Only apply if checkbox is checked
                if (this.useSatelliteCheckbox?.checked) {
                    this.app.renderer.updateBlendSettings(opacity);
                }
            });
        }

        // V key handler
        document.addEventListener('keydown', (e) => {
            if (e.code === 'KeyV' && !this.isInputFocused()) {
                // Toggle checkbox
                if (this.useSatelliteCheckbox) {
                    this.useSatelliteCheckbox.checked = !this.useSatelliteCheckbox.checked;
                    // Trigger change event
                    this.useSatelliteCheckbox.dispatchEvent(new Event('change'));
                } else {
                    // Fallback: directly toggle renderer
                    this.app.renderer.toggleSatellite();
                }
            }
        });
    }

    /**
     * Check if an input element is focused (to avoid triggering shortcuts while typing)
     */
    private isInputFocused(): boolean {
        const activeElement = document.activeElement;
        return activeElement instanceof HTMLInputElement ||
            activeElement instanceof HTMLTextAreaElement;
    }

    /**
     * Get current coordinates
     */
    getCoordinates(): { lat: number; lng: number; scale: number } {
        return {
            lat: this.currentLat,
            lng: this.currentLng,
            scale: this.currentScale
        };
    }

    /**
     * Calculate appropriate satellite zoom level based on tile scale
     * Scale is in meters, lower scale = higher zoom needed
     */
    private calculateSatelliteZoom(scale: number): number {
        // Approximate mapping from scale to zoom
        // scale 10m → zoom 19 (very detailed)
        // scale 30m → zoom 17 (default)
        // scale 100m → zoom 14 (wider area)

        if (scale <= 10) return 19;
        if (scale <= 20) return 18;
        if (scale <= 30) return 17;
        if (scale <= 50) return 16;
        if (scale <= 75) return 15;
        return 14;
    }
}

