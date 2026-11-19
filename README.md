# 新返航录 3D 版 · 预演（V1P-0.3）

《新返航录》的 **Godot 4.6 Web** 版本：同一艘船、同一套规则，换成第一人称在 98×94 米的飞船里走动。

- 在线试玩：<https://returnlog-3d.pages.dev>（首次打开需下载较大的 `.pck` 与 `.wasm`，建议桌面浏览器并等加载完成）
- 2.5D 主线（当前公网可玩版本）：<https://returnlog.pages.dev>
- 主仓：<https://github.com/hxj-2888/returnlog>（`main` = 2.5D，`3d` = 本工程）
- 版本：`3d/version.json` → **V1P-0.3 / 0.3.0**（3D 独立版本号，不占用 2.5D 的「返航录V3.x」；移植基线由导出脚本从 2.5D 的版本真源自动写入）

---

## 一、和 2.5D 是什么关系

**3D 是 2.5D 的延伸，不是第二条产品线。** 除下面三处，其余一切以 2.5D 的 `js/` 为唯一真源：

| | 处理 |
|---|---|
| **判定规则、数值、语料、AI 行为、会议 / 投票 / 任务 / 战斗 / 结算** | 从 2.5D 导出后移植，**不在 GDScript 里另立第二份定义** |
| **玩家输入映射** | 不同：2.5D 点击地面移动，3D 纯 WASD + 鼠标视角 |
| **维度** | 不同：3D 网格寻路、第一人称相机、碰撞体、遮挡与 LOD 是真·维度产物 |
| **部分美术素材** | 不同：模型、材质与贴图按 3D 管线重做，登记在 `3d/ASSETS.md` |

数据链是单向的：

```
2.5D 真源（js/data/map.js · js/ai/sanity.js · js/data/lines.js …）
      │  导出
      ▼
3d/preview/data/*.json      ← Godot 工程只读这些 JSON
      │  运行时加载
      ▼
3d/preview/scripts/**       ← 实现，数值不硬编码
```

`3d/preview/data/` 里的运行数据：`map.json` / `map_v2.json`（舱室、走廊、任务点）、`floor_spec.json`（地板与尺度）、`rules.json`（数值表）、`lines.json`（语料）、`minigames.json` 与 `panels.json`（任务小游戏与面板）、`space.json`（空间参数）、`sim.json`（模拟基线）、`cover_refs.json`、`version.json`（移植基线快照）。这些是**导出产物，不手改**。

规则该是什么，以 `3d/CORE_RULES.md`（2.5D 规则释义的只读镜像）为准；实现与它不一致时，按它修正实现。

## 二、这一版做到哪一步

V1P-0.3 是**垂直切片 / 预演**，不是完整对局。已经存在的部分：

- **第一人称走船**：`CharacterBody3D` + `move_and_slide()`，胶囊半径 0.35、高 1.7，纯 WASD 移动 + 鼠标视角；自动门、走廊与舱室的遮挡按 3D 语义重建。
- **开场主页**：整船蓝图（`home_view.gd` / `home_ship_map.gd`），与 2.5D 主页同源。
- **任务与小游戏**：`scripts/minigame/` 下 16 类任务小游戏加统一层（对准、排序、接线、注液、阀门、序列、匹配、摆放、倒液、拨杆、对齐、读数、密码、关卡、交换、同步），任务清单来自 `data/minigames.json`。
- **模拟层**：`scripts/sim/` 装人类与异形两侧的 AI、理智与性格、身体状态、声音推理、发言、不变量、网格寻路与机器人，数值全部读导出的 `rules.json`。
- **界面**：`ui_panels.gd`（面板）、`ui_wheel.gd`（交互轮盘）、`ui/pause_layer.gd`（暂停）、`minimap.gd`（小地图）、`secbot_view.gd`（保安机器人视角）、`crew_view.gd`。
- **夹具与自测**：`scripts/tests/` 下有 sim / social / combat / ui / world 与规则夹具执行器，以及分片跑批 `sim_shard.gd`。

仍在推进的部分：3D 侧的场景级规则断言还没跑全（部分规则只有数值断言、没有可复现的场景夹具），所以「玩起来对不对」仍需人工验局；不要把这一版当成 2.5D 的替代品。

## 三、尺度与输入口径

预演采用 **1 格 = 1 米**：

| 项 | 值 |
|---|---|
| 地图 | 98×94 格 → 98×94 米 |
| 走廊宽 | 3.2 米 |
| 墙高 / 天花板 | 3.0 米 / 3.2 米 |
| 玩家速度 | 4.2 米/秒，`Shift` ×1.55 |
| 角色 billboard | 约 1.9 米高（与 96×160 帧比例一致） |

- **尺度是架构常量**：如果觉得房间太大，改全局尺度（例如 1 格 = 0.75 米），不要逐房间手改坐标。
- 目前**没有跳跃与蹲伏**。真要加，必须同时定义「能否越过掩体」，否则 3D 的移动会破坏 2.5D 里「硬掩体挡视线」的语义。
- AI 寻路将来用 `NavigationRegion3D` + `NavigationAgent3D`，不复制 2D 的 A\*；但**寻路结果必须能映射回舱室 / 走廊语义**——会议和证据仍然是按房间说话的。

## 四、工程结构

