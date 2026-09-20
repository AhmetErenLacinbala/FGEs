# Solaris Frontend

Solaris is a Vite and TypeScript application for geospatial solar-site
analysis. It loads elevation and GHI data from `solaris-backend`, renders the
terrain with WebGPU, supports Google Maps and TKGM parcel lookup, and estimates
photovoltaic output for a four-point selection.

The reusable WebGPU engine is a separate nested repository at `lib/fges`.
Solaris consumes it through the `fges` package. GHI heatmaps, Google satellite
imagery, slope suitability, and panel placement remain in this application.

## Setup

```bash
npm install
cp .env.example .env
npm run dev
```

The frontend runs at `http://localhost:3001`. Set these values in `.env`:

```dotenv
VITE_API_BASE_URL=http://localhost:3000
VITE_GOOGLE_MAPS_API_KEY=your_google_maps_api_key
```

## Repository layout

```text
src/control/       UI and scene orchestration
src/services/      Solaris backend and TKGM clients
src/rendering/     Solaris terrain renderer and material extension
src/view/          Solaris terrain, picking, and selection shaders
lib/fges/          Separate general-purpose FGEs repository
```

The Vite alias for `fges` must continue to point to
`lib/fges/src/index.ts` while the engine ships WGSL as `?raw` imports.

## Verification

```bash
npm run build
npm run typecheck --prefix lib/fges
```
