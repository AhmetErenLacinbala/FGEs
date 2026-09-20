import type { MaterialBindGroup } from "fges";

export interface GHITextureData {
    data: Float32Array;
    width: number;
    height: number;
    minGHI: number;
    maxGHI: number;
}

export default class SolarTerrainMaterialFactory {
    static createTerrainMaterial(
        device: GPUDevice,
        ghiTextureData: GHITextureData,
        satelliteImage: ImageBitmap | null,
        bindGroupLayout: GPUBindGroupLayout,
        blendSettingsBuffer: GPUBuffer,
        selectionQuadBuffer: GPUBuffer,
    ): MaterialBindGroup {
        if (ghiTextureData.data.length !== ghiTextureData.width * ghiTextureData.height) {
            throw new Error("GHI texture dimensions do not match the supplied data");
        }

        const ghiPixels = this.createHeatmapPixels(ghiTextureData);
        const ghiTexture = device.createTexture({
            label: "Solaris GHI heatmap",
            size: [ghiTextureData.width, ghiTextureData.height],
            format: "rgba8unorm",
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
        });
        device.queue.writeTexture(
            { texture: ghiTexture },
            ghiPixels,
            { bytesPerRow: ghiTextureData.width * 4 },
            { width: ghiTextureData.width, height: ghiTextureData.height },
        );
        const ghiView = ghiTexture.createView();
        const ghiSampler = device.createSampler({ magFilter: "linear", minFilter: "linear" });

        const satelliteTexture = satelliteImage
            ? this.createImageTexture(device, satelliteImage)
            : this.createPlaceholderTexture(device);
        const satelliteView = satelliteTexture.createView();
        const satelliteSampler = device.createSampler({
            addressModeU: "clamp-to-edge",
            addressModeV: "clamp-to-edge",
            magFilter: "linear",
            minFilter: "linear",
        });

        const bindGroup = device.createBindGroup({
            layout: bindGroupLayout,
            entries: [
                { binding: 0, resource: ghiView },
                { binding: 1, resource: ghiSampler },
                { binding: 2, resource: satelliteView },
                { binding: 3, resource: satelliteSampler },
                { binding: 4, resource: { buffer: blendSettingsBuffer } },
                { binding: 5, resource: { buffer: selectionQuadBuffer } },
            ],
        });

        return { bindGroup, texture: ghiTexture, sampler: ghiSampler, view: ghiView };
    }

    static async fetchSatelliteImage(
        latitude: number,
        longitude: number,
        apiKey: string,
        options: { zoom?: number; size?: number; scale?: number } = {},
    ): Promise<ImageBitmap | null> {
        const { zoom = 17, size = 640, scale = 2 } = options;
        const query = new URLSearchParams({
            center: `${latitude},${longitude}`,
            zoom: String(zoom),
            size: `${size}x${size}`,
            scale: String(scale),
            maptype: "satellite",
            key: apiKey,
        });

        try {
            const response = await fetch(`https://maps.googleapis.com/maps/api/staticmap?${query}`);
            if (!response.ok || !response.headers.get("content-type")?.includes("image")) {
                console.error(`Static Maps image request failed (${response.status})`);
                return null;
            }
            return await createImageBitmap(await response.blob());
        } catch (error) {
            console.error("Static Maps image request failed", error);
            return null;
        }
    }

    private static createHeatmapPixels(data: GHITextureData): Uint8Array {
        const pixels = new Uint8Array(data.width * data.height * 4);
        const range = Math.max(data.maxGHI - data.minGHI, Number.EPSILON);

        for (let index = 0; index < data.data.length; index++) {
            const normalized = Math.max(0, Math.min(1, (data.data[index] - data.minGHI) / range));
            const offset = index * 4;
            if (normalized < 0.5) {
                const value = normalized * 2;
                pixels[offset] = 0;
                pixels[offset + 1] = Math.round(value * 255);
                pixels[offset + 2] = Math.round((1 - value) * 255);
            } else {
                const value = (normalized - 0.5) * 2;
                pixels[offset] = Math.round(value * 255);
                pixels[offset + 1] = 255;
                pixels[offset + 2] = 0;
            }
            pixels[offset + 3] = 255;
        }
        return pixels;
    }

    private static createImageTexture(device: GPUDevice, image: ImageBitmap): GPUTexture {
        const texture = device.createTexture({
            label: "Solaris satellite image",
            size: [image.width, image.height],
            format: "rgba8unorm",
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
        });
        device.queue.copyExternalImageToTexture({ source: image }, { texture }, [image.width, image.height]);
        return texture;
    }

    private static createPlaceholderTexture(device: GPUDevice): GPUTexture {
        const texture = device.createTexture({
            label: "Solaris satellite placeholder",
            size: [1, 1],
            format: "rgba8unorm",
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
        });
        device.queue.writeTexture(
            { texture },
            new Uint8Array([0, 0, 0, 0]),
            { bytesPerRow: 4 },
            { width: 1, height: 1 },
        );
        return texture;
    }
}
