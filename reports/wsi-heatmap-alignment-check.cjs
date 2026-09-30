const { chromium } = require('../frontend/node_modules/playwright');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<style>img{display:block;max-width:100%;height:auto}</style><div id="viewer" style="width:800px;height:500px"></div>');
    await page.addScriptTag({ path: path.resolve(__dirname, '../frontend/node_modules/openseadragon/build/openseadragon/openseadragon.js') });
    const source = fs.readFileSync(path.resolve(__dirname, '../frontend/src/app/respiratory/cases/[caseId]/case-wsi-evidence.tsx'), 'utf8');
    const styles = [...source.matchAll(/overlay\.style\.(\w+) = "([^"]*)";/g)].map((match) => [match[1], match[2]]);
    const results = await page.evaluate(async (styles) => {
      const canvas = document.createElement('canvas');
      canvas.width = 2048; canvas.height = 1024;
      const imageUrl = canvas.toDataURL();
      const viewer = OpenSeadragon({ id: 'viewer', showNavigationControl: false, animationTime: 0 });
      await new Promise((resolve) => {
        viewer.addOnceHandler('open', resolve);
        viewer.open({ type: 'image', url: imageUrl });
      });
      const overlay = document.createElement('img');
      overlay.src = imageUrl;
      for (const [key, value] of styles) overlay.style[key] = value;
      await overlay.decode();
      viewer.addOverlay({ element: overlay, location: viewer.viewport.imageToViewportRectangle(0, 0, 2048, 1024) });
      const results = [];
      for (const zoom of [1, 2, 4, 8]) {
        viewer.viewport.zoomTo(zoom, null, true);
        viewer.viewport.panTo(new OpenSeadragon.Point(0.6, 0.3), true);
        viewer.forceRedraw();
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const start = viewer.viewport.pixelFromPoint(new OpenSeadragon.Point(0, 0), true);
        const end = viewer.viewport.pixelFromPoint(new OpenSeadragon.Point(1, 0.5), true);
        const rect = overlay.getBoundingClientRect();
        const container = viewer.container.getBoundingClientRect();
        const error = Math.max(Math.abs(rect.width - (end.x - start.x)), Math.abs(rect.height - (end.y - start.y)), Math.abs(rect.left - container.left - start.x), Math.abs(rect.top - container.top - start.y));
        results.push({ zoom, expectedWidth: end.x - start.x, actualWidth: rect.width, error });
      }
      viewer.destroy();
      return results;
    }, styles);
    console.log(JSON.stringify(results, null, 2));
    if (results.some((result) => result.error > 1)) process.exitCode = 1;
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
