/**
 * ParselController - Türk Ada Parsel Sistemi kontrolcüsü
 * Form yönetimi ve TKGM API entegrasyonu
 */

import tkgmService, { City, District, Neighborhood, ParcelResult, CITIES } from '../services/tkgmService';
import MapController from './mapController';

export interface ParcelCenter {
    lat: number;
    lng: number;
}

export class ParselController {
    // DOM Elements
    private citySelect: HTMLSelectElement;
    private districtSelect: HTMLSelectElement;
    private neighborhoodSelect: HTMLSelectElement;
    private blockInput: HTMLInputElement;
    private parcelInput: HTMLInputElement;
    private searchButton: HTMLButtonElement;
    private resultContainer: HTMLDivElement;
    private resultContent: HTMLDivElement;
    private statusElement: HTMLDivElement;
    private form: HTMLFormElement;

    // Tab Elements
    private tabButtons: NodeListOf<HTMLButtonElement>;
    private tabContents: NodeListOf<HTMLDivElement>;

    // State
    private selectedCity: City | null = null;
    private selectedDistrict: District | null = null;
    private selectedNeighborhood: Neighborhood | null = null;
    private districts: District[] = [];
    private neighborhoods: Neighborhood[] = [];

    // Last parcel result and center
    private lastParcelResult: ParcelResult | null = null;
    private lastParcelCenter: ParcelCenter | null = null;

    // Map controller reference (set externally)
    private mapController: MapController | null = null;

    constructor() {
        // Get DOM elements
        this.citySelect = document.getElementById('city-select') as HTMLSelectElement;
        this.districtSelect = document.getElementById('district-select') as HTMLSelectElement;
        this.neighborhoodSelect = document.getElementById('neighborhood-select') as HTMLSelectElement;
        this.blockInput = document.getElementById('block-input') as HTMLInputElement;
        this.parcelInput = document.getElementById('parcel-input') as HTMLInputElement;
        this.searchButton = document.getElementById('btn-parsel-search') as HTMLButtonElement;
        this.resultContainer = document.getElementById('parsel-result') as HTMLDivElement;
        this.resultContent = document.getElementById('parsel-result-content') as HTMLDivElement;
        this.statusElement = document.getElementById('parsel-status') as HTMLDivElement;
        this.form = document.getElementById('parsel-form') as HTMLFormElement;

        // Tab elements
        this.tabButtons = document.querySelectorAll('.tab-btn') as NodeListOf<HTMLButtonElement>;
        this.tabContents = document.querySelectorAll('.tab-content') as NodeListOf<HTMLDivElement>;

        this.init();
    }

    private init(): void {
        console.log('🏛️ ParselController: Initializing...');

        // Initialize tabs
        this.initTabs();

        // Populate cities
        this.populateCities();

        // Setup event listeners
        this.setupEventListeners();

        console.log('✅ ParselController: Initialized');
    }

