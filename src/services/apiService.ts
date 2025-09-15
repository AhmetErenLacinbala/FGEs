
class ApiConfig {
    private static instance: ApiConfig;
    private baseUrl: string;

    private constructor() {

        this.baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
        console.log('🌐 API Service initialized with base URL:', this.baseUrl);
    }

    public static getInstance(): ApiConfig {
        if (!ApiConfig.instance) {
            ApiConfig.instance = new ApiConfig();
        }
        return ApiConfig.instance;
    }

    public getBaseUrl(): string {
        return this.baseUrl;
    }

    public getEndpoint(path: string): string {
        return `${this.baseUrl}${path.startsWith('/') ? path : '/' + path}`;
    }
}


export class ApiService {
    private config: ApiConfig;

    constructor() {
        this.config = ApiConfig.getInstance();
    }


    async testConnection(): Promise<boolean> {
        try {
            console.log('🔌 Testing backend connection...');
            const response = await fetch(this.config.getEndpoint('/terrain/test-r2'), {
                method: 'GET'
            });
            console.log('✅ Backend health check:', response.status);
            return response.ok;
        } catch (error) {
            console.error('❌ Backend connection test failed:', error);
            return false;
        }
    }


    async generateTile(request: {
        centerLat: number;
        centerLng: number;
        scale?: number;
    }): Promise<Response> {
        console.log('🚀 Generating terrain tile...', request);

        return fetch(this.config.getEndpoint('/terrain/generate-tile'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request)
        });
    }


    async downloadFile(downloadUrl: string): Promise<Response> {
        console.log('📥 Downloading file:', downloadUrl);

        const url = downloadUrl.startsWith('http')
            ? downloadUrl
            : this.config.getEndpoint(downloadUrl);

        return fetch(url);
    }


    async downloadSolarData(ghiTileUrl: string): Promise<Response> {
        console.log('☀️ Downloading solar data:', ghiTileUrl);

        const url = ghiTileUrl.startsWith('http')
            ? ghiTileUrl
            : this.config.getEndpoint(ghiTileUrl);

        return fetch(url);
    }


    getFileDownloadUrl(filename: string): string {
        return this.config.getEndpoint(`/terrain/files/${filename}`);
    }

    getGHIDataUrl(ghiPath: string): string {
        return this.config.getEndpoint(ghiPath);
    }

    getBaseUrl(): string {
        return this.config.getBaseUrl();
    }


    async makeRequest(endpoint: string, options: RequestInit = {}): Promise<Response> {
        const url = this.config.getEndpoint(endpoint);
        console.log(`🌐 Making request to: ${url}`);

        return fetch(url, {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        });
    }


    getEnvironmentInfo(): {
        baseUrl: string;
        environment: string;
        devMode: boolean;
    } {
        return {
            baseUrl: this.config.getBaseUrl(),
            environment: import.meta.env.VITE_ENV || 'development',
            devMode: import.meta.env.VITE_DEV_MODE === 'true'
        };
    }
}


export const apiService = new ApiService();


export interface TileRequest {
    centerLat: number;
    centerLng: number;
    scale?: number;
}

export interface ApiResponse<T = any> {
    success: boolean;
    data?: T;
    error?: string;
}


console.log('🌐 API Service Environment:', apiService.getEnvironmentInfo());
