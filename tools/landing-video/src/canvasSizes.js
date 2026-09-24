// Tamanho de canvas por formato — usado por Root.jsx (Composition width/
// height) e por src/deviceGeometry.js (geometria do device + verificacao de
// bounding box em scripts/check-device-bounds.mjs). Arquivo .js puro (sem
// JSX) de proposito: scripts/check-device-bounds.mjs roda em Node puro e nao
// consegue importar um .jsx.
export const FORMATS = {
  mobile: { width: 1080, height: 1920 },
  desktop: { width: 1920, height: 1080 },
};
