/**
 * MaterialFactory - Factory for creating material bind groups
 * 
 * Usage:
 *   const material = await MaterialFactory.fromTexture(device, "img/texture.jpg", layout);
 *   const material = await MaterialFactory.fromColor(device, [1, 0, 0, 1], layout);
 *   const material = await MaterialFactory.fromGHIData(device, ghiData, width, height, layout);
 *   const material = await MaterialFactory.fromSatelliteImage(device, lat, lng, zoom, size, apiKey, layout);
 */

export interface MaterialBindGroup {
    bindGroup: GPUBindGroup;
    texture: GPUTexture;
    sampler: GPUSampler;
    view: GPUTextureView;
}

export default class MaterialFactory {

    /**
     * Create material from Google Maps satellite imagery
     * Uses the Static Maps API to fetch satellite tiles
     */
    static async fromSatelliteImage(
        device: GPUDevice,
        lat: number,
        lng: number,
        bindGroupLayout: GPUBindGroupLayout,
        options: {
            /** Zoom level (1-21, higher = more detail) */
            zoom?: number;
            /** Image size in pixels (max 640 for free tier) */
            size?: number;
            /** Google Maps API key */
            apiKey: string;
            /** Scale factor (1 or 2 for retina) */
            scale?: number;
        }
    ): Promise<MaterialBindGroup> {
        const {
            zoom = 15,
            size = 640,
            apiKey,
            scale = 2
        } = options;


        const url = `https://maps.googleapis.com/maps/api/staticmap?` +
            `center=${lat},${lng}` +
            `&zoom=${zoom}` +
            `&size=${size}x${size}` +
            `&scale=${scale}` +
            `&maptype=satellite` +
            `&key=${apiKey}`;

        console.log(`🛰️ Fetching satellite image: zoom=${zoom}, size=${size}x${size}`);
        console.log(`🛰️ URL: ${url}`);

        try {

            const response = await fetch(url);

            if (!response.ok) {

                const errorText = await response.text();
                console.error('❌ Static Maps API error:', response.status, errorText);
                throw new Error(`Failed to fetch satellite image: ${response.status} - Check if "Maps Static API" is enabled in Google Cloud Console`);
            }

            const contentType = response.headers.get('content-type');
            if (!contentType?.includes('image')) {
                const errorText = await response.text();
                console.error('❌ Static Maps API returned non-image:', errorText);
                throw new Error('Static Maps API error - Check console for details');
            }

            const blob = await response.blob();
            const imageData = await createImageBitmap(blob);
            console.log(`✅ Satellite image loaded: ${imageData.width}x${imageData.height}`);

            const texture = device.createTexture({
                size: { width: imageData.width, height: imageData.height },
                format: 'rgba8unorm',
                usage: GPUTextureUsage.TEXTURE_BINDING |
                    GPUTextureUsage.COPY_DST |
                    GPUTextureUsage.RENDER_ATTACHMENT
            });

            device.queue.copyExternalImageToTexture(
                { source: imageData },
                { texture },
                [imageData.width, imageData.height]
            );

            const view = texture.createView({
                format: 'rgba8unorm',
                dimension: '2d',
                aspect: 'all',
                baseMipLevel: 0,
                mipLevelCount: 1
            });

            const sampler = device.createSampler({
                addressModeU: 'clamp-to-edge',
                addressModeV: 'clamp-to-edge',
                magFilter: 'linear',
                minFilter: 'linear'
            });

            const bindGroup = device.createBindGroup({
                layout: bindGroupLayout,
                entries: [
                    { binding: 0, resource: view },
                    { binding: 1, resource: sampler }
                ]
            });

            console.log(`✅ Satellite texture created: ${imageData.width}x${imageData.height}`);

            return { bindGroup, texture, sampler, view };

        } catch (error) {
            console.error('❌ Satellite image fetch failed:', error);
            throw error;
        }
    }

    /**
     * Create material from image URL
     */
    static async fromTexture(
        device: GPUDevice,
        url: string,
        bindGroupLayout: GPUBindGroupLayout,
        options: {
            addressMode?: GPUAddressMode;
            filterMode?: GPUFilterMode;
        } = {}
    ): Promise<MaterialBindGroup> {
        const { addressMode = 'repeat', filterMode = 'linear' } = options;

        const response = await fetch(url);
        const blob = await response.blob();
        const imageData = await createImageBitmap(blob);

        const texture = device.createTexture({
            size: { width: imageData.width, height: imageData.height },
            format: 'rgba8unorm',
            usage: GPUTextureUsage.TEXTURE_BINDING |
                GPUTextureUsage.COPY_DST |
                GPUTextureUsage.RENDER_ATTACHMENT
        });

        device.queue.copyExternalImageToTexture(
            { source: imageData },
            { texture },
            [imageData.width, imageData.height]
        );

        const view = texture.createView({
            format: 'rgba8unorm',
            dimension: '2d',
            aspect: 'all',
            baseMipLevel: 0,
            mipLevelCount: 1
        });

        const sampler = device.createSampler({
            addressModeU: addressMode,
            addressModeV: addressMode,
            magFilter: filterMode,
            minFilter: filterMode
        });

        const bindGroup = device.createBindGroup({
            layout: bindGroupLayout,
            entries: [
                { binding: 0, resource: view },
                { binding: 1, resource: sampler }
            ]
        });

        return { bindGroup, texture, sampler, view };
    }

