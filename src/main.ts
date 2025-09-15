import './style.css'
import App from './control/app';
import { initializeTileIntegration } from './example/terrainExample';

const canvas: HTMLCanvasElement | null = document.getElementById('gfx-main') as HTMLCanvasElement;

(async () => {
    const app = new App(canvas);
    await app.init();
    app.run();

    const tileExample = initializeTileIntegration(app);

    try {
        console.log('🌞 Loading solar terrain with both heightmap and GHI data...');

        await app.renderer.loadSolarTerrainTile(39.5, 32.5, 30);

        console.log('✅ Solar terrain loaded successfully!');
        console.log('🏔️ You should see 3D terrain with solar radiation overlay');

    } catch (error) {
        console.error('❌ Failed to load solar terrain:', error);
        console.log('📋 Falling back to manual tile generation');
    }

    console.log('🎯 Application initialized with solar terrain system');
    console.log('📋 Available methods:');
    console.log('  🌞 Solar Terrain:');
    console.log('    - Auto: Solar terrain loads automatically on startup');
    console.log('    - Manual: Call app.renderer.loadSolarTerrainTile(lat, lng, scale)');
    console.log('    - Grid: Call app.renderer.loadSolarTerrainGrid(lat, lng, size, scale)');
    console.log('  🎯 Legacy Tile Generation:');
    console.log('    - UI: Use the tile panel to generate terrain tiles');
    console.log('    - API: Call tileExample.generateTileData(request)');
    console.log('');
    console.log('🏔️ 3D Terrain: Both heightmap and solar data visualized together!');

    (window as any).tileExample = tileExample;
    (window as any).app = app;
})();
