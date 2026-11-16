# 新返航录

浏览器里的太空船社交推理游戏：11 名人类与 4 名异形同船，玩家要在维修飞船、搜尸取证和开会投票之间找出异形，或者作为异形把所有人骗过去。

- 2.5D 在线试玩：<https://returnlog.pages.dev>
- 3D 在线试玩：<https://returnlog-3d.pages.dev>
- 3D 源码分支：<https://github.com/hxj-2888/returnlog/tree/3d>

## 运行

零依赖静态页面，不需要构建：

1. 直接打开 `index.html`；或
2. 在目录下运行 `python -m http.server 8000`，访问 <http://localhost:8000>。

首次进入会加载地图、角色与音频素材，全部就绪后开放「进入舱段」。

## 操作

- 移动：点击地面
- 交互：`W`
- 出刀：`A`
- 搜尸 / 查看：`S`
- 收尸：`D`
- 施救：`F`
- 报告：`R`
- 开枪：`B`
- 破坏：`H`
- 监控：`V`
- 音效：`M`
- 暂停：`Esc`
- DEV 全知视角：`F2`
- 帧率仪表：`F8`

## 素材许可

地图、家具、角色与音频的许可和署名见：

- `assets/MANIFEST.json`
- `assets/**/LICENSE.txt`
- `assets/**/CREDITS.md`
- `audio/CREDITS.md`

二次分发须保留对应署名与许可文本。

## 许可

代码以 MIT 许可发布，见 `LICENSE`。