```
3d/
├── version.json            # 3D 独立版本号（不占 2.5D 版本轴）
├── CORE_RULES.md           # 规则释义（2.5D 权威文本的只读镜像）
├── ARCHITECTURE.md         # 引擎选型 / 复用边界 / 分层 / 尺度 / 输入 / 资产管线 / 测试留痕 / 风险
├── PORTING_PROTOCOL.md     # 逐函数移植规程
├── ASSETS.md               # 素材登记（来源、许可、哈希、用途）
├── DECISIONS.md            # 设计决策记录
├── RELEASE-NOTES.md        # 版本级说明（工程细节与读数不在此重复）
├── preview/                # Godot 4.6 工程
│   ├── project.godot
│   ├── scenes/main.tscn    # 主场景
│   ├── scripts/
│   │   ├── main.gd player.gd config.gd keymap.gd device.gd audio.gd
│   │   ├── map_builder.gd space_data.gd scene_extras.gd minimap.gd
│   │   ├── home_view.gd home_ship_map.gd secbot_view.gd
│   │   ├── ui_panels.gd ui_wheel.gd ui_font.gd ui/pause_layer.gd
│   │   ├── minigame/       # 16 类任务小游戏 + 统一层
│   │   ├── sim/            # 模拟层：ai_human · ai_alien · mind · speech · sound_reason
│   │   │                   #        body_state · bots · crew_view · grid_nav · invariants
│   │   │                   #        rules_data · lines_data · alien_routines · sim_state
│   │   └── tests/          # 夹具与分片执行器
│   ├── data/               # 导出的运行数据（只读产物）
│   └── assets/             # 模型、贴图、字体与 licenses/
└── tools/
    ├── stage-web-deploy.cjs      # 把超过 Pages 单文件上限的导出物拆到 R2
    └── ensure-pages-project.cjs  # 为 Pages 项目写入 R2 绑定
```

## 五、本地运行

1. 装 **Godot 4.6**（与 CI 同版本 `4.6-stable`，版本不一致会导致导入缓存与导出模板不匹配）。
2. 用 Godot 打开 `3d/preview/project.godot`，运行主场景 `3d/preview/scenes/main.tscn`。

大体积的生成贴图不入库；缺图时会退化为共享材质，不影响玩法与场景结构。

## 六、Web 导出与部署

```bash
godot --headless --path 3d/preview --export-release "Web" build/web/index.html
node 3d/tools/stage-web-deploy.cjs --dir build/web --stage build/r2-stage --manifest build/r2-manifest.json
node 3d/tools/ensure-pages-project.cjs        # 给 Pages 项目挂上 R2 绑定
```

Cloudflare Pages 有**单文件 25 MiB 上限**，而 Godot 导出的 `index.pck` 远超这个数，所以部署把超限文件放到 **R2**，Pages 只留索引与小于上限的文件；CI 会在拆分后再次断言没有文件超 25 MiB，否则直接失败。

CI（`.github/workflows/deploy-3d.yml`，push 到 `3d` 分支或手动触发）依次做：缓存并安装 Godot `4.6-stable` 与 Web 导出模板 → 导入资源 → 导出 Web → 体积报告 → 拆分超限文件 → 校验 / 创建 R2 桶 → 部署 Pages。需要的项目与资源：

| 项 | 值 |
|---|---|
| Pages 项目 | `returnlog-3d` · <https://returnlog-3d.pages.dev> |
| R2 桶 / 绑定 | `returnlog-3d-assets` / `ASSETS_R2` |
| 需要的 Secrets | `CF_API_TOKEN`、`CF_API_TOKEN_3D`（带 R2 编辑权限）、`CF_ACCOUNT_ID` |

自建时两个坑：**10042** 是账号根本没订阅 R2（改 Token 没用，去后台开通）；**10000 / 9109** 才是 Token 缺 R2 权限。列桶的响应见过 `{"result":{"buckets":[…]}}` 与裸数组两种形状，只按一种写会把「桶已存在」误判成不存在，再 create 就红。

## 七、素材与许可

- **字体**：Noto Sans CJK SC 子集，SIL Open Font License 1.1，见 `3d/preview/assets/fonts/OFL.txt`。
- **场景与音频**：CC-BY 4.0 与 CC0 素材的署名与许可证副本随工程保留在 `3d/preview/assets/licenses/` 及 `3d/ASSETS.md` 登记表；**署名不可删，二次分发同样适用**。
- **生成式贴图**属于研究用途许可，不自动等于可商用；商用前需换成宽松许可产物或取得授权。
- 代码以 **MIT** 许可发布，见 [LICENSE](LICENSE)。

## 八、相关文档

| 文档 | 内容 |
|---|---|
| [3d/ARCHITECTURE.md](3d/ARCHITECTURE.md) | 引擎选型、复用边界（可直接复用 / 改造后复用 / 不能复用）、分层、尺度、输入、资产管线、测试与已知风险 |
| [3d/CORE_RULES.md](3d/CORE_RULES.md) | 规则的设计口径（自然语言），判对错以它为准 |
| [3d/PORTING_PROTOCOL.md](3d/PORTING_PROTOCOL.md) | 逐函数移植流程与红线适用性映射 |
| [3d/ASSETS.md](3d/ASSETS.md) | 素材来源、许可与哈希登记 |
| [3d/DECISIONS.md](3d/DECISIONS.md) · [3d/RELEASE-NOTES.md](3d/RELEASE-NOTES.md) | 设计决策与版本说明 |
| 2.5D 主线 | <https://github.com/hxj-2888/returnlog>（`main` 分支） |
