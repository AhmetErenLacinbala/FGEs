import './style.css'
import App from './control/app';



const canvas: HTMLCanvasElement | null = document.getElementById('gfx-main') as HTMLCanvasElement;

(async () => {
    const app = new App(canvas);
    await app.init();
    app.run();
})();
