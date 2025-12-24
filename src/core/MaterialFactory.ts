/**
 * MaterialFactory - Factory for creating material bind groups
 * 
 * Usage:
 *   const material = await MaterialFactory.fromTexture(device, "img/texture.jpg", layout);
 *   const material = await MaterialFactory.fromColor(device, [1, 0, 0, 1], layout);
 *   const material = await MaterialFactory.fromGHIData(device, ghiData, width, height, layout);
 */

export interface MaterialBindGroup {
    bindGroup: GPUBindGroup;
    texture: GPUTexture;
    sampler: GPUSampler;
    view: GPUTextureView;
}

export default class MaterialFactory {

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

        // Load image
        const response = await fetch(url);
        const blob = await response.blob();
        const imageData = await createImageBitmap(blob);

        // Create texture
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

        // Create view and sampler
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

        // Create bind group
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
        // Create 1x1 texture with solid color
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
            data,
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
}

