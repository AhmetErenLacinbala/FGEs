import './style.css'
import App from './control/app.new';
import MapController from './control/mapController';

const canvas: HTMLCanvasElement | null = document.getElementById('gfx-main') as HTMLCanvasElement;

(async () => {
    const app = new App(canvas);
    await app.init();
    app.run();

    // Initialize map controller for Google Maps integration
    const mapController = new MapController(app, {
        defaultLat: 39.925,
        defaultLng: 32.837,
        defaultZoom: 10
    });

    console.log('🎯 Application initialized with Google Maps integration');
    console.log(`📦 Scene contains ${app.scene.count} objects`);
    console.log('🗺️ Click the map to select a location, then click "Generate Terrain"');

    // Expose to console for debugging
    (window as any).app = app;
    (window as any).mapController = mapController;
})();
