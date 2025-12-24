/**
 * 📊 Status Manager
 * Manages the UI status display for terrain streaming system
 */

export interface StatusData {
    backendStatus: 'online' | 'offline' | 'checking';
    streamingActive: boolean;
    tilesLoaded: number;
    workersActive: number;
    totalWorkers: number;
    memoryUsage: number; // MB
    playerCoords: { lat: number; lng: number };
    queueSize: number;
}

export class StatusManager {
    private statusElements: { [key: string]: HTMLElement } = {};
    private logContent: HTMLElement;
    private maxLogEntries = 50;

    constructor() {
        this.initializeElements();
        this.addInitialLog();
    }

    /**
     * Initialize DOM element references
     */
    private initializeElements(): void {
        this.statusElements = {
            backendStatus: document.getElementById('backend-status')!,
            streamingActive: document.getElementById('streaming-active')!,
            tilesCount: document.getElementById('tiles-count')!,
            workersActive: document.getElementById('workers-active')!,
            memoryUsage: document.getElementById('memory-usage')!,
            playerCoords: document.getElementById('player-coords')!,
            queueSize: document.getElementById('queue-size')!
        };

        this.logContent = document.getElementById('log-content')!;

        // Verify all elements exist
        for (const [key, element] of Object.entries(this.statusElements)) {
            if (!element) {
                console.warn(`Status element not found: ${key}`);
            }
        }

        if (!this.logContent) {
            console.warn('Log content element not found');
        }
    }

    /**
     * Update all status information
     */
    updateStatus(data: StatusData): void {
        this.updateBackendStatus(data.backendStatus);
        this.updateStreamingStatus(data.streamingActive);
        this.updateTilesCount(data.tilesLoaded);
        this.updateWorkersStatus(data.workersActive, data.totalWorkers);
        this.updateMemoryUsage(data.memoryUsage);
        this.updatePlayerCoords(data.playerCoords);
        this.updateQueueSize(data.queueSize);
    }

    /**
     * Update backend connection status
     */
    updateBackendStatus(status: 'online' | 'offline' | 'checking'): void {
        const element = this.statusElements.backendStatus;
        if (!element) return;

        element.className = 'status-value';

        switch (status) {
            case 'online':
                element.textContent = '🟢 Online';
                element.classList.add('online');
                break;
            case 'offline':
                element.textContent = '🔴 Offline';
                element.classList.add('offline');
                break;
            case 'checking':
                element.textContent = '🟡 Checking...';
                element.classList.add('warning');
                break;
        }
    }

    /**
     * Update streaming status
     */
    updateStreamingStatus(isActive: boolean): void {
        const element = this.statusElements.streamingActive;
        if (!element) return;

        element.className = 'status-value';

        if (isActive) {
            element.textContent = '🟢 Active';
            element.classList.add('active');
        } else {
            element.textContent = '🔴 Disabled';
            element.classList.add('offline');
        }
    }

    /**
     * Update tiles count
     */
    updateTilesCount(count: number): void {
        const element = this.statusElements.tilesCount;
        if (!element) return;

        element.textContent = count.toString();
        element.className = 'status-value';

        if (count > 0) {
            element.classList.add('active');
        }
    }

    /**
     * Update workers status
     */
    updateWorkersStatus(active: number, total: number): void {
        const element = this.statusElements.workersActive;
        if (!element) return;

        element.textContent = `${active}/${total}`;
        element.className = 'status-value';

        if (active > 0) {
            element.classList.add('active');
        } else if (total > 0) {
            element.classList.add('online');
        }
    }

    /**
     * Update memory usage
     */
    updateMemoryUsage(usageMB: number): void {
        const element = this.statusElements.memoryUsage;
        if (!element) return;

        element.textContent = `${usageMB.toFixed(1)} MB`;
        element.className = 'status-value';

        if (usageMB > 50) {
            element.classList.add('warning');
        } else if (usageMB > 0) {
            element.classList.add('active');
        }
    }

    /**
     * Update player coordinates
     */
    updatePlayerCoords(coords: { lat: number; lng: number }): void {
        const element = this.statusElements.playerCoords;
        if (!element) return;

        element.textContent = `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`;
        element.className = 'status-value';
    }

    /**
     * Update queue size
     */
    updateQueueSize(size: number): void {
        const element = this.statusElements.queueSize;
        if (!element) return;

        element.textContent = size.toString();
        element.className = 'status-value';

        if (size > 0) {
            element.classList.add('warning');
        }
    }

    /**
     * Add log entry
     */
    addLog(message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info'): void {
        if (!this.logContent) return;

        const timestamp = new Date().toLocaleTimeString();
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry ${type}`;

        logEntry.innerHTML = `<span class="log-timestamp">[${timestamp}]</span> ${message}`;

        // Add to top of log
        this.logContent.insertBefore(logEntry, this.logContent.firstChild);

        // Limit number of log entries
        while (this.logContent.children.length > this.maxLogEntries) {
            this.logContent.removeChild(this.logContent.lastChild!);
        }

        // Scroll to top to show latest entry
        this.logContent.scrollTop = 0;
    }

    /**
     * Add initial welcome log
     */
    private addInitialLog(): void {
        this.addLog('🌍 Terrain Streaming System Initialized', 'info');
        this.addLog('📡 Checking backend connection...', 'info');
    }

    /**
     * Clear all logs
     */
    clearLogs(): void {
        if (this.logContent) {
            this.logContent.innerHTML = '';
        }
    }

    /**
     * Set status panel visibility
     */
    setVisible(visible: boolean): void {
        const panel = document.getElementById('terrain-status');
        if (panel) {
            panel.style.display = visible ? 'block' : 'none';
        }
    }

    /**
     * Highlight specific status for attention
     */
    highlightStatus(elementId: string, duration: number = 2000): void {
        const element = this.statusElements[elementId];
        if (!element) return;

        element.style.backgroundColor = 'rgba(76, 175, 80, 0.3)';
        element.style.transition = 'background-color 0.3s ease';

        setTimeout(() => {
            element.style.backgroundColor = '';
        }, duration);
    }
}
