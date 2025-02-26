import './style.css'
import Renderer from './renderer';



const canvas: HTMLCanvasElement | null = document.getElementById('gfx-main') as HTMLCanvasElement;

const renderer = new Renderer(canvas!);
renderer.init();
