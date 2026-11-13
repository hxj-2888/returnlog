/* 从板图里找出真实电线的中心线与走向：颜色掩膜 + 连通域 + 局部主轴。
 * 用法：node tests/plate/probe.cjs
 * 只读，不改任何文件；输出候选断点，人工确认后写进 plate JSON。 */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const repo = path.resolve(__dirname, '..', '..');
const plate = JSON.parse(fs.readFileSync(path.join(__dirname, 'panel-fix.plate.json'), 'utf8'));
const imgPath = path.resolve(__dirname, '..', '..', plate.image);
const b64 = fs.readFileSync(imgPath).toString('base64');

const TARGETS = [
  { id: 'blue', hue: [185, 220], guess: [405, 517] },
  { id: 'red', hue: [345, 20], guess: [467, 500] },
  { id: 'amber', hue: [30, 60], guess: [384, 588] },
];

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  });
  const page = await browser.newPage();
  await page.setContent('<canvas id="c"></canvas>');
  const clusters = await page.evaluate(async ({ data, targets, crop }) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + data;
    await img.decode();
    const c = document.getElementById('c');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const { data: px, width: W, height: H } = ctx.getImageData(0, 0, c.width, c.height);

    const hsv = (r, g, b) => {
      r /= 255; g /= 255; b /= 255;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
      let h = 0;
      if (d) {
        if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
        h *= 60; if (h < 0) h += 360;
      }
      return [h, mx ? d / mx : 0, mx];
    };
    const inCrop = (x, y) => x >= crop[0] && x < crop[0] + crop[2] && y >= crop[1] && y < crop[1] + crop[3];

    const out = {};
    for (const t of targets) {
      const mask = new Uint8Array(W * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (!inCrop(x, y)) continue;
        const i = (y * W + x) * 4;
        const [h, s, v] = hsv(px[i], px[i + 1], px[i + 2]);
        const hueOk = t.hue[0] <= t.hue[1]
          ? h >= t.hue[0] && h <= t.hue[1]
          : (h >= t.hue[0] || h <= t.hue[1]);
        if (hueOk && s > 0.42 && v > 0.28) mask[y * W + x] = 1;
      }
      const seen = new Uint8Array(W * H);
      const list = [];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const p = y * W + x;
        if (!mask[p] || seen[p]) continue;
        const stack = [p]; seen[p] = 1;
        const pts = [];
        while (stack.length) {
          const q = stack.pop(); const qx = q % W, qy = (q / W) | 0;
          pts.push([qx, qy]);
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = qx + dx, ny = qy + dy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            const np = ny * W + nx;
            if (mask[np] && !seen[np]) { seen[np] = 1; stack.push(np); }
          }
        }
        if (pts.length < 120) continue;
        let sx = 0, sy = 0;
        for (const [ax, ay] of pts) { sx += ax; sy += ay; }
        const cx = sx / pts.length, cy = sy / pts.length;
        list.push({ n: pts.length, cx: +cx.toFixed(1), cy: +cy.toFixed(1), d: Math.hypot(cx - t.guess[0], cy - t.guess[1]) });
      }
      list.sort((a, b) => a.d - b.d);
      out[t.id] = list.slice(0, 4);
    }
    return out;
  }, { data: b64, targets: TARGETS, crop: plate.crop });

  console.log(JSON.stringify(clusters, null, 2));
  await browser.close();
})();
