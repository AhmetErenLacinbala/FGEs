import { GLTFRawTextureInfo } from "./MeshFactory";

/**
 * MaterialFactory - Factory for creating material bind groups
 * 
 * Usage:
 *   const material = await MaterialFactory.fromTexture(device, "img/texture.jpg", layout);
 *   const material = await MaterialFactory.fromColor(device, [1, 0, 0, 1], layout);
 *   const material = await MaterialFactory.fromGLTFTexture(device, rawTextureInfo, layout);
 */

export interface MaterialBindGroup {
    bindGroup: GPUBindGroup;
    texture: GPUTexture;
    sampler: GPUSampler;
    view: GPUTextureView;
}

export default class MaterialFactory {

    /**
     * Create material from GLTF raw texture data
     * Use with MeshFactory.fromGLTFComplete() output
     */
    static async fromGLTFTexture(
        device: GPUDevice,
        textureInfo: GLTFRawTextureInfo,
        bindGroupLayout: GPUBindGroupLayout,
        options: {
            addressMode?: GPUAddressMode;
            filterMode?: GPUFilterMode;
        } = {}
    ): Promise<MaterialBindGroup> {
        const { addressMode = 'repeat', filterMode = 'linear' } = options;

        // Create ImageBitmap from raw image data
        // Copy to new ArrayBuffer to avoid SharedArrayBuffer compatibility issues
        const imageBytes = new Uint8Array(textureInfo.imageData.length);
        imageBytes.set(textureInfo.imageData);
        const blob = new Blob([imageBytes.buffer], { type: textureInfo.mimeType });
        const imageBitmap = await createImageBitmap(blob);

        // Create GPU texture
        const texture = device.createTexture({
            size: [imageBitmap.width, imageBitmap.height, 1],
            format: 'rgba8unorm',
            usage: GPUTextureUsage.TEXTURE_BINDING |
                GPUTextureUsage.COPY_DST |
                GPUTextureUsage.RENDER_ATTACHMENT
        });

        // Copy image to texture
        device.queue.copyExternalImageToTexture(
            { source: imageBitmap },
            { texture },
            [imageBitmap.width, imageBitmap.height]
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
            minFilter: filterMode,
            mipmapFilter: 'linear'
        });

        const bindGroup = device.createBindGroup({
            layout: bindGroupLayout,
            entries: [
                { binding: 0, resource: view },
                { binding: 1, resource: sampler }
            ]
        });

        console.log(`MaterialFactory: Created texture from GLTF "${textureInfo.name}" (${imageBitmap.width}x${imageBitmap.height})`);

        return { bindGroup, texture, sampler, view };
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

}
