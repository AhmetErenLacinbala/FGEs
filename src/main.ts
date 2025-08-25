import './style.css'
import App from './control/app';
import { initializeTileIntegration } from './example/terrainExample';
import { StatusManager } from './control/statusManager';

const canvas: HTMLCanvasElement | null = document.getElementById('gfx-main') as HTMLCanvasElement;

(async () => {
    // Initialize the existing WebGPU app
    const app = new App(canvas);
    await app.init();
    app.run();

    // Initialize status manager
    const statusManager = new StatusManager();

    // Initialize the tile generation system with app reference for 3D terrain
    const tileExample = initializeTileIntegration(app);

    // 🌍 Initialize terrain streaming system automatically
    let backendAvailable = false;
    let streamingEnabled = false;

    try {
        console.log('🌍 Initializing terrain streaming system...');
        statusManager.addLog('🌍 Initializing terrain streaming system...', 'info');

        // Test backend connection first
        statusManager.updateBackendStatus('checking');
        backendAvailable = await fetch('http://localhost:3000/terrain/test-r2', {
            method: 'GET',
            signal: AbortSignal.timeout(5000) // 5 second timeout
        }).then(res => res.ok).catch(() => false);

        if (backendAvailable) {
            statusManager.updateBackendStatus('online');
            statusManager.addLog('✅ Backend connection established', 'success');

            // Connect app status logging
            app.statusLogCallback = (message, type) => statusManager.addLog(message, type);

            // Start terrain streaming at a default location (NYC) with smaller grid
            await app.initializeTerrainStreaming(40.7128, -74.0060);
            streamingEnabled = true;

            // Connect status updates
            if (app.renderer.terrainManager) {
                app.renderer.terrainManager.setLogCallback((message, type) => statusManager.addLog(message, type));
                app.renderer.terrainManager.setStatusCallback((status) => {
                    statusManager.updateStatus({
                        backendStatus: 'online',
                        streamingActive: streamingEnabled,
                        tilesLoaded: status.tilesLoaded,
                        workersActive: status.workersActive,
                        totalWorkers: status.totalWorkers,
                        memoryUsage: parseFloat(status.memoryUsage),
                        playerCoords: status.playerCoords,
                        queueSize: status.queueSize
                    });
                });

                // Start periodic status updates
                setInterval(() => {
                    if (app.renderer.terrainManager) {
                        const status = app.renderer.terrainManager.getCurrentStatus();
                        statusManager.updateStatus({
                            backendStatus: 'online',
                            streamingActive: streamingEnabled,
                            tilesLoaded: status.tilesLoaded,
                            workersActive: status.workersActive,
                            totalWorkers: status.totalWorkers,
                            memoryUsage: parseFloat(status.memoryUsage),
                            playerCoords: status.playerCoords,
                            queueSize: status.queueSize
                        });
                    }
                }, 1000); // Update every second
            }

            statusManager.updateStreamingStatus(true);
            statusManager.addLog('✅ Terrain streaming ready - Auto-fetching 9 tiles!', 'success');
            statusManager.addLog('🎮 Use WASD to move and trigger streaming', 'info');

            console.log('✅ Terrain streaming system ready!');
            console.log('🎮 Use WASD to move and trigger terrain streaming');
        } else {
            statusManager.updateBackendStatus('offline');
            statusManager.addLog('❌ Backend not available, terrain streaming disabled', 'error');
            statusManager.addLog('📋 Using legacy tile generation system only', 'warning');

            console.log('🔌 Backend not available, terrain streaming disabled');
            console.log('📋 Using legacy tile generation system only');
        }

    } catch (error) {
        statusManager.updateBackendStatus('offline');
        statusManager.addLog('❌ Failed to initialize terrain streaming', 'error');
        statusManager.addLog('📋 Falling back to legacy tile generation system', 'warning');

        console.error('❌ Failed to initialize terrain streaming:', error);
        console.log('📋 Falling back to legacy tile generation system');
    }

    // Update status with initial values
    statusManager.updateStatus({
        backendStatus: backendAvailable ? 'online' : 'offline',
        streamingActive: streamingEnabled,
        tilesLoaded: 0,
        workersActive: 0,
        totalWorkers: streamingEnabled ? 2 : 0, // Workers re-enabled with JS version
        memoryUsage: 0,
        playerCoords: { lat: 40.7128, lng: -74.0060 },
        queueSize: 0
    });

    console.log('🎯 Application initialized with terrain streaming system');
    console.log('📋 Available systems:');
    console.log('  🌍 Terrain Streaming:');
    console.log('    - Automatic: Move with WASD to trigger streaming');
    console.log('    - Manual: Call app.initializeTerrainStreaming(lat, lng)');
    console.log('    - Stats: Call app.renderer.getTerrainStats()');
    console.log('  🎯 Legacy Tile Generation:');
    console.log('    - UI: Use the tile panel to generate terrain tiles');
    console.log('    - API: Call tileExample.generateTileData(request)');
    console.log('    - Cache: Call tileExample.getTileFromCache(request)');
    console.log('    - Grid: Call tileExample.generateTileGrid(lat, lng, size)');
    console.log('    - Stats: Call tileExample.getTileStats()');
    console.log('');
    console.log('🏔️ 3D Terrain: Both systems create terrain in the 3D scene!');

    // Expose for debugging
    (window as any).tileExample = tileExample;
    (window as any).app = app;
})();
