# 新返航录 3D 版

《新返航录》的 Godot 4.6 Web 版本，与 2.5D 版共用同一套玩法规则、地图数据和数值。

- 在线试玩：<https://returnlog-3d.pages.dev>
- 2.5D 版本：<https://returnlog.pages.dev>
- 主仓：<https://github.com/hxj-2888/returnlog>

## 目录

- `3d/preview/`：Godot 4.6 工程（场景、脚本、运行数据、模型与字体）
- `3d/tools/stage-web-deploy.cjs`：把超过 Pages 单文件上限的 Web 导出物拆到 R2
- `3d/tools/ensure-pages-project.cjs`：为 Pages 项目写入 R2 绑定

## 本地运行

1. 用 Godot 4.6 打开 `3d/preview/project.godot`。
2. 直接运行主场景。

大体积的生成贴图不入库；缺少时会使用共享材质兜底，不影响玩法与场景结构。

## 导出 Web

```bash
godot --headless --path 3d/preview --export-release "Web" build/web/index.html
node 3d/tools/stage-web-deploy.cjs --dir build/web --stage build/r2-stage --manifest build/r2-manifest.json
```

部署需要 Cloudflare Pages 项目 `returnlog-3d` 与 R2 bucket `returnlog-3d-assets`。

## 素材与许可

- 字体：Noto Sans CJK SC 子集，SIL Open Font License 1.1，见 `3d/preview/assets/fonts/OFL.txt`
- 音频与模型署名：见 `3d/preview/assets/licenses/`
- 代码：MIT，见 `LICENSE`
