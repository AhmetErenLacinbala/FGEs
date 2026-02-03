import './style.css'
import App from './control/app.new';
import MapController from './control/mapController';
import ParselController from './control/parselController';

// Get API key from environment variable
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

if (!GOOGLE_MAPS_API_KEY) {
    console.error('❌ Missing VITE_GOOGLE_MAPS_API_KEY in .env file');
}

/**
 * Dynamically load Google Maps API script
 */
function loadGoogleMapsAPI(apiKey: string): Promise<void> {
    return new Promise((resolve, reject) => {
        // Check if already loaded
        if (window.google?.maps) {
            resolve();
            return;
        }

        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&callback=initMap&v=weekly&libraries=marker`;
        script.async = true;
        script.defer = true;
        script.onerror = () => reject(new Error('Failed to load Google Maps API'));

        // initMap is defined in index.html and dispatches 'google-maps-ready'
        document.head.appendChild(script);

        // Wait for the custom event
        window.addEventListener('google-maps-ready', () => resolve(), { once: true });
    });
}

const canvas: HTMLCanvasElement | null = document.getElementById('gfx-main') as HTMLCanvasElement;

(async () => {
    // Load Google Maps API first
    if (GOOGLE_MAPS_API_KEY) {
        try {
            await loadGoogleMapsAPI(GOOGLE_MAPS_API_KEY);
            console.log('✅ Google Maps API loaded');
        } catch (error) {
            console.error('❌ Failed to load Google Maps API:', error);
        }
    }

    const app = new App(canvas);
    await app.init();
    app.run();

    // Initialize map controller for Google Maps integration
    const mapController = new MapController(app, {
        defaultLat: 39.925,
        defaultLng: 32.837,
        defaultZoom: 10,
        apiKey: GOOGLE_MAPS_API_KEY // Pass API key
    });

    // Initialize parsel controller for TKGM parcel queries
    const parselController = new ParselController();
    
    // Connect parsel controller with map controller for terrain generation
    parselController.setMapController(mapController);

    console.log('🎯 Application initialized with Google Maps integration');
    console.log(`📦 Scene contains ${app.scene.count} objects`);
    console.log('🗺️ Click the map to select a location, then click "Generate Terrain"');
    console.log('🏛️ Parsel Sorgu tab is available for Turkish land registry queries');

    // Expose to console for debugging
    (window as any).app = app;
    (window as any).mapController = mapController;
    (window as any).parselController = parselController;
})();
