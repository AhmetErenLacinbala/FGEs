var y=Object.defineProperty;var v=(n,r,e)=>r in n?y(n,r,{enumerable:!0,configurable:!0,writable:!0,value:e}):n[r]=e;var c=(n,r,e)=>v(n,typeof r!="symbol"?r+"":r,e);(function(){const r=document.createElement("link").relList;if(r&&r.supports&&r.supports("modulepreload"))return;for(const t of document.querySelectorAll('link[rel="modulepreload"]'))i(t);new MutationObserver(t=>{for(const o of t)if(o.type==="childList")for(const s of o.addedNodes)s.tagName==="LINK"&&s.rel==="modulepreload"&&i(s)}).observe(document,{childList:!0,subtree:!0});function e(t){const o={};return t.integrity&&(o.integrity=t.integrity),t.referrerPolicy&&(o.referrerPolicy=t.referrerPolicy),t.crossOrigin==="use-credentials"?o.credentials="include":t.crossOrigin==="anonymous"?o.credentials="omit":o.credentials="same-origin",o}function i(t){if(t.ep)return;t.ep=!0;const o=e(t);fetch(t.href,o)}})();const f=`struct Fragment{
    @builtin(position) Position: vec4<f32>,
    @location(0) Color: vec4<f32>,
}

@vertex
fn vs_main(@location(0) vertexPosition: vec2<f32>, @location(1) vertexColor: vec3<f32>) -> Fragment{

    var output : Fragment;
    output.Position = vec4<f32>(vertexPosition, 0.0, 1.0);
    output.Color = vec4<f32>(vertexColor,1.);
    return output;
}

@fragment
fn fs_main(@location(0) Color: vec4<f32>) -> @location(0) vec4<f32>{
    return Color;
}`;class b{constructor(r){c(this,"buffer");c(this,"bufferLayout");const e=new Float32Array([0,.5,1,0,0,-.5,-.5,0,1,0,.5,-.5,0,0,1]),i=GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST,t={size:e.byteLength,usage:i,mappedAtCreation:!0};this.buffer=r.createBuffer(t),new Float32Array(this.buffer.getMappedRange()).set(e),this.buffer.unmap(),this.bufferLayout={arrayStride:5*4,attributes:[{shaderLocation:0,format:"float32x3",offset:0},{shaderLocation:1,format:"float32x3",offset:2*4}]}}}const h=document.querySelector("#app"),l=document.querySelector("#compcheck");h.innerHTML="test";navigator.gpu?l.innerHTML="WebGPU is supported":l.innerHTML="WebGPU is not supported";const P=async()=>{const n=document.getElementById("gfx-main");if(!n){console.error("Canvas element not found!");return}const r=await navigator.gpu.requestAdapter();if(!r){console.error("WebGPU is not supported on this device!");return}const e=await r.requestDevice(),i=n.getContext("webgpu"),t="bgra8unorm";i.configure({device:e,format:t,alphaMode:"opaque"});const o=new b(e),s=e.createBindGroupLayout({entries:[]}),d=e.createBindGroup({layout:s,entries:[]}),p=e.createPipelineLayout({bindGroupLayouts:[s]}),m=e.createRenderPipeline({layout:p,vertex:{module:e.createShaderModule({code:f}),entryPoint:"vs_main",buffers:[o.bufferLayout]},fragment:{module:e.createShaderModule({code:f}),entryPoint:"fs_main",targets:[{format:t}]},primitive:{topology:"triangle-list"}}),u=e.createCommandEncoder(),g=i.getCurrentTexture().createView(),a=u.beginRenderPass({colorAttachments:[{view:g,clearValue:{r:.5,g:0,b:.25,a:1},loadOp:"clear",storeOp:"store"}]});a.setPipeline(m),a.setBindGroup(0,d),a.setVertexBuffer(0,o.buffer),a.draw(3,1,0,0),a.end(),e.queue.submit([u.finish()])};P();
