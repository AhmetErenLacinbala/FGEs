# FGEs

FGEs is a small, extensible WebGPU rendering engine for browser applications.
It provides scene and camera management, mesh and material factories, GPU
instancing, world-position picking, and built-in textured-mesh and billboard
pipelines.

Application-specific rendering is added through `Renderer.registerRenderPipeline`.
Custom pipelines share FGEs frame data at bind group 0 and define their own
material resources at bind group 1.

## Local development

```bash
npm install
npm run typecheck
npm run build
```

The package build emits an ES module with inlined WGSL plus TypeScript
declarations in `dist/`. Solaris consumes this repository from
`file:./lib/fges` and aliases the package to TypeScript source during local
development.
