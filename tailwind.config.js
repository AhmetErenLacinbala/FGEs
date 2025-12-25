/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                'app-bg': '#0a0a0f',
                'sidebar': '#12121a',
                'panel': '#1a1a24',
                'border': '#2a2a3a',
                'accent': '#4ecdc4',
                'accent-hover': '#44a8a0',
            },
            fontFamily: {
                mono: ['"JetBrains Mono"', 'monospace'],
            },
        },
    },
    plugins: [],
}

