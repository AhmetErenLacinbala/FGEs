//import shader from './mipmapComputerShader.wgsl?raw'

export default class Material {

    texture!: GPUTexture;
    sampler!: GPUSampler;
    view!: GPUTextureView;
    bindGroup!: GPUBindGroup;

    static computeBindGroupLayout: GPUBindGroupLayout;



    async init(device: GPUDevice, url: string, bindGroupLayout: GPUBindGroupLayout) {
        const response: Response = await fetch(url);
        const blob: Blob = await response.blob();
        const imageData: ImageBitmap = await createImageBitmap(blob);
        await this.loadImageBitmap(device, imageData);
        const viewDesciptor: GPUTextureViewDescriptor = {
            format: "rgba8unorm",
            dimension: "2d",
            aspect: "all",
            baseMipLevel: 0,
            mipLevelCount: 1,
            baseArrayLayer: 0,
            arrayLayerCount: 1,
        }
        this.view = this.texture.createView(viewDesciptor);

        const samplerDescriptor: GPUSamplerDescriptor = {
            addressModeU: "repeat",
            addressModeV: "repeat",
            magFilter: "linear",
            minFilter: "nearest",
            mipmapFilter: "nearest",
            maxAnisotropy: 1
        };
        this.sampler = device.createSampler(samplerDescriptor);

        this.bindGroup = device.createBindGroup({
            layout: bindGroupLayout,
            entries:
                [
                    {
                        binding: 0,
                        resource: this.view
                    },

                    {
                        binding: 1,
                        resource: this.sampler
                    },

                ]
        });
    }
    async loadImageBitmap(device: GPUDevice, imageData: ImageBitmap) {

        const textureDescriptor: GPUTextureDescriptor = {
            size: {
                width: imageData.width,
                height: imageData.height
            },
            format: "rgba8unorm",
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
            //mipLevelCount: Math.floor(Math.log2(Math.max(imageData.width, imageData.height))) + 1,
        }
        this.texture = device.createTexture(textureDescriptor);
        device.queue.copyExternalImageToTexture(
            { source: imageData },
            { texture: this.texture },
            textureDescriptor.size,

        )
    }
    async initComputeShader(device: GPUDevice) {
        function log(...args: any[]) {
            const elem = document.createElement('pre');
            elem.textContent = args.join(' ');
            document.body.appendChild(elem);
        }

        const dispatchCount: [number, number, number] = [8, 8, 8]; // 4x3x2 dispatches
        const workgroupSize: [number, number, number] = [8, 8, 2]; // 8x8x2 threads per workgroup

        const arrayProd = (arr: number[]): number =>
            arr.reduce((a, b) => a * b);

        const numThreadsPerWorkgroup = arrayProd(workgroupSize);
        const numWorkgroups = arrayProd(dispatchCount);
        const numResults = numWorkgroups * numThreadsPerWorkgroup;
        const size = numResults * 4 * 4;  // (vec3<u32> aligned to vec4<u32>)

        const code = `
        @group(0) @binding(0) var<storage, read_write> workgroupResult: array<vec3u>;
        @group(0) @binding(1) var<storage, read_write> localResult: array<vec3u>;
        @group(0) @binding(2) var<storage, read_write> globalResult: array<vec3u>;

        @compute @workgroup_size(${workgroupSize.join(',')})
        fn main(
            @builtin(workgroup_id) workgroup_id : vec3<u32>,
            @builtin(local_invocation_id) local_invocation_id : vec3<u32>,
            @builtin(global_invocation_id) global_invocation_id : vec3<u32>,
            @builtin(local_invocation_index) local_invocation_index : u32,
            @builtin(num_workgroups) num_workgroups : vec3<u32>,
        ) {
            let workgroup_index =  
                workgroup_id.x +
                workgroup_id.y * num_workgroups.x +
                workgroup_id.z * num_workgroups.x * num_workgroups.y;

            let global_invocation_index =
                workgroup_index * ${numThreadsPerWorkgroup} +
                local_invocation_index;

            workgroupResult[global_invocation_index] = workgroup_id;
            localResult[global_invocation_index] = local_invocation_id;
            globalResult[global_invocation_index] = global_invocation_id;
        }
    `;

        const bufferUsage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC;
        const workgroupBuffer = device.createBuffer({ size, usage: bufferUsage });
        const localBuffer = device.createBuffer({ size, usage: bufferUsage });
        const globalBuffer = device.createBuffer({ size, usage: bufferUsage });

        const readBufferUsage = GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST;
        const workgroupReadBuffer = device.createBuffer({ size, usage: readBufferUsage });
        const localReadBuffer = device.createBuffer({ size, usage: readBufferUsage });
        const globalReadBuffer = device.createBuffer({ size, usage: readBufferUsage });

        const module = device.createShaderModule({ code });
        const computePipeline = device.createComputePipeline({
            layout: "auto",
            compute: { module, entryPoint: "main" },
        });

        const bindGroup = device.createBindGroup({
            layout: computePipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: workgroupBuffer } },
                { binding: 1, resource: { buffer: localBuffer } },
                { binding: 2, resource: { buffer: globalBuffer } },
            ],
        });

        const encoder = device.createCommandEncoder();
        const pass = encoder.beginComputePass();

        pass.setPipeline(computePipeline);
        pass.setBindGroup(0, bindGroup);

        const start = performance.now();  // Start timing

        pass.dispatchWorkgroups(...dispatchCount);
        pass.end();

        // Copy ALL THREE buffers to readBuffers
        encoder.copyBufferToBuffer(workgroupBuffer, 0, workgroupReadBuffer, 0, size);
        encoder.copyBufferToBuffer(localBuffer, 0, localReadBuffer, 0, size);
        encoder.copyBufferToBuffer(globalBuffer, 0, globalReadBuffer, 0, size);

        device.queue.submit([encoder.finish()]);

        await Promise.all([
            workgroupReadBuffer.mapAsync(GPUMapMode.READ),
            localReadBuffer.mapAsync(GPUMapMode.READ),
            globalReadBuffer.mapAsync(GPUMapMode.READ),
        ]);

        const end = performance.now();  // End timing

        const workgroup = new Uint32Array(workgroupReadBuffer.getMappedRange());
        const local = new Uint32Array(localReadBuffer.getMappedRange());
        const global = new Uint32Array(globalReadBuffer.getMappedRange());

        const get3 = (arr: Uint32Array, i: number) => {
            const off = i * 4;
            return `${arr[off]}, ${arr[off + 1]}, ${arr[off + 2]}`;
        };

        log(`✅ GPU Compute Shader Finished in ${(end - start).toFixed(2)} ms`);
        log(`Results for ${numResults} total threads:`);

        for (let i = 0; i < numResults; ++i) {
            if (i % numThreadsPerWorkgroup === 0) {
                log(`\
---------------------------------------
global                 local     global   dispatch: ${i / numThreadsPerWorkgroup}
invoc.    workgroup    invoc.    invoc.
index     id           id        id
---------------------------------------`);
            }
            log(`${i.toString().padStart(3)}:      ${get3(workgroup, i)}      ${get3(local, i)}   ${get3(global, i)}`);
        }

        workgroupReadBuffer.unmap();
        localReadBuffer.unmap();
        globalReadBuffer.unmap();
    }



}