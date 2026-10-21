# IMPRESSION — Beyond the Horizon

An immersive, cinematic 3D scene inspired by Claude Monet's *Impression, soleil levant* (1872). Built with TypeScript, Three.js, GLSL shaders and Vite.

## Run locally

Requires Node.js 20.19+ or 22.12+.

```bash
cd monet-sunrise-3d
npm install
npm run dev
```

## Controls

- Click **ENTER THE CANVAS** to move into the scene.
- Move the pointer to influence the camera.
- Scroll to progress through cinematic stages.
- Switch between **ORBIT** and **DRIFT** camera movement.
- Click **RESET** or press Escape to return to the opening view.

## Technical notes

- Procedural dawn sky and animated ocean shaders.
- Glowing sun, corona, rays, harbour silhouettes, boats and atmospheric particles.
- No external 3D assets required.
- Original procedural interpretation; the original painting is not embedded.

## Production build

```bash
npm run build
npm run preview
```
