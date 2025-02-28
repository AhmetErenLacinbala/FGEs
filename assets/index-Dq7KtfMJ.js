var q=Object.defineProperty;var D=(e,t,n)=>t in e?q(e,t,{enumerable:!0,configurable:!0,writable:!0,value:n}):e[t]=n;var f=(e,t,n)=>D(e,typeof t!="symbol"?t+"":t,n);(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const r of document.querySelectorAll('link[rel="modulepreload"]'))s(r);new MutationObserver(r=>{for(const i of r)if(i.type==="childList")for(const a of i.addedNodes)a.tagName==="LINK"&&a.rel==="modulepreload"&&s(a)}).observe(document,{childList:!0,subtree:!0});function n(r){const i={};return r.integrity&&(i.integrity=r.integrity),r.referrerPolicy&&(i.referrerPolicy=r.referrerPolicy),r.crossOrigin==="use-credentials"?i.credentials="include":r.crossOrigin==="anonymous"?i.credentials="omit":i.credentials="same-origin",i}function s(r){if(r.ep)return;r.ep=!0;const i=n(r);fetch(r.href,i)}})();class N{constructor(){f(this,"texture");f(this,"sampler");f(this,"view")}async init(t,n){const r=await(await fetch(n)).blob(),i=await createImageBitmap(r);await this.loadImageBitmap(t,i);const a={format:"rgba8unorm",dimension:"2d",aspect:"all",baseMipLevel:0,mipLevelCount:1,baseArrayLayer:0,arrayLayerCount:1};this.view=this.texture.createView(a);const d={addressModeU:"repeat",addressModeV:"repeat",magFilter:"linear",minFilter:"nearest",mipmapFilter:"nearest",maxAnisotropy:1};this.sampler=t.createSampler(d)}async loadImageBitmap(t,n){const s={size:{width:n.width,height:n.height},format:"rgba8unorm",usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT};this.texture=t.createTexture(s),t.queue.copyExternalImageToTexture({source:n},{texture:this.texture},s.size)}}const R=`struct TransformData{
    model: mat4x4<f32>,
    view: mat4x4<f32>,
    projection: mat4x4<f32>,
};

@binding(0) @group(0) var<uniform> transformUBO: TransformData;
@binding(1) @group(0) var myTexture: texture_2d<f32>;
@binding(2) @group(0) var mySampler: sampler;

struct Fragment{
    @builtin(position) Position: vec4<f32>,
    @location(0) TexCoord: vec2<f32>,
};

@vertex
fn vs_main(@location(0) vertexPosition: vec3<f32>, @location(1) vertexTextureCoord: vec2<f32>) -> Fragment {

    var output : Fragment;
    output.Position = transformUBO.projection * transformUBO.view * transformUBO.model* vec4<f32>(vertexPosition, 1.0);
    output.TexCoord = vertexTextureCoord;
    return output;
}

@fragment
fn fs_main(@location(0) TexCoord: vec2<f32>) -> @location(0) vec4<f32>{
    return textureSample(myTexture, mySampler, TexCoord);
}`;class z{constructor(t){f(this,"buffer");f(this,"bufferLayout");const n=new Float32Array([0,0,.5,.5,0,0,-.5,-.5,0,1,0,.5,-.5,1,1]),s=GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST,r={size:n.byteLength,usage:s,mappedAtCreation:!0};this.buffer=t.createBuffer(r),new Float32Array(this.buffer.getMappedRange()).set(n),this.buffer.unmap(),this.bufferLayout={arrayStride:5*4,attributes:[{shaderLocation:0,format:"float32x3",offset:0},{shaderLocation:1,format:"float32x2",offset:3*4}]}}}var C=1e-6,I=typeof Float32Array<"u"?Float32Array:Array;Math.hypot||(Math.hypot=function(){for(var e=0,t=arguments.length;t--;)e+=arguments[t]*arguments[t];return Math.sqrt(e)});function F(){var e=new I(16);return I!=Float32Array&&(e[1]=0,e[2]=0,e[3]=0,e[4]=0,e[6]=0,e[7]=0,e[8]=0,e[9]=0,e[11]=0,e[12]=0,e[13]=0,e[14]=0),e[0]=1,e[5]=1,e[10]=1,e[15]=1,e}function _(e){return e[0]=1,e[1]=0,e[2]=0,e[3]=0,e[4]=0,e[5]=1,e[6]=0,e[7]=0,e[8]=0,e[9]=0,e[10]=1,e[11]=0,e[12]=0,e[13]=0,e[14]=0,e[15]=1,e}function V(e,t,n,s){var r=s[0],i=s[1],a=s[2],d=Math.hypot(r,i,a),l,p,c,h,u,o,m,v,g,y,b,x,w,P,M,T,B,U,G,L,A,S,E,O;return d<C?null:(d=1/d,r*=d,i*=d,a*=d,l=Math.sin(n),p=Math.cos(n),c=1-p,h=t[0],u=t[1],o=t[2],m=t[3],v=t[4],g=t[5],y=t[6],b=t[7],x=t[8],w=t[9],P=t[10],M=t[11],T=r*r*c+p,B=i*r*c+a*l,U=a*r*c-i*l,G=r*i*c-a*l,L=i*i*c+p,A=a*i*c+r*l,S=r*a*c+i*l,E=i*a*c-r*l,O=a*a*c+p,e[0]=h*T+v*B+x*U,e[1]=u*T+g*B+w*U,e[2]=o*T+y*B+P*U,e[3]=m*T+b*B+M*U,e[4]=h*G+v*L+x*A,e[5]=u*G+g*L+w*A,e[6]=o*G+y*L+P*A,e[7]=m*G+b*L+M*A,e[8]=h*S+v*E+x*O,e[9]=u*S+g*E+w*O,e[10]=o*S+y*E+P*O,e[11]=m*S+b*E+M*O,t!==e&&(e[12]=t[12],e[13]=t[13],e[14]=t[14],e[15]=t[15]),e)}function Y(e,t,n,s,r){var i=1/Math.tan(t/2),a;return e[0]=i/n,e[1]=0,e[2]=0,e[3]=0,e[4]=0,e[5]=i,e[6]=0,e[7]=0,e[8]=0,e[9]=0,e[11]=-1,e[12]=0,e[13]=0,e[15]=0,r!=null&&r!==1/0?(a=1/(s-r),e[10]=(r+s)*a,e[14]=2*r*s*a):(e[10]=-1,e[14]=-2*s),e}var j=Y;function H(e,t,n,s){var r,i,a,d,l,p,c,h,u,o,m=t[0],v=t[1],g=t[2],y=s[0],b=s[1],x=s[2],w=n[0],P=n[1],M=n[2];return Math.abs(m-w)<C&&Math.abs(v-P)<C&&Math.abs(g-M)<C?_(e):(c=m-w,h=v-P,u=g-M,o=1/Math.hypot(c,h,u),c*=o,h*=o,u*=o,r=b*u-x*h,i=x*c-y*u,a=y*h-b*c,o=Math.hypot(r,i,a),o?(o=1/o,r*=o,i*=o,a*=o):(r=0,i=0,a=0),d=h*a-u*i,l=u*r-c*a,p=c*i-h*r,o=Math.hypot(d,l,p),o?(o=1/o,d*=o,l*=o,p*=o):(d=0,l=0,p=0),e[0]=r,e[1]=d,e[2]=c,e[3]=0,e[4]=i,e[5]=l,e[6]=h,e[7]=0,e[8]=a,e[9]=p,e[10]=u,e[11]=0,e[12]=-(r*m+i*v+a*g),e[13]=-(d*m+l*v+p*g),e[14]=-(c*m+h*v+u*g),e[15]=1,e)}class W{constructor(t){f(this,"canvas");f(this,"adaptor");f(this,"device");f(this,"context");f(this,"format");f(this,"uniformBuffer");f(this,"bindGroup");f(this,"pipeline");f(this,"triangleMesh");f(this,"material");f(this,"t");f(this,"render",()=>{this.t+=.1,this.t>2*Math.PI&&(this.t=0);const t=F();j(t,Math.PI/4,800/600,.1,10);const n=F();H(n,[-2,0,2],[0,0,0],[0,0,1]);const s=F();V(s,s,this.t,[0,0,1]),this.device.queue.writeBuffer(this.uniformBuffer,0,s),this.device.queue.writeBuffer(this.uniformBuffer,64,n),this.device.queue.writeBuffer(this.uniformBuffer,128,t);const r=this.device.createCommandEncoder(),i=this.context.getCurrentTexture().createView(),a=r.beginRenderPass({colorAttachments:[{view:i,clearValue:{r:.5,g:0,b:.25,a:1},loadOp:"clear",storeOp:"store"}]});a.setPipeline(this.pipeline),a.setBindGroup(0,this.bindGroup),a.setVertexBuffer(0,this.triangleMesh.buffer),a.draw(3,1,0,0),a.end(),this.device.queue.submit([r.finish()]),requestAnimationFrame(()=>this.render())});this.canvas=t,this.t=0}async init(){await this.setupDevice(),await this.createAssets(),await this.setupPipeline(),this.render()}async setupDevice(){var n,s;this.adaptor=await((n=navigator.gpu)==null?void 0:n.requestAdapter()),this.device=await((s=this.adaptor)==null?void 0:s.requestDevice());const t=document.querySelector("#compcheck");if(this.adaptor)t.innerHTML="WebGPU is supported";else{t.innerHTML="WebGPU is not supported",console.error("WebGPU is not supported on this device!");return}this.context=this.canvas.getContext("webgpu"),this.format="bgra8unorm",this.context.configure({device:this.device,format:this.format,alphaMode:"opaque"})}async setupPipeline(){this.uniformBuffer=this.device.createBuffer({size:64*3,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});const t=this.device.createBindGroupLayout({entries:[{binding:0,visibility:GPUShaderStage.VERTEX,buffer:{}},{binding:1,visibility:GPUShaderStage.FRAGMENT,texture:{}},{binding:2,visibility:GPUShaderStage.FRAGMENT,sampler:{}}]});this.bindGroup=this.device.createBindGroup({layout:t,entries:[{binding:0,resource:{buffer:this.uniformBuffer}},{binding:1,resource:this.material.view},{binding:2,resource:this.material.sampler}]});const n=this.device.createPipelineLayout({bindGroupLayouts:[t]});this.pipeline=this.device.createRenderPipeline({layout:n,vertex:{module:this.device.createShaderModule({code:R}),entryPoint:"vs_main",buffers:[this.triangleMesh.bufferLayout]},fragment:{module:this.device.createShaderModule({code:R}),entryPoint:"fs_main",targets:[{format:this.format}]},primitive:{topology:"triangle-list"}})}async createAssets(){this.triangleMesh=new z(this.device),this.material=new N,await this.material.init(this.device,"img/img.jpeg")}}const X=document.getElementById("gfx-main"),K=new W(X);K.init();
