# 3D 预演资产清单

> 原则：**复制进来的每个文件都要能追到来源、许可、哈希**。
> 完整 SHA256 用于复核；如果改了源文件，必须重新跑 `export-map.cjs` 或重新复制并更新本表。

## 数据

| 文件 | 来源 | SHA256 |
|---|---|---|
| `preview/data/map.json` | 由 `js/data/map.js` 经 `3d/tools/export-map.cjs` 生成 | `b28667a118c5443d5adfdde9d6bf8aca86cf0a40ed1cb9415287f611ca2e78df` |

源文件 `js/data/map.js` SHA256：`eb9d79916906e16ad2f3cc9947ff74ffc19cd75a1f1754df8a014af2f3216974`。

## 贴图（来自 `assets/scene/v4/tex`）

| 文件 | 源文件 | SHA256 |
|---|---|---|
| `preview/assets/textures/cafeteria-floor.png` | `assets/scene/v4/tex/cafeteria-floor.png` | `0e1551f92abb04a1f18ab1b41af9e9a33cde86a92ae9bb3a288b459cdb22fb47` |
| `preview/assets/textures/crate-steel.png` | `assets/scene/v4/tex/crate-steel.png` | `20807932f25e874977d62e93638f2861dfb6abe6da635970c67a16a270b3f66e` |
| `preview/assets/textures/floor-carpet.png` | `assets/scene/v4/tex/floor-carpet.png` | `05f943143030bf91a13c2c1006266d982c631399d624b23b9d572a6e2cb617df` |
| `preview/assets/textures/floor-eco.png` | `assets/scene/v4/tex/floor-eco.png` | `73974763ecd2477e3c0af6806d6a30e94b3a629ca6ebad7f3354d9d6500665da` |
| `preview/assets/textures/floor-engine.png` | `assets/scene/v4/tex/floor-engine.png` | `62b12f3c35181b0485392b0b6139edf998fc63d6dbe7edc09ed15165411126c2` |
| `preview/assets/textures/floor-grate.png` | `assets/scene/v4/tex/floor-grate.png` | `8fdec8be494560d44401a4c8c71e6b6c605d7e7ff127a0378f3ffc2e73aa2e13` |
| `preview/assets/textures/floor-hazard.png` | `assets/scene/v4/tex/floor-hazard.png` | `a01c7fddaa697602e595793f33af08274a6389c81e9163a07cf3eee2fc0185dd` |
| `preview/assets/textures/floor-lab.png` | `assets/scene/v4/tex/floor-lab.png` | `7340c9e2abdda5ef6576e139552294f3817fbc6a761fb460f36f4759fba72e4e` |
| `preview/assets/textures/floor-lounge.png` | `assets/scene/v4/tex/floor-lounge.png` | `fab57c650d0570253dd8d292fb7bc76b20a86e1592c5151b092523d7205d49d1` |
| `preview/assets/textures/floor-monitor.png` | `assets/scene/v4/tex/floor-monitor.png` | `c00809b015e584043eff56732bda4cec07780c0bf3f997690e7f0e66ed2cc092` |
| `preview/assets/textures/floor-power.png` | `assets/scene/v4/tex/floor-power.png` | `605d64e4d71b8a383c7bb129308d69cf3a8f868be18e23f7aebab4a566f80e1b` |
| `preview/assets/textures/floor-steel.png` | `assets/scene/v4/tex/floor-steel.png` | `9dc2b3ab45617d1aa7cbbab8780b329f0187188821df53b4ffe12d3a2b597f36` |
| `preview/assets/textures/panel-metal.png` | `assets/scene/v4/tex/panel-metal.png` | `fe06357062530aff4a1610e0df96d9b4440aadf1a01f1689352cde639074c15a` |
| `preview/assets/textures/table-composite.png` | `assets/scene/v4/tex/table-composite.png` | `59810b006c3c111f9c71c2fc88267a85f3a86c1ffb0686311ff1cd02bce01e6b` |
| `preview/assets/textures/wall-panel.png` | `assets/scene/v4/tex/wall-panel.png` | `621c04e80e832775ab578d596ef6395b3549e85a1dc052fe69cdfbc9d01cb6ae` |
| `preview/assets/textures/warehouse-floor.png` | `assets/scene/v4/tex/warehouse-floor.png` | `49bbddc19abbc6ee6414be2a08d35c2966326596269e108a8d01fcc9bffbb1f0` |

许可见 `preview/assets/licenses/v4-CREDITS.md`；这些素材按原项目要求保留 CC-BY 4.0 署名。

## 角色

| 文件 | 来源 | SHA256 |
|---|---|---|
| `preview/assets/crew/crew-01.png` | `assets/scene/crew/crew-01.png`（4×5 帧，96×160/帧） | `0c8839a85422f3c7b8ddbcd86c5e4a232811208ce12c06d63701071c099846f5` |

许可见 `preview/assets/licenses/crew-LICENSE.txt`。

## 生成物

- `.godot/`、`*.import`、`*.uid` 由 Godot 生成；`.godot/` 已在 `preview/.gitignore` 中忽略，
  `.import` / `.uid` 保留以便导入设置稳定。
- `map.json` 是生成文件；修改 `js/data/map.js` 后必须重新导出。
