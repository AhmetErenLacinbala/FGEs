import { fromUrl } from 'geotiff';

async function loadGeoTIFF() {
    // Load the GeoTIFF from a local or remote source
    const tiff = await fromUrl('/path/to/ghi_world.tif'); // must be served by your dev server
    const image = await tiff.getImage();

    // Get raster data
    const rasterData = await image.readRasters();
    console.log('Raster size:', image.getWidth(), image.getHeight());
    console.log('Pixel[0]:', rasterData[0][0]);

    // Convert lat/lon to pixel
    const bbox = image.getBoundingBox();
    console.log('Bounding box:', bbox);
}

loadGeoTIFF();
