/* 放大板图的一块区域，用来肉眼核对断口是否压在线上。
 * 用法：node tools/plate/zoom.cjs x y w h scale out.png */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const [x, y, w, h, scale, out] = process.argv.slice(2);
const plate = JSON.parse(fs.readFileSync(path.join(__dirname, 'panel-fix.plate.json'), 'utf8'));
const b64 = fs.readFileSync(path.resolve(__dirname, plate.image)).toString('base64');
(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page = await browser.newPage({ viewport: { width: +w * +scale, height: +h * +scale } });
  await page.setContent(`<body style="margin:0"><canvas id="c" width="${w * scale}" height="${h * scale}"></canvas></body>`);
  const url = await page.evaluate(async ({ data, x, y, w, h, scale }) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + data; await img.decode();
    const c = document.getElementById('c'); const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, x, y, w, h, 0, 0, w * scale, h * scale);
    return c.toDataURL('image/png');
  }, { data: b64, x: +x, y: +y, w: +w, h: +h, scale: +scale });
  fs.writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
  await browser.close();
  console.log('->', out);
})();
