import './style.css'
import App from './control/app';
import { initializeTileIntegration } from './example/terrainExample';

const canvas: HTMLCanvasElement | null = document.getElementById('gfx-main') as HTMLCanvasElement;

(async () => {
    // Initialize the existing WebGPU app
    const app = new App(canvas);
    await app.init();
    app.run();

    // Initialize the tile generation system
    const tileExample = initializeTileIntegration();

    console.log('🎯 Application initialized with tile generation system');
    console.log('📋 Available tile generation methods:');
    console.log('  🎯 Tile Generation:');
    console.log('    - UI: Use the tile panel to generate terrain tiles');
    console.log('    - API: Call tileExample.generateTileData(request)');
    console.log('    - Cache: Call tileExample.getTileFromCache(request)');
    console.log('    - Grid: Call tileExample.generateTileGrid(lat, lng, size)');
    console.log('    - Stats: Call tileExample.getTileStats()');

    // Expose tileExample globally for debugging
    (window as any).tileExample = tileExample;
})();
