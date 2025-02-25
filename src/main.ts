import './style.css'
import shader from './shaders.wgsl?raw'


const app: HTMLDivElement = document.querySelector<HTMLDivElement>('#app')!;
const check: HTMLDivElement = document.querySelector<HTMLDivElement>('#compcheck')!;

app.innerHTML= 'test';

if(navigator.gpu){
  check.innerHTML = 'WebGPU is supported';
}
else{
  check.innerHTML = 'WebGPU is not supported';
}

const Initilize = async () => {
  const canvas: HTMLCanvasElement | null = document.getElementById('gfx-main') as HTMLCanvasElement;
  
  if (!canvas) {
    console.error("Canvas element not found!");
    return;
  }
  const adaptor: GPUAdapter | null = await navigator.gpu.requestAdapter();
  if (!adaptor) {
    console.error("WebGPU is not supported on this device!");
    return;
  }
  
  const device: GPUDevice = <GPUDevice>await adaptor.requestDevice();
  const context: GPUCanvasContext = <GPUCanvasContext>canvas.getContext('webgpu'); 
  const format: GPUTextureFormat = 'bgra8unorm';
  context.configure({ //swapchain
   device: device,
   format: format, 
   alphaMode: 'opaque'
  });
  const pipeline: GPURenderPipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: {
      module: device.createShaderModule({
        code: shader,
      }),
      entryPoint: 'vs_main',
    },
    fragment: {
      module: device.createShaderModule({
          code: shader
        }),
      entryPoint: 'fs_main',
      targets: [{format: format}],
    },
    primitive: {
      topology: 'triangle-list',
    }
  });

  const commandEncoder: GPUCommandEncoder = device.createCommandEncoder();  
  const textureView: GPUTextureView = context.getCurrentTexture().createView();
  const renderpass: GPURenderPassEncoder = commandEncoder.beginRenderPass({
    colorAttachments: [{
      view: textureView,
      clearValue: {r: 0.5, g: 0.0, b: 0.25, a: 1.},
      loadOp: 'clear',
      storeOp: 'store',
    }]})
    renderpass.setPipeline(pipeline);
    renderpass.draw(3, 1, 0, 0);
    renderpass.end();
    device.queue.submit([commandEncoder.finish()]);
};

Initilize();