/* 把断口吸附到真实电线上：颜色掩膜 → 就近质心 → 局部主轴（PCA）→ 切线角。
 * 用法：node tools/plate/snap.cjs [--write]
 * 不带 --write 只打印建议值；带 --write 直接回写 plate JSON。 */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const here = __dirname;
const platePath = path.join(here, 'panel-fix.plate.json');
const plate = JSON.parse(fs.readFileSync(platePath, 'utf8'));
const b64 = fs.readFileSync(path.resolve(here, plate.image)).toString('base64');

/* 只按色相判定；饱和度和明度压得比较低，暗处的线也能捞到 */
const HUE = {
  'w-blue': [185, 225],
  'w-red': [340, 20],
  'w-amber': [28, 62],
};

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page = await browser.newPage();
  await page.setContent('<canvas id="c"></canvas>');
  const out = await page.evaluate(async ({ data, wires, hue }) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + data; await img.decode();
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
    const res = [];
    for (const w of wires) {
      const [h0, h1] = hue[w.id];
      const pts = [];
      const R = 46;
      for (let y = Math.max(0, w.cut.y - R); y < Math.min(H, w.cut.y + R); y++) {
        for (let x = Math.max(0, w.cut.x - R); x < Math.min(W, w.cut.x + R); x++) {
          const i = (y * W + x) * 4;
          const [h, s, v] = hsv(px[i], px[i + 1], px[i + 2]);
          const ok = h0 <= h1 ? (h >= h0 && h <= h1) : (h >= h0 || h <= h1);
          if (ok && s > 0.40 && v > 0.26) pts.push([x, y]);
        }
      }
      if (pts.length < 40) { res.push({ id: w.id, err: '颜色点太少 ' + pts.length }); continue; }
      /* 质心（就近窗口内全是同一根线，所以质心就是线上一点） */
      let sx = 0, sy = 0;
      for (const [x, y] of pts) { sx += x; sy += y; }
      const cx = sx / pts.length, cy = sy / pts.length;
      /* 局部主轴：只用质心附近 18px 的点，避免曲线把角度拉平 */
      const loc = pts.filter(([x, y]) => Math.hypot(x - cx, y - cy) <= 18);
      let sxx = 0, syy = 0, sxy = 0;
      for (const [x, y] of loc) { const dx = x - cx, dy = y - cy; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
      const th = 0.5 * Math.atan2(2 * sxy, sxx - syy);
      let deg = th * 180 / Math.PI;
      if (deg > 90) deg -= 180;
      if (deg < -90) deg += 180;
      res.push({
        id: w.id,
        from: [w.cut.x, w.cut.y],
        to: [+cx.toFixed(1), +cy.toFixed(1)],
        move: +Math.hypot(cx - w.cut.x, cy - w.cut.y).toFixed(1),
        angle: +deg.toFixed(1),
        n: pts.length,
        width: (() => {
          /* 垂直主轴方向的展宽 ≈ 线宽 */
          let mn = 1e9, mx = -1e9;
          for (const [x, y] of loc) {
            const d = -(x - cx) * Math.sin(th) + (y - cy) * Math.cos(th);
            mn = Math.min(mn, d); mx = Math.max(mx, d);
          }
          return +(mx - mn).toFixed(1);
        })(),
      });
    }
    return res;
  }, { data: b64, wires: plate.wires, hue: HUE });

  console.log(JSON.stringify(out, null, 2));

  if (process.argv.includes('--write')) {
    for (const r of out) {
      if (r.err) continue;
      const w = plate.wires.find(x => x.id === r.id);
      w.cut.x = r.to[0]; w.cut.y = r.to[1]; w.cut.angle = r.angle;
      if (r.width) w.width = Math.max(6, Math.round(r.width));
    }
    fs.writeFileSync(platePath, JSON.stringify(plate, null, 2) + '\n', 'utf8');
    console.log('[snap] 已回写', path.relative(path.resolve(here, '..', '..'), platePath));
  }
  await browser.close();
})();
