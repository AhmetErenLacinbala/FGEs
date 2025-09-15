
const getApiBaseUrl = () => {

    if (typeof window !== 'undefined' && window.VITE_API_BASE_URL) {
        return window.VITE_API_BASE_URL;
    }


    try {
        if (typeof process !== 'undefined' && process.env && process.env.VITE_API_BASE_URL) {
            return process.env.VITE_API_BASE_URL;
        }
    } catch (e) {

    }


    return 'http://localhost:3000';
};

async function testTileGeneration() {
    try {
        const apiBaseUrl = getApiBaseUrl();

        const healthResponse = await fetch(`${apiBaseUrl}/terrain/test-r2`);
        console.log('Backend health:', healthResponse.ok ? 'CONNECTED' : 'FAILED');

        if (!healthResponse.ok) {
            console.error('❌ Backend not available:', apiBaseUrl);
            return;
        }

        const tileResponse = await fetch(`${apiBaseUrl}/terrain/generate-tile`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                centerLat: 40.0,
                centerLng: 32.75,
                scale: 30
            })
        });

        if (!tileResponse.ok) {
            throw new Error(`Backend error: ${tileResponse.status} ${tileResponse.statusText}`);
        }

        const tileData = await tileResponse.json();
        console.log('✅ Tile generation successful:', {
            filename: tileData.cacheInfo.filename,
            centerCoordinates: tileData.cacheInfo.centerCoordinates,
            tileSize: `${tileData.cacheInfo.tileSize}°`
        });

        const tiffResponse = await fetch(tileData.cacheInfo.downloadUrl);
        if (!tiffResponse.ok) {
            throw new Error(`TIF download failed: ${tiffResponse.status}`);
        }

        const tiffSize = parseInt(tiffResponse.headers.get('content-length') || '0');
        console.log('✅ TIF download successful:', `${Math.round(tiffSize / 1024)} KB`);

        console.log('🎉 ALL TESTS PASSED!');

    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

async function testTileGrid() {
    try {
        const apiBaseUrl = getApiBaseUrl();
        const tiles = [];

        for (let i = 0; i < 2; i++) {
            for (let j = 0; j < 2; j++) {
                const tileLat = 40.0 + (i * 0.01);
                const tileLng = 32.75 + (j * 0.01);

                const response = await fetch(`${apiBaseUrl}/terrain/generate-tile`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        centerLat: tileLat,
                        centerLng: tileLng,
                        scale: 30
                    })
                });

                if (response.ok) {
                    tiles.push(await response.json());
                }
            }
        }

        console.log(`Grid test: ${tiles.length}/4 tiles generated`);

    } catch (error) {
        console.error('❌ Grid test failed:', error);
    }
}

async function testTileScales() {
    try {
        const apiBaseUrl = getApiBaseUrl();
        const scales = [10, 30, 90];
        let successCount = 0;

        for (const scale of scales) {
            const response = await fetch(`${apiBaseUrl}/terrain/generate-tile`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    centerLat: 40.0,
                    centerLng: 32.75,
                    scale
                })
            });

            if (response.ok) {
                successCount++;
            }
        }

        console.log(`Scale test: ${successCount}/${scales.length} scales successful`);

    } catch (error) {
        console.error('❌ Scale test failed:', error);
    }
}

async function testTileIntegration() {
    console.log('Running comprehensive tests...');
    await testTileGeneration();
    await testTileGrid();
    await testTileScales();
    console.log('🎉 Integration test complete!');
}

if (typeof window !== 'undefined') {
    console.log('Test script loaded - API:', getApiBaseUrl());

    window.testTileGeneration = testTileGeneration;
    window.testTileGrid = testTileGrid;
    window.testTileScales = testTileScales;
    window.testTileIntegration = testTileIntegration;
    window.getApiBaseUrl = getApiBaseUrl;
} else {
    module.exports = {
        testTileGeneration,
        testTileGrid,
        testTileScales,
        testTileIntegration,
        getApiBaseUrl
    };
}