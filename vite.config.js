import { defineConfig, loadEnv } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ command, mode }) => {
    // Load env file based on `mode` in the current working directory.
    // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
    const env = loadEnv(mode, process.cwd(), '');
    
    console.log('🔧 Vite Config - Mode:', mode);
    console.log('🔧 Vite Config - API Base URL:', env.VITE_API_BASE_URL);
    
    return {
        plugins: [
            tailwindcss(),
        ],
        server: {
            port: 3001,
        },
        base: "./",
        // Make sure env variables are available in the app
        define: {
            __APP_ENV__: JSON.stringify(env.VITE_ENV),
        },
    };
});