    private initTabs(): void {
        this.tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const tabId = button.dataset.tab;
                if (!tabId) return;

                // Update button states
                this.tabButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');

                // Update content states
                this.tabContents.forEach(content => {
                    content.classList.remove('active');
                    if (content.id === tabId) {
                        content.classList.add('active');
                    }
                });

                console.log(`🗂️ Tab switched to: ${tabId}`);
            });
        });
    }

    private populateCities(): void {
        const cities = tkgmService.getCities();

        // Clear and add default option
        this.citySelect.innerHTML = '<option value="">İl Seçiniz</option>';

        // Add cities
        cities.forEach(city => {
            const option = document.createElement('option');
            option.value = city.id.toString();
            option.textContent = city.name;
            this.citySelect.appendChild(option);
        });

        console.log(`🏙️ Populated ${cities.length} cities`);
    }

    private setupEventListeners(): void {
        // City change
        this.citySelect.addEventListener('change', async (e) => {
            const target = e.target as HTMLSelectElement;
            const cityId = parseInt(target.value);

            if (!cityId) {
                this.resetDistricts();
                this.resetNeighborhoods();
                return;
            }

            this.selectedCity = CITIES.find(c => c.id === cityId) || null;
            await this.loadDistricts(cityId);
        });

        // District change
        this.districtSelect.addEventListener('change', async (e) => {
            const target = e.target as HTMLSelectElement;
            const districtId = parseInt(target.value);

            if (!districtId) {
                this.resetNeighborhoods();
                return;
            }

            this.selectedDistrict = this.districts.find(d => d.id === districtId) || null;
            await this.loadNeighborhoods(districtId);
        });

        // Neighborhood change
        this.neighborhoodSelect.addEventListener('change', (e) => {
            const target = e.target as HTMLSelectElement;
            const neighborhoodId = parseInt(target.value);

            if (neighborhoodId) {
                this.selectedNeighborhood = this.neighborhoods.find(n => n.id === neighborhoodId) || null;
                this.updateSearchButton();
            } else {
                this.selectedNeighborhood = null;
                this.updateSearchButton();
            }
        });

        // Parcel input change
        this.parcelInput.addEventListener('input', () => {
            this.updateSearchButton();
        });

        // Form submit
        this.form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.searchParcel();
        });
    }

    private async loadDistricts(cityId: number): Promise<void> {
        this.showStatus('İlçeler yükleniyor...', 'loading');
        this.resetDistricts();
        this.resetNeighborhoods();

        try {
            this.districts = await tkgmService.getDistricts(cityId);

            this.districtSelect.innerHTML = '<option value="">İlçe Seçiniz</option>';
            this.districts.forEach(district => {
                const option = document.createElement('option');
                option.value = district.id.toString();
                option.textContent = district.name;
                this.districtSelect.appendChild(option);
            });

            this.districtSelect.disabled = false;
            this.hideStatus();

            console.log(`🏘️ Loaded ${this.districts.length} districts for city ${cityId}`);
        } catch (error) {
            this.showStatus('İlçeler yüklenirken hata oluştu', 'error');
            console.error('Failed to load districts:', error);
        }
    }

    private async loadNeighborhoods(districtId: number): Promise<void> {
        this.showStatus('Mahalleler yükleniyor...', 'loading');
        this.resetNeighborhoods();

        try {
            this.neighborhoods = await tkgmService.getNeighborhoods(districtId);

            this.neighborhoodSelect.innerHTML = '<option value="">Mahalle Seçiniz</option>';
            this.neighborhoods.forEach(neighborhood => {
                const option = document.createElement('option');
                option.value = neighborhood.id.toString();
                option.textContent = neighborhood.name;
                this.neighborhoodSelect.appendChild(option);
            });

            this.neighborhoodSelect.disabled = false;
            this.hideStatus();

            console.log(`🏠 Loaded ${this.neighborhoods.length} neighborhoods for district ${districtId}`);
        } catch (error) {
            this.showStatus('Mahalleler yüklenirken hata oluştu', 'error');
            console.error('Failed to load neighborhoods:', error);
        }
    }

    private async searchParcel(): Promise<void> {
        if (!this.selectedNeighborhood) {
            this.showStatus('Lütfen mahalle seçiniz', 'error');
            return;
        }

        const parcelNo = this.parcelInput.value.trim();
        if (!parcelNo) {
            this.showStatus('Lütfen parsel numarası giriniz', 'error');
            return;
        }

        const blockNo = this.blockInput.value.trim() || '0';

        this.showStatus('Parsel sorgulanıyor...', 'loading');
        this.searchButton.disabled = true;

        try {
            const result = await tkgmService.getParcel(
                this.selectedNeighborhood.id,
                blockNo,
                parcelNo
            );

            if (result) {
                // Store result
                this.lastParcelResult = result;

                // Calculate and store center
                this.lastParcelCenter = this.calculatePolygonCenter(result.geometry.coordinates);

                // Display result with map button
                this.displayResult(result);
                this.hideStatus();

                // Console.log the full result as requested
                console.log('📍 PARSEL SORGU SONUCU:', result);
                console.log('📍 Koordinatlar:', result.geometry.coordinates);
                console.log('📍 Merkez:', this.lastParcelCenter);
                console.log('📍 Özellikler:', result.properties);
            } else {
                this.showStatus('Parsel bulunamadı', 'error');
                this.hideResult();
            }
        } catch (error) {
            this.showStatus('Parsel sorgulanırken hata oluştu', 'error');
            console.error('Failed to search parcel:', error);
            this.hideResult();
        } finally {
            this.updateSearchButton();
        }
    }

    private displayResult(result: ParcelResult): void {
        const props = result.properties;
        const center = this.lastParcelCenter;

        const html = `
            <div class="result-row">
                <span class="result-label">İl / İlçe</span>
                <span class="result-value">${props.ilAd} / ${props.ilceAd}</span>
            </div>
            <div class="result-row">
                <span class="result-label">Mahalle</span>
                <span class="result-value">${props.mahalleAd}</span>
            </div>
            <div class="result-row">
                <span class="result-label">Ada / Parsel</span>
                <span class="result-value">${props.adaNo || '-'} / ${props.parselNo}</span>
            </div>
            <div class="result-row">
                <span class="result-label">Mevkii</span>
                <span class="result-value">${props.mevkii || '-'}</span>
            </div>
            <div class="result-row">
                <span class="result-label">Alan</span>
                <span class="result-value">${props.alan}</span>
            </div>
            <div class="result-row">
                <span class="result-label">Nitelik</span>
                <span class="result-value">${props.nitelik}</span>
            </div>
            <div class="result-row">
                <span class="result-label">Pafta</span>
                <span class="result-value">${props.pafta || '-'}</span>
            </div>
            <div class="result-row">
                <span class="result-label">Durum</span>
                <span class="result-value">${props.zeminKmdurum}</span>
            </div>
            ${center ? `
            <div class="result-row" style="border-top: 1px solid #2a2a3a; padding-top: 10px; margin-top: 6px;">
                <span class="result-label">Merkez Koordinat</span>
                <span class="result-value" style="font-size: 0.75rem;">${center.lat.toFixed(6)}, ${center.lng.toFixed(6)}</span>
            </div>
            <button type="button" id="btn-show-on-map" class="btn btn-primary" style="margin-top: 12px; background: linear-gradient(135deg, #ffd93d, #ff9500);">
                🗺️ Haritada Göster
            </button>
            ` : ''}
        `;

        this.resultContent.innerHTML = html;
        this.resultContainer.classList.add('visible');
        this.resultContainer.classList.remove('error');

        // Add click handler for "Haritada Göster" button
        const showOnMapBtn = document.getElementById('btn-show-on-map');
        if (showOnMapBtn) {
            showOnMapBtn.addEventListener('click', () => {
                this.showParcelOnMap();
            });
        }
    }

    private hideResult(): void {
        this.resultContainer.classList.remove('visible');
    }

    private resetDistricts(): void {
        this.districtSelect.innerHTML = '<option value="">Önce il seçiniz</option>';
        this.districtSelect.disabled = true;
        this.districts = [];
        this.selectedDistrict = null;
    }

    private resetNeighborhoods(): void {
        this.neighborhoodSelect.innerHTML = '<option value="">Önce ilçe seçiniz</option>';
        this.neighborhoodSelect.disabled = true;
        this.neighborhoods = [];
        this.selectedNeighborhood = null;
        this.updateSearchButton();
    }

    private updateSearchButton(): void {
        const hasNeighborhood = this.selectedNeighborhood !== null;
        const hasParcel = this.parcelInput.value.trim().length > 0;
        this.searchButton.disabled = !(hasNeighborhood && hasParcel);
    }

    private showStatus(message: string, type: 'loading' | 'success' | 'error'): void {
        this.statusElement.textContent = message;
        this.statusElement.className = `status visible ${type}`;
    }

    private hideStatus(): void {
        this.statusElement.classList.remove('visible');
    }

    /**
     * Set the map controller reference for terrain generation
     */
    setMapController(mapController: MapController): void {
        this.mapController = mapController;
        console.log('🗺️ ParselController: MapController connected');
    }

    /**
     * Calculate the centroid (center point) of a polygon
     * GeoJSON coordinates are in [longitude, latitude] format
     */
    private calculatePolygonCenter(coordinates: number[][][]): ParcelCenter {
        // Get the outer ring of the polygon (first array)
        const ring = coordinates[0];

        let sumLng = 0;
        let sumLat = 0;
        let count = 0;

        // Sum all coordinates (excluding the last point if it's the same as first - closed polygon)
        for (let i = 0; i < ring.length; i++) {
            const [lng, lat] = ring[i];
            sumLng += lng;
            sumLat += lat;
            count++;
        }

        // Calculate average
        const center: ParcelCenter = {
            lng: sumLng / count,
            lat: sumLat / count
        };

        console.log(`📍 Parsel merkezi hesaplandı: ${center.lat.toFixed(6)}, ${center.lng.toFixed(6)} (${count} nokta)`);

        return center;
    }

    /**
     * Get the last parcel center coordinates
     */
    getLastParcelCenter(): ParcelCenter | null {
        return this.lastParcelCenter;
    }

    /**
     * Get the last parcel result
     */
    getLastParcelResult(): ParcelResult | null {
        return this.lastParcelResult;
    }

    /**
     * Navigate to parcel location on map and generate terrain
     */
    async showParcelOnMap(): Promise<void> {
        if (!this.lastParcelCenter) {
            this.showStatus('Önce parsel sorgulayın', 'error');
            return;
        }

        if (!this.mapController) {
            console.error('MapController not connected');
            this.showStatus('Harita bağlantısı yok', 'error');
            return;
        }

        const { lat, lng } = this.lastParcelCenter;

        console.log(`🗺️ Parsele gidiliyor: ${lat.toFixed(6)}, ${lng.toFixed(6)}`);

        // Switch to map tab
        const mapTabBtn = document.querySelector('[data-tab="map-tab"]') as HTMLButtonElement;
        if (mapTabBtn) {
            mapTabBtn.click();
        }

        // Set location on map controller (zoom 18 for parcel-level detail)
        this.mapController.setLocationPublic(lat, lng, 18);

        // Auto-generate terrain
        this.showStatus('Harita oluşturuluyor...', 'loading');

        // Small delay to let map update, then generate terrain
        setTimeout(async () => {
            try {
                await this.mapController!.generateTerrain();
                this.hideStatus();
            } catch (error) {
                console.error('Terrain generation failed:', error);
                this.showStatus('Terrain oluşturulamadı', 'error');
            }
        }, 500);
    }
}

export default ParselController;
