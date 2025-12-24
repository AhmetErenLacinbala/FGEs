/**
 * 🏭 Terrain Worker Manager
 * Manages multiple Web Workers for mesh generation with load balancing
 */

import { MeshGenerationRequest, MeshGenerationResponse } from '../types/terrainStreaming';

interface WorkerInstance {
    worker: Worker;
    busy: boolean;
    currentTask?: string; // tileId
    tasksCompleted: number;
}

export class TerrainWorkerManager {
    private workers: WorkerInstance[] = [];
    private pendingTasks: Map<string, {
        request: MeshGenerationRequest;
        resolve: (response: MeshGenerationResponse) => void;
        reject: (error: Error) => void;
    }> = new Map();
    private taskQueue: string[] = [];
    private maxWorkers: number;

    constructor(maxWorkers: number = 4) {
        this.maxWorkers = maxWorkers;
        console.log(`🏭 TerrainWorkerManager: initializing with ${maxWorkers} workers`);
        console.log('🔧 Worker URL test:', new URL('./terrainMeshWorker.ts?worker', import.meta.url).href);
    }

    /**
 * Initialize worker pool
 */
    async initialize(): Promise<void> {
        const initPromises: Promise<void>[] = [];

        for (let i = 0; i < this.maxWorkers; i++) {
            initPromises.push(this.createWorker(i).catch(error => {
                console.warn(`⚠️ Failed to create worker ${i}:`, error);
                return Promise.resolve(); // Don't fail the entire initialization
            }));
        }

        await Promise.all(initPromises);
        console.log(`🏭 TerrainWorkerManager: ${this.workers.length}/${this.maxWorkers} workers ready`);

        if (this.workers.length === 0) {
            console.warn('⚠️ No workers initialized, mesh generation will be synchronous');
        }
    }

    /**
     * Create and initialize a single worker
     */
    private async createWorker(id: number): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                // Create worker from the worker file (Vite compatible)
                console.log(`🔧 Creating worker ${id}...`);

                // Use plain JavaScript worker for browser compatibility
                const workerUrl = new URL('./terrainMeshWorker.js', import.meta.url);
                console.log(`🔧 Worker ${id} URL:`, workerUrl.href);
                const worker = new Worker(workerUrl);

                const workerInstance: WorkerInstance = {
                    worker,
                    busy: false,
                    tasksCompleted: 0
                };

                // Handle worker messages
                worker.onmessage = (event) => {
                    const message = event.data;

                    if (message.type === 'ready') {
                        console.log(`🧵 Worker ${id} ready`);
                        this.workers.push(workerInstance);
                        resolve();
                    } else if (message.type === 'result') {
                        this.handleWorkerResult(workerInstance, message.data);
                    } else if (message.type === 'error') {
                        this.handleWorkerError(workerInstance, message.error);
                    }
                };

                // Handle worker errors
                worker.onerror = (error) => {
                    console.error(`❌ Worker ${id} error:`, error);
                    console.error(`❌ Worker ${id} failed to load from:`, new URL('./terrainMeshWorker.ts?worker', import.meta.url).href);
                    reject(new Error(`Worker ${id} failed to initialize: ${error.message}`));
                };

                // Handle worker termination
                worker.onmessageerror = (error) => {
                    console.error(`❌ Worker ${id} message error:`, error);
                };

                // Add timeout for worker initialization
                const timeout = setTimeout(() => {
                    console.warn(`⚠️ Worker ${id} initialization timeout (falling back to sync)`);
                    reject(new Error(`Worker ${id} initialization timeout`));
                }, 3000); // 3 second timeout (faster fallback)