    /**
     * Create material from solid color
     */
    static fromColor(
        device: GPUDevice,
        color: [number, number, number, number], // RGBA 0-1
        bindGroupLayout: GPUBindGroupLayout
    ): MaterialBindGroup {
        const textureData = new Uint8Array([
            Math.floor(color[0] * 255),
            Math.floor(color[1] * 255),
            Math.floor(color[2] * 255),
            Math.floor(color[3] * 255)
        ]);

        const texture = device.createTexture({
            size: { width: 1, height: 1 },
            format: 'rgba8unorm',
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
        });

        device.queue.writeTexture(
            { texture },
            textureData,
            { bytesPerRow: 4 },
            { width: 1, height: 1 }
        );

        const view = texture.createView();
        const sampler = device.createSampler({
            magFilter: 'nearest',
            minFilter: 'nearest'
        });

        const bindGroup = device.createBindGroup({
            layout: bindGroupLayout,
            entries: [
                { binding: 0, resource: view },
                { binding: 1, resource: sampler }
            ]
        });

        return { bindGroup, texture, sampler, view };
    }

    /**
     * Create material from GHI solar data (heatmap visualization)
     */
    static fromGHIData(
        device: GPUDevice,
        ghiData: Float32Array,
        width: number,
        height: number,
        minGHI: number,
        maxGHI: number,
        bindGroupLayout: GPUBindGroupLayout
    ): MaterialBindGroup {
        // Convert GHI to RGBA heatmap
        const textureData = new Uint8Array(width * height * 4);

        for (let i = 0; i < ghiData.length; i++) {
            const normalized = (ghiData[i] - minGHI) / (maxGHI - minGHI);

            // Blue → Green → Yellow → Red color ramp
            let r: number, g: number, b: number;
            if (normalized < 0.5) {
                const t = normalized * 2;
                r = 0;
                g = Math.floor(t * 255);
                b = Math.floor((1 - t) * 255);
            } else {
                const t = (normalized - 0.5) * 2;
                r = Math.floor(t * 255);
                g = 255;
                b = 0;
            }

            const idx = i * 4;
            textureData[idx + 0] = r;
            textureData[idx + 1] = g;
            textureData[idx + 2] = b;
            textureData[idx + 3] = 255;
        }

        const texture = device.createTexture({
            size: { width, height },
            format: 'rgba8unorm',
            usage: GPUTextureUsage.TEXTURE_BINDING |
                GPUTextureUsage.COPY_DST |
                GPUTextureUsage.RENDER_ATTACHMENT
        });

        device.queue.writeTexture(
            { texture },
            textureData,
            { bytesPerRow: width * 4 },
            { width, height }
        );

        const view = texture.createView({
            format: 'rgba8unorm',
            dimension: '2d'
        });

        const sampler = device.createSampler({
            magFilter: 'linear',
            minFilter: 'linear'
        });

        const bindGroup = device.createBindGroup({
            layout: bindGroupLayout,
            entries: [
                { binding: 0, resource: view },
                { binding: 1, resource: sampler }
            ]
        });

        return { bindGroup, texture, sampler, view };
    }

    /**
     * Create material from raw texture data
     */
    static fromRawData(
        device: GPUDevice,
        data: Uint8Array,
        width: number,
        height: number,
        bindGroupLayout: GPUBindGroupLayout,
        options: {
            format?: GPUTextureFormat;
            filterMode?: GPUFilterMode;
        } = {}
    ): MaterialBindGroup {
        const { format = 'rgba8unorm', filterMode = 'linear' } = options;

        const texture = device.createTexture({
            size: { width, height },
            format,
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
        });

        device.queue.writeTexture(
            { texture },
            data as BufferSource,
            { bytesPerRow: width * 4 },
            { width, height }
        );

        const view = texture.createView();
        const sampler = device.createSampler({
            magFilter: filterMode,
            minFilter: filterMode
        });

        const bindGroup = device.createBindGroup({
            layout: bindGroupLayout,
            entries: [
                { binding: 0, resource: view },
                { binding: 1, resource: sampler }
            ]
        });

        return { bindGroup, texture, sampler, view };
    }

