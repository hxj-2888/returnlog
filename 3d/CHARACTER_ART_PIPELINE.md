# 3D 人物写实化方案（骨骼 + 贴图，不建高模）

> 2026-11-11 用户反馈：「人物建模太粗糙，但真建完整 3D 也不现实；能不能骨骼仍然驱动，人物靠贴图保证写实风格统一？」
> 本文回答这个问题，并给出可落地的管线。**当前未改动任何模型资产**，只记录方案。

## 一、结论

**能，而且这是低预算项目最标准的做法。**

写实感的来源不是面数，而是三件事：**表面细节（贴图/法线）> 光照一致性 > 轮廓比例**。
现在的 `char_crew_lowpoly.glb` 只有 **1,812 三角面 / 4 个纯色材质 / 17 根骨 / 259 KB**，
问题不在面数太少，而在**材质是纯色**——没有任何布料纹理、褶皱、缝线、磨损，所以看起来像塑料人偶。

保留骨骼与动画（`idle` / `walk` / `knife` / `down` 已导出，动作链已验证可用），
只把 4 个纯色材质换成 **UV + PBR 贴图**，写实度会有量级提升，面数一个都不用加。

## 二、三条路线对比

| 路线 | 做法 | 写实上限 | 成本 | 近景表现 | 建议 |
|---|---|---|---|---|---|
| **A. 骨骼 + PBR 贴图**（推荐） | 保留 1,812 面低模，展开 UV，贴 albedo / normal / roughness / AO | 高（接近「风格化写实」） | 中：1 张图集 + 1 次 UV | 好 | **主方案** |
| B. 骨骼 + 广告牌切片 | 每个肢体挂一张 2.5D 切片贴图，随骨骼摆动 | 低（像素/绘画感） | 低 | 差（一转角就穿帮） | 只作远景或降级方案 |
| C. Impostor（八面体烘焙） | 从 8~16 个角度烘焙成图集，按视角切换 | 中（远景够用） | 中 | 差（贴脸即穿） | 作为 **LOD 远景** 叠加在 A 上 |

**推荐 A + C**：近景用低模 + PBR，20 m 外切成 impostor。

## 三、A 方案实施步骤

### 1. UV 展开

- 在 Blender 里对 4 个材质槽分别展开（`Smart UV Project`，岛间距 4 px 以上）。
- 4 个槽在图集里分区：`suit` 占 50%（面积最大）、`gear` 20%、`accent` 15%、`skin` 15%。
- 关键：**UV 岛不许重叠**，否则烘焙会串色；`crew_suit` 的接缝放在腋下/内侧，正面看不到。

### 2. 贴图来源（千问本地模型 · SDXL 已退役）

> 2026-11-11 用户裁定：**材质与刀一律用千问本地模型出图，不用 SDXL**。`gen-qwen-room-skins.ps1` 的头部也记着同一条口径（SDXL 于 2026-11-09 退役）。

现有链路：`sdcpp Vulkan sd-cli.exe` + `Qwen-Image 2.1 Turbo Q4_K_M` + `Qwen3-VL-8B-Instruct` 文本编码器，8 步 / CFG 1.0 / euler / qwen-image-2.1-turbo sigmas，512² 单张约 47 秒。

**已落地脚本**：`3d/tools/gen-qwen-materials.ps1`（生成 6 张原始方图）+ `3d/tools/crop-materials.gd`（裁掉四周、缩到 384² 运行时贴图）。

| 用途 | 原始 prompt 主题 | 运行时文件 |
|---|---|---|
| 制服布 | light grey twill service-uniform fabric | `assets/models/crew_tex/crew-fabric.png` |
| 胸带织带 | coral red nylon webbing strap | `assets/models/crew_tex/crew-webbing.png` |
| 靴/背包皮革 | black leather, pebbled grain | `assets/models/crew_tex/crew-leather.png` |
| 皮肤 | human skin surface, pores and fine lines | `assets/models/crew_tex/crew-skin.png` |
| 刀身 | brushed stainless steel, grind marks | `assets/weapons/knife-blade.png` |
| 刀柄 | black rubber grip, cross-hatch knurling | `assets/weapons/knife-grip.png` |

出图要点（prompt 尾缀固定）：`seamless flat texture map, orthographic top-down view, evenly lit with no shadow, fills the entire frame edge to edge, no object outline, no background, no perspective, tileable`。缺了这个尾缀，千问会画成「一块有透视和投影的金属板」，不能当材质用。

**许可证**：Qwen Research License，**非商用**，仅本地生成；商用发布需换权重或单独授权（与 `gen-qwen-room-skins.ps1` 记录一致）。


### 3. 贴图规格（按现有配额倒推）