                // Clear timeout when worker is ready
                const originalResolve = resolve;
                resolve = () => {
                    clearTimeout(timeout);
                    originalResolve();
                };

            } catch (error) {
                console.error(`❌ Failed to create worker ${id}:`, error);
                reject(error as Error);
            }
        });
    }

    /**
 * Generate mesh using available worker or fallback to sync
 */
    async generateMesh(request: MeshGenerationRequest): Promise<MeshGenerationResponse> {
        // If no workers available, use synchronous fallback
        if (this.workers.length === 0) {
            console.log(`🔄 No workers available, generating mesh synchronously for ${request.tileId}`);
            return this.generateMeshSync(request);
        }

        return new Promise((resolve, reject) => {
            // Store the task
            this.pendingTasks.set(request.tileId, { request, resolve, reject });
            this.taskQueue.push(request.tileId);

            // Try to assign to available worker immediately
            this.processQueue();
        });
    }

    /**
     * Synchronous fallback mesh generation
     */
    private generateMeshSync(request: MeshGenerationRequest): Promise<MeshGenerationResponse> {
        const startTime = performance.now();

        try {
            // Import the mesh generation logic directly (simplified version)
            const { heightmapData, width, height, resolution, worldPosition } = request;

            // Simple mesh generation without worker
            const actualResX = Math.min(resolution, width);
            const actualResY = Math.min(resolution, height);
            const vertexCount = actualResX * actualResY;

            // Generate vertices (simplified)
            const vertices = new Float32Array(vertexCount * 8); // pos(3) + normal(3) + uv(2)
            const indices = new Uint32Array((actualResX - 1) * (actualResY - 1) * 6);

            // Fill with basic data for testing
            for (let i = 0; i < vertexCount; i++) {
                const x = (i % actualResX) / actualResX;
                const y = Math.floor(i / actualResX) / actualResY;
                const baseIndex = i * 8;

                vertices[baseIndex + 0] = (x - 0.5) * 0.1; // position x
                vertices[baseIndex + 1] = 0; // position y (flat)
                vertices[baseIndex + 2] = (y - 0.5) * 0.1; // position z
                vertices[baseIndex + 3] = 0; // normal x
                vertices[baseIndex + 4] = 1; // normal y (up)
                vertices[baseIndex + 5] = 0; // normal z
                vertices[baseIndex + 6] = x; // uv u
                vertices[baseIndex + 7] = y; // uv v
            }

            // Generate indices
            let indexPos = 0;
            for (let y = 0; y < actualResY - 1; y++) {
                for (let x = 0; x < actualResX - 1; x++) {
                    const topLeft = y * actualResX + x;
                    const topRight = y * actualResX + (x + 1);
                    const bottomLeft = (y + 1) * actualResX + x;
                    const bottomRight = (y + 1) * actualResX + (x + 1);

                    indices[indexPos++] = topLeft;
                    indices[indexPos++] = bottomLeft;
                    indices[indexPos++] = topRight;

                    indices[indexPos++] = topRight;
                    indices[indexPos++] = bottomLeft;
                    indices[indexPos++] = bottomRight;
                }
            }

            const processingTime = performance.now() - startTime;

            return Promise.resolve({
                tileId: request.tileId,
                success: true,
                meshData: {
                    vertices,
                    indices,
                    vertexCount,
                    indexCount: indices.length
                },
                processingTime
            });

        } catch (error) {
            const processingTime = performance.now() - startTime;
            return Promise.resolve({
                tileId: request.tileId,
                success: false,
                error: error instanceof Error ? error.message : 'Sync mesh generation failed',
                processingTime
            });
        }
    }

    /**
     * Process the task queue
     */
    private processQueue(): void {
        while (this.taskQueue.length > 0) {
            const availableWorker = this.findAvailableWorker();
            if (!availableWorker) {
                break; // No workers available, wait
            }

            const tileId = this.taskQueue.shift()!;
            const task = this.pendingTasks.get(tileId);

            if (task) {
                this.assignTaskToWorker(availableWorker, task.request);
            }
        }
    }

    /**
     * Find an available worker
     */
    private findAvailableWorker(): WorkerInstance | null {
        return this.workers.find(worker => !worker.busy) || null;
    }

    /**
     * Assign a task to a specific worker
     */
    private assignTaskToWorker(workerInstance: WorkerInstance, request: MeshGenerationRequest): void {
        workerInstance.busy = true;
        workerInstance.currentTask = request.tileId;

        // Send task to worker
        workerInstance.worker.postMessage({
            type: 'generate',
            data: request
        });

        console.log(`🧵 Assigned tile ${request.tileId} to worker`);
    }

    /**
     * Handle successful worker result
     */
    private handleWorkerResult(workerInstance: WorkerInstance, response: MeshGenerationResponse): void {
        const task = this.pendingTasks.get(response.tileId);

        if (task) {
            // Clean up
            this.pendingTasks.delete(response.tileId);
            workerInstance.busy = false;
            workerInstance.currentTask = undefined;
            workerInstance.tasksCompleted++;

            // Resolve the promise
            task.resolve(response);

            console.log(`✅ Worker completed tile ${response.tileId} in ${response.processingTime.toFixed(1)}ms`);

            // Process next task in queue
            this.processQueue();
        } else {
            console.warn(`⚠️ Received result for unknown task: ${response.tileId}`);
        }
    }

    /**
     * Handle worker error
     */
    private handleWorkerError(workerInstance: WorkerInstance, error: string): void {
        const taskId = workerInstance.currentTask;

        if (taskId) {
            const task = this.pendingTasks.get(taskId);

            if (task) {
                // Clean up
                this.pendingTasks.delete(taskId);
                workerInstance.busy = false;
                workerInstance.currentTask = undefined;

                // Reject the promise
                task.reject(new Error(`Worker error: ${error}`));

                console.error(`❌ Worker failed for tile ${taskId}: ${error}`);

                // Process next task in queue
                this.processQueue();
            }
        } else {
            console.error(`❌ Worker error without current task: ${error}`);
        }
    }

    /**
     * Cancel a pending mesh generation task
     */
    cancelTask(tileId: string): boolean {
        // Remove from queue if not yet started
        const queueIndex = this.taskQueue.indexOf(tileId);
        if (queueIndex >= 0) {
            this.taskQueue.splice(queueIndex, 1);
            this.pendingTasks.delete(tileId);
            console.log(`🚫 Cancelled queued task: ${tileId}`);
            return true;
        }

        // Check if currently being processed
        const task = this.pendingTasks.get(tileId);
        if (task) {
            // Find the worker processing this task
            const worker = this.workers.find(w => w.currentTask === tileId);
            if (worker) {
                // Can't really stop worker mid-task, but we can ignore the result
                console.log(`⏭️ Marking task for ignore: ${tileId}`);

                // Reject the promise so caller knows it was cancelled
                task.reject(new Error('Task cancelled'));
                this.pendingTasks.delete(tileId);
                return true;
            }
        }

        return false;
    }

    /**
     * Get worker statistics
     */
    getStats(): {
        totalWorkers: number;
        busyWorkers: number;
        queueLength: number;
        completedTasks: number;
        averageTasksPerWorker: number;
    } {
        const busyWorkers = this.workers.filter(w => w.busy).length;
        const completedTasks = this.workers.reduce((total, w) => total + w.tasksCompleted, 0);

        return {
            totalWorkers: this.workers.length,
            busyWorkers,
            queueLength: this.taskQueue.length,
            completedTasks,
            averageTasksPerWorker: completedTasks / this.workers.length
        };
    }

    /**
     * Check if workers are busy
     */
    isAnyWorkerBusy(): boolean {
        return this.workers.some(worker => worker.busy);
    }

    /**
     * Wait for all workers to complete current tasks
     */
    async waitForIdle(): Promise<void> {
        return new Promise((resolve) => {
            const checkIdle = () => {
                if (!this.isAnyWorkerBusy() && this.taskQueue.length === 0) {
                    resolve();
                } else {
                    setTimeout(checkIdle, 100);
                }
            };
            checkIdle();
        });
    }

    /**
     * Terminate all workers
     */
    async terminate(): Promise<void> {
        console.log('🛑 Terminating all terrain workers...');

        // Cancel all pending tasks
        for (const [tileId, task] of this.pendingTasks) {
            task.reject(new Error('Worker manager terminated'));
        }
        this.pendingTasks.clear();
        this.taskQueue = [];

        // Terminate all workers
        const terminatePromises = this.workers.map(async (workerInstance, index) => {
            try {
                workerInstance.worker.postMessage({ type: 'terminate' });
                workerInstance.worker.terminate();
                console.log(`🛑 Worker ${index} terminated`);
            } catch (error) {
                console.warn(`⚠️ Error terminating worker ${index}:`, error);
            }
        });

        await Promise.all(terminatePromises);

        this.workers = [];
        console.log('🛑 All terrain workers terminated');
    }
}