    /**
     * Create terrain material with dual textures (GHI + Satellite) for shader blending
     */
    static createTerrainMaterial(
        device: GPUDevice,
        ghiTextureData: {
            data: Float32Array;
            width: number;
            height: number;
            minGHI: number;
            maxGHI: number;
        },
        satelliteTextureData: {
            data: ImageBitmap | null;
        },
        bindGroupLayout: GPUBindGroupLayout,
        blendSettingsBuffer: GPUBuffer,
        selectionQuadBuffer: GPUBuffer
    ): MaterialBindGroup {
        // Create GHI texture (heatmap)
        const ghiPixelData = new Uint8Array(ghiTextureData.width * ghiTextureData.height * 4);
        for (let i = 0; i < ghiTextureData.data.length; i++) {
            const normalized = (ghiTextureData.data[i] - ghiTextureData.minGHI) /
                (ghiTextureData.maxGHI - ghiTextureData.minGHI);

            let r: number, g: number, b: number;
            if (normalized < 0.5) {
                const t = normalized * 2;
                r = 0;
                g = Math.floor(t * 255);
                b = Math.floor((1 - t) * 255);
            } else {
                const t = (normalized - 0.5) * 2;
                r = Math.floor(t * 255);
                g = 255;
                b = 0;
            }

            const idx = i * 4;
            ghiPixelData[idx + 0] = r;
            ghiPixelData[idx + 1] = g;
            ghiPixelData[idx + 2] = b;
            ghiPixelData[idx + 3] = 255;
        }

        const ghiTexture = device.createTexture({
            size: { width: ghiTextureData.width, height: ghiTextureData.height },
            format: 'rgba8unorm',
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
        });

        device.queue.writeTexture(
            { texture: ghiTexture },
            ghiPixelData as BufferSource,
            { bytesPerRow: ghiTextureData.width * 4 },
            { width: ghiTextureData.width, height: ghiTextureData.height }
        );

        const ghiView = ghiTexture.createView();
        const ghiSampler = device.createSampler({
            magFilter: 'linear',
            minFilter: 'linear'
        });

        // Create satellite texture (or placeholder if not available)
        let satelliteTexture: GPUTexture;
        let satelliteView: GPUTextureView;

        if (satelliteTextureData.data) {
            satelliteTexture = device.createTexture({
                size: {
                    width: satelliteTextureData.data.width,
                    height: satelliteTextureData.data.height
                },
                format: 'rgba8unorm',
                usage: GPUTextureUsage.TEXTURE_BINDING |
                    GPUTextureUsage.COPY_DST |
                    GPUTextureUsage.RENDER_ATTACHMENT
            });

            device.queue.copyExternalImageToTexture(
                { source: satelliteTextureData.data },
                { texture: satelliteTexture },
                [satelliteTextureData.data.width, satelliteTextureData.data.height]
            );

            satelliteView = satelliteTexture.createView();
        } else {
            // Create 1x1 transparent placeholder
            satelliteTexture = device.createTexture({
                size: { width: 1, height: 1 },
                format: 'rgba8unorm',
                usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
            });

            device.queue.writeTexture(
                { texture: satelliteTexture },
                new Uint8Array([0, 0, 0, 0]),
                { bytesPerRow: 4 },
                { width: 1, height: 1 }
            );

            satelliteView = satelliteTexture.createView();
        }

        const satelliteSampler = device.createSampler({
            addressModeU: 'clamp-to-edge',
            addressModeV: 'clamp-to-edge',
            magFilter: 'linear',
            minFilter: 'linear'
        });

        const bindGroup = device.createBindGroup({
            layout: bindGroupLayout,
            entries: [
                { binding: 0, resource: ghiView },
                { binding: 1, resource: ghiSampler },
                { binding: 2, resource: satelliteView },
                { binding: 3, resource: satelliteSampler },
                { binding: 4, resource: { buffer: blendSettingsBuffer }, },
                { binding: 5, resource: { buffer: selectionQuadBuffer } }
            ]
        });

        console.log(`Terrain material created: GHI ${ghiTextureData.width}x${ghiTextureData.height}, Satellite: ${satelliteTextureData.data ? 'loaded' : 'placeholder'}`);

        return {
            bindGroup,
            texture: ghiTexture,
            sampler: ghiSampler,
            view: ghiView
        };
    }

    /**
     * Helper: Fetch satellite image and return ImageBitmap
     */
    static async fetchSatelliteImage(
        lat: number,
        lng: number,
        apiKey: string,
        options: {
            zoom?: number;
            size?: number;
            scale?: number;
        } = {}
    ): Promise<ImageBitmap | null> {
        const { zoom = 17, size = 640, scale = 2 } = options;

        const url = `https://maps.googleapis.com/maps/api/staticmap?` +
            `center=${lat},${lng}` +
            `&zoom=${zoom}` +
            `&size=${size}x${size}` +
            `&scale=${scale}` +
            `&maptype=satellite` +
            `&key=${apiKey}`;

        try {
            const response = await fetch(url);
            if (!response.ok) {
                console.error('❌ Failed to fetch satellite image:', response.status);
                return null;
            }

            const contentType = response.headers.get('content-type');
            if (!contentType?.includes('image')) {
                console.error('❌ Static Maps API returned non-image response');
                return null;
            }

            const blob = await response.blob();
            const imageData = await createImageBitmap(blob);
            console.log(`✅ Satellite image fetched: ${imageData.width}x${imageData.height}`);
            return imageData;
        } catch (error) {
            console.error('❌ Satellite fetch error:', error);
            return null;
        }
    }
}