| 贴图 | 尺寸 | 格式 | 说明 |
|---|---|---|---|
| `crew_albedo` | 2048² | PNG → Godot VRAM 压缩（BC7/ETC2） | 4 槽共用一张图集 |
| `crew_normal` | 2048² | PNG（法线，OpenGL 约定） | **写实感提升最大的一张**：布纹、褶皱、缝线全靠它 |
| `crew_orm` | 1024² | PNG（R=AO / G=Roughness / B=Metallic） | 打包，省 2 张图 |
| 合计 | — | — | 发布包约 **+2.5~3 MB**（有 VRAM 压缩后显存约 8~10 MB） |

- **15 个席位共用一套贴图**，靠现有 `_tint_model()` 给 `crew_suit` 换色区分，不额外增图。
- 若要区分「工程师/医疗/保安」等外观，再加 1 张 1024² 的 **decal 图集**（臂章/背标），UV 叠在胸背，成本 +0.3 MB。

### 4. 材质与光照（避免「塑料感」的关键）

- `roughness` 不要低于 0.55：低粗糙 + 无环境反射 = 塑料。
- 金属度只给扣具、拉链（`crew_gear` 局部），服装一律 0。
- 统一色调：albedo 饱和度压低 10~15%，让 HUD/红闪等彩色效果更突出。
- 场景已有手电（`SpotLight3D`，7 m / 60°）与暗舱环境，**贴图要按「低照度」调**：亮部不要拉满，留出高光余量。
- 加一层很轻的菲涅尔轮廓（`rim`）能显著提升「有体积」的观感，成本几乎为零。

### 5. 验收标准

- `--crewshot` 出对比图（现有命令，输出 `preview/screenshots/crew-lowpoly.png`），与旧纯色版并排评审。
- 近景 1 m 内看：能分辨布纹与缝线，无明显接缝错位。
- 发布包增量 ≤ 3 MB；`npm run guard` 仍 PASS。
- 单帧 GPU 时间增幅 < 0.3 ms（15 人同屏）。

## 四、落地顺序（建议）

| 阶段 | 内容 | 产出 |
|---|---|---|
| P1 | 只做 **1 个样板角色**：UV + 图集 + 法线，跑通全链路 | `char_crew_lowpoly_tex.glb` + 对比图 |
| P2 | 评审：写实度是否够、色调是否与场景统一 | 通过/调参 |
| P3 | 批量：15 席共用图集 + tint + decal | 正式人物资产 |
| P4 | 远景 LOD：impostor 图集（可选） | 20 m 外降级 |

**P1 是唯一的决策点**：样板出来后你只要判断「这个写实度能不能接受」，其余都是流水线工作。

## 五、与现有代码的接线点

| 位置 | 现状 | 改法 |
|---|---|---|
| `3d/tools/build-crew-rigged.py` | 4 个 `material()` 纯色，无 UV/贴图 | 加 UV 展开 + 贴图节点 + `export_texcoords/normal` 已开，补 `export_materials='EXPORT'` |
| `3d/preview/scripts/sim/crew_view.gd` `_tint_model()` | 复制 `StandardMaterial3D` 改 `albedo_color` | 保留；改成 `albedo_color` 乘到贴图上（Godot 会自动相乘） |
| `3d/ASSETS.md` | 登记 1,812 tris / 4 材质 | P1 完成后补图集条目与哈希 |
| `3d/preview/assets/models/` | 只放 `.glb` | 贴图放 `3d/preview/assets/models/crew_tex/`，按 `ASSETS.md` 登记 |

## 六、风险

1. **风格漂移**：六张千问图如果光照方向不一致，拼在一起会「脏」。解决：prompt 里固定 `evenly lit with no shadow`，并在裁切时只取画面中心（四周渐变最强）。
2. **法线过强**：布纹法线强度建议 0.8~1.2，超过 1.5 在低照度下会像塑料褶皱。
3. **两仓体积**：3D 仓本来就有 250 MB 级资产，加 3 MB 可接受；但 `main` 仓的 `3d/` 快照也会同步到，需在 P1 后重新评估 `main` 的体积配额。
4. **不要动骨骼与动画**：本次只换表面，`idle/walk/knife/down` 与 17 根骨的绑定关系保持不变，避免牵动已有的动作自测。
5. **UV 是当前瓶颈**：现在 4 个材质槽直接吃平铺图（每个盒子面 0..1 UV），近看会有拉伸；P1 的 UV 展开就是解决这个。

## 七、已落地（2026-11-11 第一版）

- 6 张材质已用千问生成并裁成 384²，`.import` 已提交，Godot 直接可加载。
- `crew_view.gd::_tint_model()` 已改为「按材质名挂贴图 + tint 乘色」：`suit` 用布料、`accent` 用织带、`gear` 用皮革、`skin` 用肤质；缺图自动退回纯色。
- 第一人称刀已换成千问刀身/刀柄贴图，并补了护手与刀尖两段几何。
- 效果核对：`crew_facing_ab.png`（正反面对照）、`knife_check.png`（第一人称刀）。两张图在 2026-11-11 的会话产物中，未入库。
- **还没做**：UV 展开与法线烘焙（P1）。当前是「平铺贴图直接上盒子」，1 m 内近看仍能看出拉伸，这是下一版要解决的。
