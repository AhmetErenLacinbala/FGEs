import App from './app.new';
import { solarTerrainService } from '../services/solarTerrainService';
import { MeshFactory, RenderableObject, Transform } from 'fges';
import SolarTerrainMaterialFactory from '../rendering/SolarTerrainMaterialFactory';
import { SOLAR_TERRAIN_RENDER_TYPE } from '../rendering/SolarTerrainRenderer';

interface TileState {
    level: number;
    x: number;
    y: number;
    status: 'pending' | 'fetching' | 'done' | 'error';
    sceneObjectId?: number;
}

export default class EarthTileManager {
    private readonly maxConcurrentTiles = 4;
    private tileStates: TileState[] = [];
    private isFetching = false;

    constructor(private readonly app: App) {}

    /**
     * Fetches a complete LOD in a bounded pool. Four concurrent frontend
     * requests match the backend's default GEE pool without flooding it.
     */
    async startFetching(level: number = 0): Promise<void> {
        if (this.isFetching) return;
        this.isFetching = true;

        const columns = Math.pow(2, level + 1);
        const rows = Math.pow(2, level);
        this.tileStates = [];

        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < columns; x++) {
                this.tileStates.push({ level, x, y, status: 'pending' });
            }
        }

        console.log(
            '🌍 LOD' + level + ' fetch: ' + this.tileStates.length +
            ' tiles (' + columns + 'x' + rows + '), concurrency=' +
            this.maxConcurrentTiles
        );

        let nextIndex = 0;
        const workerCount = Math.min(
            this.maxConcurrentTiles,
            this.tileStates.length
        );

        try {
            await Promise.all(
                Array.from({ length: workerCount }, async () => {
                    while (nextIndex < this.tileStates.length) {
                        const index = nextIndex++;
                        await this.fetchAndRenderTile(this.tileStates[index], index);
                    }
                })
            );
        } finally {
            this.isFetching = false;
        }

        const done = this.tileStates.filter(tile => tile.status === 'done').length;
        const errors = this.tileStates.filter(tile => tile.status === 'error').length;
        console.log(
            '🌍 LOD' + level + ' complete: ' + done +
            ' done, ' + errors + ' errors'
        );

        if (done > 0) {
            await this.app.spawnWorldMarkers();
        }
    }

    getStatus(): { total: number; done: number; errors: number; fetching: boolean } {
        return {
            total: this.tileStates.length,
            done: this.tileStates.filter(tile => tile.status === 'done').length,
            errors: this.tileStates.filter(tile => tile.status === 'error').length,
            fetching: this.isFetching
        };
    }

    private async fetchAndRenderTile(tile: TileState, index: number): Promise<void> {
        tile.status = 'fetching';
        console.log(
            '🌍 Fetching LOD' + tile.level + ' tile ' +
            (index + 1) + '/' + this.tileStates.length +
            ': (' + tile.x + ', ' + tile.y + ')'
        );

        try {
            const tileData = await solarTerrainService.fetchLodTile(
                tile.level,
                tile.x,
                tile.y
            );

            // Yield once before the synchronous mesh build so completed network
            // requests do not monopolize a single event-loop turn.
            await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

            const device = this.app.renderer.getDevice();
            const terrainMesh = MeshFactory.fromHeightmapGeodetic(
                device,
                tileData.heightmap.elevationData,
                tileData.heightmap.width,
                tileData.heightmap.height,
                tileData.bounds
            );
            const terrainMaterial = SolarTerrainMaterialFactory.createTerrainMaterial(
                device,
                {
                    data: tileData.solarData.ghiData,
                    width: tileData.solarData.width,
                    height: tileData.solarData.height,
                    minGHI: tileData.solarData.minGHI,
                    maxGHI: tileData.solarData.maxGHI
                },
                null,
                this.app.renderer.getTerrainMaterialGroupLayout(),
                this.app.renderer.getBlendSettingsBuffer(),
                this.app.renderer.getSelectionQuadBuffer()
            );
            const terrain = new RenderableObject({
                mesh: terrainMesh,
                material: terrainMaterial.bindGroup,
                renderType: SOLAR_TERRAIN_RENDER_TYPE,
                transform: new Transform()
            });

            this.app.scene.add(terrain);
            tile.sceneObjectId = terrain.id;
            tile.status = 'done';
        } catch (error) {
            tile.status = 'error';
            console.error(
                '❌ LOD' + tile.level + ' tile (' + tile.x + ',' + tile.y + ') failed:',
                error
            );
        }
    }
}
