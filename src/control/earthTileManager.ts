import App from './app.new';
import { solarTerrainService } from '../services/solarTerrainService';
import { MeshFactory, MaterialFactory, RenderableObject, Transform, RenderType } from '../core';

interface TileState {
    level: number;
    x: number;
    y: number;
    status: 'pending' | 'fetching' | 'done' | 'error';
    sceneObjectId?: number;
}

export default class EarthTileManager {
    private app: App;
    private tileStates: TileState[] = [];
    private isFetching = false;

    constructor(app: App) {
        this.app = app;
    }

    /**
     * Build the tile list for a given LOD level and start sequential fetching.
     * LOD0: 2 columns x 1 row = 2 tiles
     * LOD1: 4 columns x 2 rows = 8 tiles
     * General: columns = 2^(level+1), rows = 2^level
     */
    async startFetching(level: number = 0): Promise<void> {
        if (this.isFetching) return;
        this.isFetching = true;

        const cols = Math.pow(2, level + 1);
        const rows = Math.pow(2, level);

        this.tileStates = [];
        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                this.tileStates.push({ level, x, y, status: 'pending' });
            }
        }

        console.log(`🌍 LOD${level} batch fetch: ${this.tileStates.length} tiles (${cols}x${rows})`);

        for (let i = 0; i < this.tileStates.length; i++) {
            const tile = this.tileStates[i];
            tile.status = 'fetching';
            console.log(`🌍 Fetching LOD${tile.level} tile ${i + 1}/${this.tileStates.length}: (${tile.x}, ${tile.y})`);

            try {
                const tileData = await solarTerrainService.fetchLodTile(tile.level, tile.x, tile.y);

                const device = this.app.renderer.getDevice();
                const terrainLayout = this.app.renderer.getTerrainMaterialGroupLayout();
                const blendBuffer = this.app.renderer.getBlendSettingsBuffer();

                const terrainMesh = MeshFactory.fromHeightmapGeodetic(
                    device,
                    tileData.heightmap.elevationData,
                    tileData.heightmap.width,
                    tileData.heightmap.height,
                    tileData.bounds
                );

                const terrainMaterial = MaterialFactory.createTerrainMaterial(
                    device,
                    {
                        data: tileData.solarData.ghiData,
                        width: tileData.solarData.width,
                        height: tileData.solarData.height,
                        minGHI: tileData.solarData.minGHI,
                        maxGHI: tileData.solarData.maxGHI
                    },
                    { data: null },
                    terrainLayout,
                    blendBuffer,
                    this.app.renderer.getSelectionQuadBuffer()
                );

                const terrain = new RenderableObject({
                    mesh: terrainMesh,
                    material: terrainMaterial.bindGroup,
                    renderType: RenderType.Terrain,
                    transform: new Transform()
                });

                this.app.scene.add(terrain);
                tile.sceneObjectId = terrain.id;
                tile.status = 'done';

                const done = this.tileStates.filter(t => t.status === 'done').length;
                console.log(`✅ LOD${tile.level} tile (${tile.x},${tile.y}) done (${done}/${this.tileStates.length})`);

            } catch (error) {
                tile.status = 'error';
                console.error(`❌ LOD${tile.level} tile (${tile.x},${tile.y}) failed:`, error);
            }
        }

        this.isFetching = false;
        const done = this.tileStates.filter(t => t.status === 'done').length;
        const errors = this.tileStates.filter(t => t.status === 'error').length;
        console.log(`🌍 LOD${level} complete: ${done} done, ${errors} errors`);
    }

    getStatus(): { total: number; done: number; errors: number; fetching: boolean } {
        return {
            total: this.tileStates.length,
            done: this.tileStates.filter(t => t.status === 'done').length,
            errors: this.tileStates.filter(t => t.status === 'error').length,
            fetching: this.isFetching
        };
    }
}
