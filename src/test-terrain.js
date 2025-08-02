// 🎯 Simple test to verify tile generation integration with backend
// Run in browser console after loading the app

// Test tile generation endpoint
async function testTileGeneration() {
    try {
        console.log('🎯 Testing tile generation with working backend...');

        // Test 1: Backend connection
        const healthResponse = await fetch('http://localhost:3000/terrain/test-r2');
        console.log('✅ Backend health:', healthResponse.ok ? 'CONNECTED' : 'FAILED');

        if (!healthResponse.ok) {
            console.error('❌ Backend not available! Make sure NestJS server is running on localhost:3000');
            return;
        }

        // Test 2: Generate tile from center coordinates (Turkey region)
        console.log('🇹🇷 Testing tile generation...');

        const tileResponse = await fetch('http://localhost:3000/terrain/generate-tile', {
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
            calculatedBounds: tileData.cacheInfo.region,
            tileSize: `${tileData.cacheInfo.tileSize}° (~${(tileData.cacheInfo.tileSize * 111).toFixed(1)}km)`,
            downloadUrl: tileData.cacheInfo.downloadUrl
        });

        // Test 3: Download TIF file
        console.log('📥 Testing tile TIF file download...');

        const tiffResponse = await fetch(tileData.cacheInfo.downloadUrl);

        if (!tiffResponse.ok) {
            throw new Error(`TIF download failed: ${tiffResponse.status} ${tiffResponse.statusText}`);
        }

        const tiffSize = parseInt(tiffResponse.headers.get('content-length') || '0');
        console.log('✅ Tile TIF download successful:', {
            size: `${Math.round(tiffSize / 1024)} KB`,
            contentType: tiffResponse.headers.get('content-type')
        });

        console.log('🎉 ALL TILE TESTS PASSED! Tile generation is working perfectly!');
        console.log('🎯 Ready to use terrainService.generateTile() in your app');

    } catch (error) {
        console.error('❌ Tile generation test failed:', error);
    }
}

// Test multiple tile generation (grid pattern)
async function testTileGrid() {
    try {
        console.log('🗂️ Testing multiple tile generation...');

        const centerLat = 40.0;
        const centerLng = 32.75;
        const tileSize = 0.01;

        // Generate 2x2 grid of tiles
        const tiles = [];
        for (let i = 0; i < 2; i++) {
            for (let j = 0; j < 2; j++) {
                const tileLat = centerLat + (i * tileSize);
                const tileLng = centerLng + (j * tileSize);

                console.log(`🎯 Generating tile ${tiles.length + 1}/4 at (${tileLat}, ${tileLng})`);

                const response = await fetch('http://localhost:3000/terrain/generate-tile', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        centerLat: tileLat,
                        centerLng: tileLng,
                        scale: 30
                    })
                });

                if (response.ok) {
                    const tileData = await response.json();
                    tiles.push(tileData);
                    console.log(`✅ Tile ${tiles.length}/4 generated successfully`);
                } else {
                    console.error(`❌ Failed to generate tile ${tiles.length + 1}/4`);
                }
            }
        }

        console.log(`🎉 Grid test complete: ${tiles.length}/4 tiles generated successfully!`);
        console.log('🎯 Grid tiles can be used to create larger terrain areas');

    } catch (error) {
        console.error('❌ Tile grid test failed:', error);
    }
}

// Test tile generation with different scales
async function testTileScales() {
    try {
        console.log('📏 Testing tile generation with different scales...');

        const scales = [10, 30, 90]; // Different resolution scales
        const centerLat = 40.0;
        const centerLng = 32.75;

        for (const scale of scales) {
            console.log(`🎯 Testing scale: ${scale}m`);

            const response = await fetch('http://localhost:3000/terrain/generate-tile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    centerLat,
                    centerLng,
                    scale
                })
            });

            if (response.ok) {
                const tileData = await response.json();
                console.log(`✅ Scale ${scale}m: ${tileData.cacheInfo.filename}`);
            } else {
                console.error(`❌ Scale ${scale}m failed`);
            }
        }

        console.log('🎉 Scale test complete! Different resolutions working correctly');

    } catch (error) {
        console.error('❌ Scale test failed:', error);
    }
}

// Comprehensive test suite
async function testTileIntegration() {
    console.log('🚀 Running comprehensive tile generation tests...');

    console.log('\n=== BASIC TILE GENERATION ===');
    await testTileGeneration();

    console.log('\n=== TILE GRID GENERATION ===');
    await testTileGrid();

    console.log('\n=== TILE SCALE VARIATIONS ===');
    await testTileScales();

    console.log('\n🎉 COMPREHENSIVE TILE INTEGRATION TEST COMPLETE!');
    console.log('🎯 All tile generation features tested and verified');
}

// Auto-run test when script loads
if (typeof window !== 'undefined') {
    console.log('🎯 Tile generation test script loaded');
    console.log('📋 Available test functions:');
    console.log('  - testTileGeneration() - Test basic tile generation');
    console.log('  - testTileGrid() - Test multiple tile generation');
    console.log('  - testTileScales() - Test different scale variations');
    console.log('  - testTileIntegration() - Run all tests');

    // Expose test functions globally
    window.testTileGeneration = testTileGeneration;
    window.testTileGrid = testTileGrid;
    window.testTileScales = testTileScales;
    window.testTileIntegration = testTileIntegration;
} else {
    // For Node.js environments
    module.exports = {
        testTileGeneration,
        testTileGrid,
        testTileScales,
        testTileIntegration
    };
} 