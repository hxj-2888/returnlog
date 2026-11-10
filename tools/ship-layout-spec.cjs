// =============================================================
// ship-layout-spec.cjs · 全船掩体重构「方案真源」（人工维护，中文）
// -------------------------------------------------------------
// 上游：3d/preview/data/map.json (schema v2) 的 rooms / theme / cover / decor，
//       现状快照 tools/ship-layout-current.json。
// 下游：ship-layout-build.cjs → ship-layout-plan.json + ship-layout-overview.html
//       ship-layout-check.cjs → ship-layout-report.md
// 本文件只写「怎么摆」与「为什么这么摆」，不写任何渲染代码。
//
// 2026-11-06 用户七条裁定（对应 RULES.R1~R8）：
//   ① 不许物品挡门，也不许离门太近 → 门厅净空区 + 主通道，硬禁放
//   ② 医疗间等空舱要继续填充 → 面积占用下限 18%，且靠成组大件而非撒小件
//   ③ SDXL 本地生图 → Blender 渲染的初步工作流 → WORKFLOW + sdxl/blender 段
//   ④ 重构掩体分布 → 全 10 间重排（本文件 SPECS）
//   ⑤ 允许墙面装饰，但须符合原本风格 → wall[] 绑定 room theme / 题材
//   ⑥ 不跨舱室复用素材 → kind / asset / 贴图目录一律带房间前缀
//   ⑦ 不要杂乱：同类型聚在一起 + 层次感 + 参考现实建筑设计
//      → 功能分区 / 沿墙布置 / 主通道留空 / 大小件分层 / 每区 ≤2 类
// =============================================================

'use strict';

// ---- 量化规则（校验器逐条对照） --------------------------------
const RULES = {
  version: 'v2-20261106',
  door: {
    halfWidth: 2.2,       // 门中心 ±2.2 格（门洞本身 ±0.9，两侧各留 1.3）
    depth: 3.2,           // 进门向内 3.2 格：任何掩体不得进入
    wallNoGo: { half: 1.3, depth: 2.2 } // 墙饰也不许贴门洞正前
  },
  spineWidth: 2.4,        // 主通道带宽（走廊 3.2，室内收一档）
  pipeClear: 2.0,         // 管道口四周净空
  taskReach: 2.5,         // 任务点 2.5 格内必须有真实道具
  occ: { min: 18, max: 30 },  // 面积占用 %：下限治「空」，上限治「杂乱」
  zone: {
    maxPerRoom: 4,        // 一间最多四个分区 → 不碎、不杂乱
    maxMainKinds: 2,      // 每区 anchor/mid 主类 ≤2（accent 贴附配件不计）
    sameKindSingleZone: true,  // 同一 kind 不得跨区 → 同类型聚在一起
    clusterMin: 0.65,     // ≥65% 的掩体成组（贴墙 / 贴大件 / 同区相邻）
    clusterGap: 2.4       // 成组判定：与同区任意件的边缘净距 ≤2.4 格
  },
  tier: ['anchor', 'mid', 'accent'],  // 大件锚点 → 中件成排 → 小件配件
  wallsPerRoom: { min: 3, max: 5 },
  unique: 'kind / asset / texture 目录一律以房间 id 为前缀，禁止跨舱室引用',
  decisions: [
    'R1 门厅净空：门中心 ±2.2 格 × 向内 3.2 格内禁放任何掩体；墙饰另有更严的门洞正前禁区。',
    'R2 主通道：每扇门到房间中心留 ≥2.4 格宽的通道带，掩体不得侵入；进门第一眼要能看到房间纵深。',
    'R3 边界与重叠：掩体完整落在舱室多边形内（含切角），彼此不重叠，不覆盖任务点 / 管道口。',
    'R4 可达性：每个任务点 2.5 格内有真实道具，管道口 2 格净空。',
    'R5 密度：每间面积占用 18–30%；靠「沿墙成组的大件 + 配件层次」填充，不靠随机撒小件。',
    'R6 分区与层次（对应第 7 条）：每间 ≤4 个功能分区；每区 anchor/mid 主类 ≤2、同一 kind 不跨区（同类型聚在一起）；大件锚点→中件成排→小件配件三档齐备；≥65% 掩体成组（贴墙 / 贴大件 / 同区相邻 ≤2.4 格），中央留活动场。',
    'R7 素材唯一：kind / asset / SDXL 提示词 / seed / 贴图目录全部房间专属，跨舱室零引用。',
    'R8 墙面装饰：贴墙、厚 ≤0.5 格、3–5 件/间，避开门洞与管道口；题材与配色绑定该舱室 theme。'
  ]
};

// ---- 工作流（SDXL 本地生图 → Blender 5.2.2 渲染，初步） --------
const WORKFLOW = {
  title: 'SDXL 本地生图 → Blender 5.2.2 渲染',
  note: '初步工作流：本轮固化流程 / 目录 / 命名 / 命令，SDXL 阶段 dry-run 与 Blender 阶段占位渲染均已实测；未批量出图（GPU diffusers 512²/12 步约 70–80 秒/张）。逐舱放行后再加 --execute。',
  steps: [
    { n: 1, name: '方案定稿', input: 'ship-layout-plan.json', output: '每间 wall[] 的 prompt / seed / 输出名', cmd: 'node tools/ship-layout-check.cjs' },
    { n: 2, name: 'SDXL 本地生图', input: 'D:\\ai-models\\sdxl-base + vae-fp16-fix', output: '3d/assets/textures/<room>/<asset>_raw.png', cmd: 'C:\\Python314\\python.exe 3d/tools/room-wall-art.py --stage sdxl --room <id> --execute' },
    { n: 3, name: '后处理定调', input: '*_raw.png', output: '3d/assets/textures/<room>/<asset>.png', cmd: 'C:\\Python314\\python.exe 3d/tools/room-wall-art.py --stage grade --room <id> --execute' },
    { n: 4, name: 'Blender 建模 + 渲染', input: 'plan.json + 贴图', output: '3d/assets/renders/room-wall-<room>.png / .blend', cmd: '"E:/SteamLibrary/steamapps/common/Blender/blender.exe" -b -P 3d/tools/room-wall-art.py -- --stage blender --room <id> --test' },
    { n: 5, name: '导出与同步', input: '<room>.blend', output: '3d/assets/export/<room>_wall.glb → preview/assets/models/', cmd: 'npm run 3d:sync:models && npm run 3d:import:check' }
  ],
  sdxl: {
    model: 'D:\\ai-models\\sdxl-base（diffusers fp16 变体，本机实测跑通）',
    vae: 'D:\\ai-models\\vae-fp16-fix（fp16 下必须换，否则出纯黑图）',
    primary: 'GPU diffusers · 512² / 12 步 / CFG 6.0 · 约 70–80 秒/张（C:\\Python314\\python.exe + torch 2.11+cu128 + diffusers 0.42）',
    fallback: 'sdcpp CPU q2_K（E:\\ai-tools\\sdcpp\\vulkan\\sd-cli.exe，需 SDXL GGUF；本机 D:\\ai-models\\gguf 只有 Z-Image / Qwen 权重，暂未启用）',
    highQuality: '3d/tools/gen-panel-texture.py（768² / 24 步，留给内存余量足够的机器）',
    negative: 'text, words, letters, logo, watermark, people, clutter, random objects, warm daylight, wood, fantasy'
  },
  blender: {
    binary: 'E:\\SteamLibrary\\steamapps\\common\\Blender\\blender.exe',
    version: '5.2.2 LTS',
    engine: 'BLENDER_EEVEE_NEXT',
    samples: 64,
    preview: '960×901',
    guard: 'bpy.app.version < (5,2) 直接 SystemExit'
  },
  antiReuse: [
    '每间房独立目录 3d/assets/textures/<room>/，不设 shared/ 公共贴图目录（通用地板除外）。',
    '每件墙饰独立 prompt、独立 seed（seed = 房间序号×100 + 件序号），不共用参考图。',
    '模型文件名 <room>_<asset>.blend / .glb，manifest 里 room 字段必填且唯一。',
    '禁止把 A 舱的贴纸 / 铭牌 / 屏幕 UI 复制到 B 舱；同类功能也要重画（如两间都有屏，各自出图）。'
  ]
};

// ---- 房间主题（真源：map.json rooms[].theme，此处只做风格描述） ----
const THEMES = {
  bridge:   { palette: '暖白墙 / 深棕台面 / 琥珀辉光', mood: '舰桥会议、正式、克制', motif: '航线星图、舰徽铭牌、会议规程' },
  cam:      { palette: '冷白蓝墙 / 深蓝顶 / 青蓝辉光', mood: '监控、精密、低照度', motif: '舱位编号图、班次表、布线示意' },
  ecosys:   { palette: '淡绿墙 / 墨绿顶 / 翠绿辉光', mood: '温室、湿润、有机', motif: '植物铭牌、浇灌刻度、循环管路图' },
  power:    { palette: '暖黄墙 / 暗褐顶 / 琥珀辉光', mood: '高压、工业、警示', motif: '高压警示条、单线接线图、载荷铭牌' },
  transit:  { palette: '米黄墙 / 暖褐顶 / 橙黄辉光', mood: '食堂、烟火气、明亮', motif: '菜单板、配餐规程、排队标识' },
  fun:      { palette: '淡紫墙 / 深紫顶 / 品红辉光', mood: '娱乐室、霓虹、轻松', motif: '霓虹招牌、机台编号、游戏海报' },
  engine:   { palette: '暖橙墙 / 暗红褐顶 / 橙红辉光', mood: '机房、高温、油渍', motif: '高温警示、检修铭牌、缸体管线图' },
  med:      { palette: '冷白墙 / 灰蓝顶 / 青蓝辉光', mood: '医疗、洁净、无尘', motif: '生命体征屏、急救流程、药品编号' },
  armory:   { palette: '暖灰黄墙 / 暗褐顶 / 琥珀辉光', mood: '军械、条例、秩序', motif: '武器条例铭牌、弹药标识、靶道刻度' },
  warehouse:{ palette: '中性灰白墙 / 钢灰顶 / 暖黄辉光', mood: '仓储、编号、尺度感', motif: '货位编号牌、载荷牌、出库流程图' }
};

// ---- 每间房的排布 spec -----------------------------------------
// rect / poly / doors / tasks / pipes 一律由现状快照注入，不在此重复。
// zones  : 功能分区（可视化淡色块 + 聚组校验）
// spines : 主通道带 [x,y,w,h]，掩体禁入
// anchors: 大件锚点（手工坐标）
// rows   : 沿墙成排（side=t/b/l/r，from/to 是沿墙轴的可用区间）
// rings  : 环形阵列（会议座椅）
// walls  : 贴墙装饰（side + at 中心 + span 长度），自动避开门洞 / 管道口
// 所有 kind 都带房间前缀，asset = <room>__<zone>__<kind>__<i>
const SPECS = {
  // ---------------------------------------------------------------
  bridge: {
    zones: [
      { id: 'Z1', name: '导航台带', rect: [23, 25, 15, 3.2], role: '上墙左：三台同型导航台成排' },
      { id: 'Z2', name: '记录台带', rect: [43.2, 25, 15.8, 3.2], role: '上墙右：记录台 + 星图台' },
      { id: 'Z3', name: '议席核心', rect: [32, 28.5, 20, 8.5], role: '圆桌 + 环形座椅 + 四根结构柱，房间焦点' },
      { id: 'Z4', name: '显示墙带', rect: [22.8, 38, 32.8, 3], role: '下墙：四块全息屏成排，两端各一只边柜收口' }
    ],
    spines: [[26.8, 33, 2.4, 8], [56.8, 33, 2.4, 8], [39.8, 25, 2.4, 4.6], [53, 30.8, 9, 2.4]],
    anchors: [
      { x: 38, y: 29.8, w: 6, h: 6, kind: 'bridge_table', label: '圆桌', zone: 'Z3', tier: 'anchor' },
      { x: 33.4, y: 30.2, w: 1.2, h: 1.2, kind: 'bridge_column', label: '结构柱', zone: 'Z3', tier: 'mid' },
      { x: 48.6, y: 30.2, w: 1.2, h: 1.2, kind: 'bridge_column', label: '结构柱', zone: 'Z3', tier: 'mid' },
      { x: 33.4, y: 35.2, w: 1.2, h: 1.2, kind: 'bridge_column', label: '结构柱', zone: 'Z3', tier: 'mid' },
      { x: 48.6, y: 35.2, w: 1.2, h: 1.2, kind: 'bridge_column', label: '结构柱', zone: 'Z3', tier: 'mid' },
      { x: 22.8, y: 38.0, w: 2.6, h: 1.2, kind: 'bridge_sideboard', label: '边柜', zone: 'Z4', tier: 'accent' },
      { x: 53.0, y: 38.0, w: 2.6, h: 1.2, kind: 'bridge_sideboard', label: '边柜', zone: 'Z4', tier: 'accent' }
    ],
    rings: [
      { cx: 41, cy: 32.8, rx: 4.6, ry: 4.2, angles: [0, 60, 120, 180, 240, 300], w: 0.9, h: 0.9, kind: 'bridge_chair', label: '议席', zone: 'Z3', tier: 'accent' }
    ],
    rows: [
      { side: 't', from: 23, to: 37.6, count: 3, w: 4.2, h: 1.8, gap: 0.5, kind: 'bridge_navconsole', label: '导航台', zone: 'Z1', tier: 'mid' },
      { side: 't', from: 43.6, to: 59, count: 2, w: 4.4, h: 1.8, gap: 0.6, kind: 'bridge_recorddesk', label: '记录台', zone: 'Z2', tier: 'mid' },
      { side: 'b', from: 31, to: 55.6, count: 4, w: 5, h: 1.5, gap: 0.4, kind: 'bridge_holoscreen', label: '全息屏', zone: 'Z4', tier: 'mid' }
    ],
    walls: [
      { side: 'l', at: 30.5, span: 3.2, kind: 'bridge_starchart', label: '返航航线星图' },
      { side: 'l', at: 36, span: 3.0, kind: 'bridge_crest', label: '舰徽铭牌' },
      { side: 'r', at: 28.9, span: 1.6, kind: 'bridge_roster', label: '席次铭牌' },
      { side: 'r', at: 35.8, span: 2.6, kind: 'bridge_protocol', label: '会议规程屏' }
    ],
    sdxl: { seed: 101, prompt: 'sci-fi ship briefing room wall panel, warm ivory enamel, thin amber line chart of a return trajectory, brushed bronze frame, no text, flat front view' },
    design: '四门汇入圆桌环形通道；上墙两组、下墙一组沿墙成排，中央只放圆桌与环椅，柱阵做结构层次。'
  },

  // ---------------------------------------------------------------
  cam: {
    zones: [
      { id: 'Z1', name: '监控墙带', rect: [78.2, 27, 10.5, 2.6], role: '上墙：两段屏幕墙成组' },
      { id: 'Z2', name: '机柜带', rect: [86.4, 27.4, 2.4, 5], role: '右墙：备份机柜上下成列' },
      { id: 'Z3', name: '操作台角', rect: [78.2, 34.3, 3.4, 2.5], role: '左下：主控台 + 归档柜' }
    ],
    spines: [[78, 30.8, 4, 2.4], [82.8, 33, 2.4, 4]],
    anchors: [
      { x: 86.8, y: 27.3, w: 2.0, h: 1.3, kind: 'cam_codecrack', label: '编码机柜', zone: 'Z1', tier: 'accent' },
      { x: 78.3, y: 34.3, w: 1.2, h: 0.8, kind: 'cam_archivebox', label: '归档盒', zone: 'Z3', tier: 'accent' }
    ],
    rings: [],
    rows: [
      { side: 't', from: 78.3, to: 88.8, count: 2, w: 3.6, h: 1.3, gap: 0.6, kind: 'cam_screenwall', label: '监控墙', zone: 'Z1', tier: 'anchor' },
      { side: 'r', from: 27.6, to: 32.0, count: 2, w: 1.5, h: 1.2, gap: 0.3, kind: 'cam_servercab', label: '备份机柜', zone: 'Z2', tier: 'mid' },
      { side: 'b', from: 78.3, to: 81.5, count: 1, w: 3.0, h: 1.4, kind: 'cam_opsdesk', label: '主控台', zone: 'Z3', tier: 'mid' }
    ],
    walls: [
      { side: 'l', at: 28.6, span: 2.4, kind: 'cam_sectormap', label: '舱位编号图' },
      { side: 'b', at: 79.9, span: 2.8, kind: 'cam_shiftboard', label: '值班班次表' },
      { side: 't', at: 80.5, span: 2.2, kind: 'cam_wiring', label: '布线示意' },
      { side: 'r', at: 36.2, span: 1.4, kind: 'cam_statusstrip', label: '状态灯带' }
    ],
    sdxl: { seed: 201, prompt: 'spacecraft surveillance room wall plate, cold white-blue enamel, faint cyan grid of camera sectors, thin blue status bars, no text, flat front view' },
    design: '小舱沿墙三组：屏墙上、机柜右、操作台左下；中央留 L 形通道，两扇门都不被挡。'
  },

  // ---------------------------------------------------------------
  ecosys: {
    zones: [
      { id: 'Z1', name: '培养罐组', rect: [20.4, 59.1, 7, 2.8], role: '下墙左段：两只培养罐成组（左墙被门净空切开）' },
      { id: 'Z2', name: '东列育苗架', rect: [34.0, 47.3, 4.5, 11.5], role: '右墙与右上：育苗架 + 温控台' },
      { id: 'Z3', name: '中央种植场', rect: [22, 50, 13, 10], role: '巨树 / 水池 / 灌木，视觉焦点' },
      { id: 'Z4', name: '浇灌设备带', rect: [20.4, 47.3, 5, 2.2], role: '上墙左：浇灌台' }
    ],
    spines: [[26.8, 47, 2.4, 4], [17, 51.8, 4, 2.4], [35, 51.8, 4, 2.4], [28.8, 58, 2.4, 4]],
    anchors: [
      { x: 29, y: 52.4, w: 2.8, h: 2.8, kind: 'ecosys_tree', label: '巨树', zone: 'Z3', tier: 'anchor' },
      { x: 24.6, y: 52.6, w: 1.8, h: 1.8, kind: 'ecosys_oxygen', label: '氧气循环柱', zone: 'Z3', tier: 'mid' },
      { x: 22.5, y: 50.5, w: 1.6, h: 1.6, kind: 'ecosys_shrub', label: '灌木', zone: 'Z3', tier: 'accent' },
      { x: 31.2, y: 49.9, w: 1.6, h: 1.6, kind: 'ecosys_shrub', label: '灌木', zone: 'Z3', tier: 'accent' },
      { x: 31.6, y: 56.2, w: 1.6, h: 1.6, kind: 'ecosys_shrub', label: '灌木', zone: 'Z3', tier: 'accent' },
      { x: 33.0, y: 49.6, w: 1.6, h: 1.6, kind: 'ecosys_shrub', label: '灌木', zone: 'Z3', tier: 'accent' },
      { x: 20.6, y: 57.6, w: 1.6, h: 1.6, kind: 'ecosys_shrub', label: '灌木', zone: 'Z3', tier: 'accent' },
      { x: 33.0, y: 51.8, w: 1.6, h: 1.6, kind: 'ecosys_shrub', label: '灌木', zone: 'Z3', tier: 'accent' },
      { x: 27.0, y: 55.0, w: 1.6, h: 1.6, kind: 'ecosys_shrub', label: '灌木', zone: 'Z3', tier: 'accent' },
      { x: 31.6, y: 58.2, w: 1.6, h: 1.6, kind: 'ecosys_shrub', label: '灌木', zone: 'Z3', tier: 'accent' },
      { x: 22.8, y: 57.0, w: 4.0, h: 2.0, kind: 'ecosys_pond', label: '水池', zone: 'Z3', tier: 'accent' }
    ],
    rings: [],
    rows: [
      { side: 'b', from: 20.5, to: 27.2, count: 2, w: 2.6, h: 2.4, gap: 0.4, kind: 'ecosys_tank', label: '培养罐', zone: 'Z1', tier: 'mid' },
      { side: 'r', from: 56.3, to: 58.0, count: 1, w: 2.4, h: 1.4, kind: 'ecosys_growrack', label: '育苗架', zone: 'Z2', tier: 'mid' },
      { side: 't', from: 20.5, to: 25.2, count: 1, w: 2.8, h: 1.8, kind: 'ecosys_irrigation', label: '浇灌台', zone: 'Z4', tier: 'mid' },
      { side: 't', from: 30.6, to: 36.0, count: 1, w: 2.8, h: 1.8, kind: 'ecosys_climate', label: '温控台', zone: 'Z2', tier: 'mid' }
    ],
    walls: [
      { side: 'l', at: 48.6, span: 2.2, kind: 'ecosys_plantplate', label: '植物铭牌' },
      { side: 'b', at: 34.8, span: 2.6, kind: 'ecosys_flowchart', label: '水循环示意' },
      { side: 'r', at: 48.6, span: 2.2, kind: 'ecosys_scale', label: '浇灌刻度' },
      { side: 't', at: 23.4, span: 2.0, kind: 'ecosys_humid', label: '湿度计面板' }
    ],
    sdxl: { seed: 301, prompt: 'spacecraft hydroponics bay wall plate, pale green enamel, faint botanical line drawings of leaves and water cycle arrows, soft green glow, no text, flat front view' },
    design: '四门净空切开四面墙 → 设备只占墙中段，中央留给巨树 / 水池 / 灌木，按「大件—中件—配件」三层铺开。'
  },

  // ---------------------------------------------------------------
  power: {
    zones: [
      { id: 'Z1', name: '电控柜带', rect: [43, 47, 8, 2.6], role: '上墙直段：三台同型电控柜成排' },
      { id: 'Z2', name: '变压器带', rect: [50.2, 49.4, 2.6, 8.6], role: '右墙直段：变压器上下成列' },
      { id: 'Z3', name: '电闸带', rect: [43.4, 57.6, 7.6, 2.2], role: '下墙直段：两组电闸成排' }
    ],
    spines: [[41, 52.8, 4.5, 2.4]],
    anchors: [
      { x: 43.4, y: 49.6, w: 1.0, h: 0.8, kind: 'power_gauge', label: '巡检仪表', zone: 'Z1', tier: 'accent' },
      { x: 46.0, y: 49.6, w: 1.0, h: 0.8, kind: 'power_gauge', label: '巡检仪表', zone: 'Z1', tier: 'accent' }
    ],
    rings: [],
    rows: [
      { side: 't', from: 43.0, to: 51.0, count: 3, w: 2.4, h: 2.0, gap: 0.3, kind: 'power_switchgear', label: '电控柜', zone: 'Z1', tier: 'anchor' },
      { side: 'r', from: 49.4, to: 58.0, count: 2, w: 2.2, h: 2.4, gap: 1.2, kind: 'power_transformer', label: '变压器', zone: 'Z2', tier: 'mid' },
      { side: 'b', from: 43.4, to: 51.0, count: 2, w: 3.0, h: 1.8, gap: 0.6, kind: 'power_breakerbank', label: '电闸组', zone: 'Z3', tier: 'mid' }
    ],
    walls: [
      { side: 'l', at: 49, span: 2.4, kind: 'power_hvstripe', label: '高压警示条' },
      { side: 'r', at: 55.4, span: 2.6, kind: 'power_singleline', label: '单线接线图' },
      { side: 'b', at: 50.6, span: 2.6, kind: 'power_loadplate', label: '载荷铭牌' },
      { side: 't', at: 47.6, span: 2.2, kind: 'power_breakerlabel', label: '回路编号' }
    ],
    sdxl: { seed: 401, prompt: 'spacecraft power distribution room wall plate, warm amber enamel, high voltage hazard chevrons and a thin single-line circuit diagram, dark metal frame, no text, flat front view' },
    design: '单门 → 一条横向主通道；三面墙按「柜—变压器—电闸」各成一组，中间留检修场。'
  },

  // ---------------------------------------------------------------
  transit: {
    zones: [
      { id: 'Z1', name: '就餐区', rect: [54, 54.5, 2.8, 7.5], role: '左墙：两张餐桌成列' },
      { id: 'Z2', name: '出餐区', rect: [60, 54.3, 4, 7.2], role: '右墙：配餐台 + 饮料机' },
      { id: 'Z3', name: '餐具角', rect: [59.4, 57.8, 4, 4], role: '右后：餐具回收与暂存，绕开管道口净空' }
    ],
    spines: [[56.8, 54, 2.4, 11]],
    anchors: [
      { x: 60.4, y: 54.4, w: 1.6, h: 1.4, kind: 'transit_drinkbar', label: '饮料机', zone: 'Z2', tier: 'anchor' },
      { x: 59.6, y: 60.4, w: 1.6, h: 1.2, kind: 'transit_trayreturn', label: '餐具回收台', zone: 'Z3', tier: 'accent' }
    ],
    rings: [],
    rows: [
      { side: 'l', from: 55, to: 61.5, count: 2, w: 2.2, h: 1.8, gap: 0.6, kind: 'transit_diningtable', label: '餐桌', zone: 'Z1', tier: 'mid' },
      { side: 'r', from: 56.5, to: 60.8, count: 2, w: 3.2, h: 1.6, gap: 0.6, kind: 'transit_servicecounter', label: '配餐台', zone: 'Z2', tier: 'mid' },
      { side: 't', from: 62.2, to: 63.8, count: 1, w: 1.6, h: 1.2, kind: 'transit_platecart', label: '餐具车', zone: 'Z3', tier: 'mid' }
    ],
    walls: [
      { side: 'l', at: 57.2, span: 2.2, kind: 'transit_menuboard', label: '菜单板' },
      { side: 'r', at: 57.2, span: 2.2, kind: 'transit_servingrule', label: '配餐规程' },
      { side: 'b', at: 55.2, span: 2.0, kind: 'transit_queuemark', label: '排队标识' },
      { side: 't', at: 62.2, span: 2.0, kind: 'transit_ration', label: '配给告示' }
    ],
    sdxl: { seed: 501, prompt: 'spacecraft canteen wall board, warm cream enamel, faint orange menu row lines and simple tray pictograms, thin metal frame, no readable text, flat front view' },
    design: '上下门同轴 → 一条贯通主通道把舱分成「左就餐 / 右出餐」两区；同类沿墙成列，右下角留餐具角。'
  },

  // ---------------------------------------------------------------
  // 用户点名：娱乐室原先「散点纷杂」。改为四象限分区 + 中央通道。
  fun: {
    zones: [
      { id: 'Z1', name: '街机廊', rect: [75.2, 50.2, 3.2, 7.6], role: '左墙直段：三台同型街机成一列，等距、同朝向' },
      { id: 'Z2', name: '模拟区', rect: [78.2, 47.2, 3.8, 8], role: '上墙左段两台模拟机 + 点唱机，紧邻街机廊' },
      { id: 'Z3', name: '桌游区', rect: [86.2, 49.6, 6.4, 6], role: '右上：两张同型娱乐桌并排 + 四张高凳' },
      { id: 'Z4', name: '休息区', rect: [89.8, 50.6, 5, 7.4], role: '右墙：两张沙发成列 + 矮几，避开管道口净空' }
    ],
    spines: [[82.8, 47, 2.4, 6], [81.8, 55, 2.4, 6]],
    anchors: [
      { x: 79.6, y: 52.4, w: 1.6, h: 1.6, kind: 'fun_jukebox', label: '点唱机', zone: 'Z2', tier: 'anchor' },
      { x: 86.4, y: 50.2, w: 2.8, h: 1.5, kind: 'fun_gametable', label: '娱乐桌', zone: 'Z3', tier: 'mid' },
      { x: 89.5, y: 50.2, w: 2.8, h: 1.5, kind: 'fun_gametable', label: '娱乐桌', zone: 'Z3', tier: 'mid' },
      { x: 87.0, y: 52.4, w: 0.8, h: 0.8, kind: 'fun_stool', label: '高凳', zone: 'Z3', tier: 'accent' },
      { x: 90.0, y: 52.4, w: 0.8, h: 0.8, kind: 'fun_stool', label: '高凳', zone: 'Z3', tier: 'accent' },
      { x: 87.8, y: 53.4, w: 0.8, h: 0.8, kind: 'fun_stool', label: '高凳', zone: 'Z3', tier: 'accent' },
      { x: 90.8, y: 53.4, w: 0.8, h: 0.8, kind: 'fun_stool', label: '高凳', zone: 'Z3', tier: 'accent' },
      { x: 90.0, y: 55.0, w: 2.0, h: 1.2, kind: 'fun_coffeetable', label: '矮几', zone: 'Z4', tier: 'accent' }
    ],
    rings: [],
    rows: [
      { side: 'l', from: 50.2, to: 57.9, count: 3, w: 2.6, h: 2.1, gap: 0.2, kind: 'fun_arcade', label: '街机', zone: 'Z1', tier: 'mid' },
      { side: 't', from: 78.2, to: 81.6, count: 2, w: 1.5, h: 1.8, gap: 0.2, kind: 'fun_racer', label: '赛车机', zone: 'Z2', tier: 'mid' },
      { side: 'r', from: 50.6, to: 57.8, count: 2, w: 2.4, h: 2.2, gap: 0.5, kind: 'fun_sofa', label: '沙发', zone: 'Z4', tier: 'mid' }
    ],
    walls: [
      { side: 't', at: 89.0, span: 3.0, kind: 'fun_neonsign', label: '霓虹招牌' },
      { side: 'l', at: 51.2, span: 2.2, kind: 'fun_machineid', label: '机台编号' },
      { side: 'r', at: 53.0, span: 2.6, kind: 'fun_poster', label: '游戏海报' },
      { side: 'b', at: 78.6, span: 2.2, kind: 'fun_safetyline', label: '安全提示' }
    ],
    sdxl: { seed: 601, prompt: 'spacecraft recreation room neon wall sign, pale violet enamel, soft magenta and cyan neon tubing in geometric arcs, dark purple frame, no text, flat front view' },
    design: '参考现实街机厅：一条中央主通道把舱切成四象限——左墙是等距同朝向的机廊，上墙左段接模拟机，右上两张同型桌游桌配高凳，右墙沙发成列。每象限只放 1–2 类道具，大件沿墙、小件贴附大件，中央留活动场；不再像原预案那样把不同机型散点撒满全舱。'
  },

  // ---------------------------------------------------------------
  engine: {
    zones: [
      { id: 'Z1', name: '反应堆列', rect: [2.2, 48.3, 3.4, 9.7], role: '左墙直段：三组同型反应堆成列' },
      { id: 'Z2', name: '缸体带', rect: [4.2, 44.2, 9.8, 2.4], role: '上墙直段：三组缸体成排' },
      { id: 'Z3', name: '检修区', rect: [4.3, 57.6, 6, 2.4], role: '下墙直段：零件车 + 工具台' }
    ],
    spines: [[12, 51.8, 4, 2.4]],
    anchors: [
      { x: 8.6, y: 50.6, w: 2.2, h: 1.4, kind: 'engine_toolbench', label: '工具台', zone: 'Z3', tier: 'accent' },
      { x: 10.6, y: 52.6, w: 1.4, h: 1.2, kind: 'engine_fusepanel', label: '保险盘', zone: 'Z3', tier: 'accent' }
    ],
    rings: [],
    rows: [
      { side: 'l', from: 48.5, to: 57.8, count: 3, w: 3.0, h: 2.6, gap: 0.6, kind: 'engine_reactor', label: '反应堆', zone: 'Z1', tier: 'anchor' },
      { side: 't', from: 4.2, to: 14.0, count: 3, w: 2.8, h: 2.0, gap: 0.5, kind: 'engine_cylinder', label: '缸体', zone: 'Z2', tier: 'mid' },
      { side: 'b', from: 4.3, to: 9.6, count: 2, w: 2.4, h: 1.8, gap: 0.4, kind: 'engine_partscart', label: '零件车', zone: 'Z3', tier: 'mid' },
      { side: 'r', from: 46.3, to: 48.0, count: 1, w: 2.2, h: 1.6, kind: 'engine_compressor', label: '空压机', zone: 'Z2', tier: 'mid' }
    ],
    walls: [
      { side: 'l', at: 46.2, span: 2.2, kind: 'engine_heatwarn', label: '高温警示' },
      { side: 't', at: 9.0, span: 2.6, kind: 'engine_serviceplate', label: '检修铭牌' },
      { side: 'b', at: 8.0, span: 2.4, kind: 'engine_pipediagram', label: '缸体管线图' },
      { side: 'r', at: 58.2, span: 1.8, kind: 'engine_gauge', label: '压力表盘' }
    ],
    sdxl: { seed: 701, prompt: 'spacecraft engine room wall plate, warm orange enamel, heat hazard stripes and a thin schematic of piston cylinders and pipes, soot stained dark frame, no text, flat front view' },
    design: '单门右进 → 左侧反应堆列、上墙缸体带、下墙检修区，三组成排；中间大块留空做检修与视线纵深。'
  },

  // ---------------------------------------------------------------
  // 用户点名：医疗间空。病床 / 药械 / 消毒 / 手术四区沿墙铺满，中央留通道。
  med: {
    zones: [
      { id: 'Z1', name: '病床区', rect: [46.3, 78.2, 9.2, 3.4], role: '上墙左：三张病床 + 输液架' },
      { id: 'Z2', name: '手术区', rect: [51, 83.4, 8, 3.6], role: '中央下：手术台 + 监护仪' },
      { id: 'Z3', name: '药械区', rect: [61, 78.2, 2.8, 11], role: '右墙：药柜与消毒柜上下分段' },
      { id: 'Z4', name: '后勤带', rect: [50, 87.6, 11, 2.2], role: '下墙：补给推车成排' }
    ],
    spines: [[56.8, 78, 2.4, 4.6], [46, 82.8, 4.5, 2.4], [59.5, 81.8, 4.5, 2.4]],
    anchors: [
      { x: 53.2, y: 84.4, w: 3.6, h: 2.0, kind: 'med_surgery', label: '手术台', zone: 'Z2', tier: 'anchor' },
      { x: 52.6, y: 83.6, w: 1.0, h: 0.8, kind: 'med_monitor', label: '监护仪', zone: 'Z2', tier: 'accent' },
      { x: 56.6, y: 83.6, w: 1.0, h: 0.8, kind: 'med_monitor', label: '监护仪', zone: 'Z2', tier: 'accent' },
      { x: 50.0, y: 80.9, w: 1.2, h: 1.4, kind: 'med_ventilator', label: '呼吸机', zone: 'Z1', tier: 'accent' },
      { x: 52.0, y: 80.9, w: 1.2, h: 1.4, kind: 'med_ventilator', label: '呼吸机', zone: 'Z1', tier: 'accent' }
    ],
    rings: [],
    rows: [
      { side: 't', from: 46.5, to: 55.4, count: 3, w: 2.6, h: 2.4, gap: 0.4, kind: 'med_bed', label: '病床', zone: 'Z1', tier: 'mid' },
      { side: 'r', from: 78.4, to: 80.6, count: 2, w: 2.4, h: 1.0, gap: 0.1, kind: 'med_medcab', label: '药柜', zone: 'Z3', tier: 'mid' },
      { side: 'r', from: 85.4, to: 89.6, count: 2, w: 2.4, h: 1.5, gap: 0.4, kind: 'med_sterilizer', label: '消毒柜', zone: 'Z3', tier: 'mid' },
      { side: 'b', from: 50, to: 60.4, count: 3, w: 2.8, h: 1.8, gap: 0.4, kind: 'med_supplycart', label: '补给推车', zone: 'Z4', tier: 'mid' }
    ],
    walls: [
      { side: 't', at: 52.4, span: 2.6, kind: 'med_vitalscreen', label: '生命体征屏' },
      { side: 'l', at: 87.4, span: 2.0, kind: 'med_triagechart', label: '急救流程图' },
      { side: 'b', at: 56.4, span: 2.6, kind: 'med_sterilerule', label: '消毒规程' },
      { side: 'r', at: 82.8, span: 1.8, kind: 'med_drugindex', label: '药品编号' }
    ],
    sdxl: { seed: 801, prompt: 'spacecraft medical bay wall panel, clean cool white enamel, faint cyan vital-sign waveform and a thin clinical grid, pale blue frame, no text, flat front view' },
    design: '三扇门形成 T 形主通道；四面墙全部利用：上墙病床、右墙药械、下墙补给、中央手术台做焦点，密度由 14.5% 提到 25% 以上，仍保持分区清晰。'
  },

  // ---------------------------------------------------------------
  armory: {
    zones: [
      { id: 'Z1', name: '枪架带', rect: [75.4, 75.8, 15.2, 2.2], role: '下墙：三段不同型号枪架成排' },
      { id: 'Z2', name: '发放与弹药', rect: [75.3, 65.3, 3.4, 10.3], role: '左墙与上墙左：发放台 + 弹药箱' },
      { id: 'Z3', name: '工作区', rect: [81.2, 70.2, 5.6, 2.4], role: '中央：工作台 + 台钳' },
      { id: 'Z4', name: '靶道区', rect: [88.4, 68.8, 2.4, 7.2], role: '右墙：靶道架上下两段，绕开任务点' }
    ],
    spines: [[81.8, 65, 2.4, 5], [75, 69.8, 4.5, 2.4]],
    anchors: [
      { x: 81.5, y: 70.4, w: 3.2, h: 1.8, kind: 'armory_workbench', label: '工作台', zone: 'Z3', tier: 'anchor' },
      { x: 85.2, y: 70.6, w: 1.2, h: 1.2, kind: 'armory_vise', label: '台钳', zone: 'Z3', tier: 'accent' },
      { x: 88.7, y: 69.0, w: 2.0, h: 2.0, kind: 'armory_targetlane', label: '靶道架', zone: 'Z4', tier: 'mid' },
      { x: 88.7, y: 73.9, w: 2.0, h: 2.0, kind: 'armory_targetlane', label: '靶道架', zone: 'Z4', tier: 'mid' }
    ],
    rings: [],
    rows: [
      { side: 'b', from: 75.5, to: 90.5, count: 3, w: 4.4, h: 1.6, gap: 0.4, kind: 'armory_gunrack', label: '枪架', zone: 'Z1', tier: 'anchor' },
      { side: 'l', from: 73.6, to: 75.8, count: 1, w: 2.2, h: 1.8, kind: 'armory_ammocrate', label: '弹药箱', zone: 'Z2', tier: 'mid' },
      { side: 't', from: 75.5, to: 80.4, count: 2, w: 2.2, h: 1.6, gap: 0.4, kind: 'armory_issuedesk', label: '发放台', zone: 'Z2', tier: 'mid' }
    ],
    walls: [
      { side: 't', at: 77.4, span: 2.4, kind: 'armory_regulation', label: '武器条例铭牌' },
      { side: 'l', at: 66.6, span: 1.8, kind: 'armory_ammomark', label: '弹药标识' },
      { side: 'b', at: 87.6, span: 2.6, kind: 'armory_safetyrule', label: '安全规程' },
      { side: 'r', at: 76.6, span: 2.0, kind: 'armory_rangegrade', label: '靶道刻度' }
    ],
    sdxl: { seed: 901, prompt: 'spacecraft armory wall plate, warm grey-yellow enamel, thin amber regulation lines and a faint weapon rack silhouette diagram, dark olive frame, no text, flat front view' },
    design: '进门发放台 → 中央工作台 → 下墙枪架的次序；右墙靶道分两段绕开任务点，全舱按「领取—维护—存放」动线分区。'
  },

  // ---------------------------------------------------------------
  warehouse: {
    zones: [
      { id: 'Z1', name: '左货架阵列', rect: [23.5, 4.8, 13.5, 7.2], role: '四列纵向货架，行距 3.7 格' },
      { id: 'Z2', name: '右货架阵列', rect: [44.3, 4.8, 13, 7.2], role: '四列纵向货架，绕开管道口' },
      { id: 'Z3', name: '出库区', rect: [58.4, 9, 5.6, 5.6], role: '下墙右：打包台 + 出库终端' },
      { id: 'Z4', name: '收货区', rect: [23.4, 3.2, 8, 1.6], role: '上墙左：收货台' }
    ],
    spines: [[39.8, 10, 2.4, 5], [21, 12, 17, 2.0]],
    anchors: [
      { x: 23.9, y: 5.0, w: 1.4, h: 6.9, kind: 'warehouse_rack_west', label: '货架①军械', zone: 'Z1', tier: 'anchor' },
      { x: 27.6, y: 5.0, w: 1.4, h: 6.9, kind: 'warehouse_rack_west', label: '货架②医疗', zone: 'Z1', tier: 'anchor' },
      { x: 31.3, y: 5.0, w: 1.4, h: 6.9, kind: 'warehouse_rack_west', label: '货架③机甲', zone: 'Z1', tier: 'anchor' },
      { x: 35.0, y: 5.0, w: 1.4, h: 6.9, kind: 'warehouse_rack_west', label: '货架④通用', zone: 'Z1', tier: 'anchor' },
      { x: 44.5, y: 5.0, w: 1.4, h: 6.9, kind: 'warehouse_rack_east', label: '货架⑤液体', zone: 'Z2', tier: 'anchor' },
      { x: 48.2, y: 5.0, w: 1.4, h: 6.9, kind: 'warehouse_rack_east', label: '货架⑥电子', zone: 'Z2', tier: 'anchor' },
      { x: 51.9, y: 5.0, w: 1.4, h: 6.9, kind: 'warehouse_rack_east', label: '货架⑦补给', zone: 'Z2', tier: 'anchor' },
      { x: 56.0, y: 5.0, w: 1.4, h: 6.9, kind: 'warehouse_rack_east', label: '货架⑧待出库', zone: 'Z2', tier: 'anchor' },
      { x: 59.0, y: 9.2, w: 2.4, h: 1.6, kind: 'warehouse_terminal', label: '出库终端', zone: 'Z3', tier: 'mid' },
      { x: 25.6, y: 8.0, w: 1.0, h: 1.0, kind: 'warehouse_pallet', label: '托盘', zone: 'Z1', tier: 'accent' },
      { x: 29.3, y: 8.0, w: 1.0, h: 1.0, kind: 'warehouse_pallet', label: '托盘', zone: 'Z1', tier: 'accent' },
      { x: 33.0, y: 8.0, w: 1.0, h: 1.0, kind: 'warehouse_pallet', label: '托盘', zone: 'Z1', tier: 'accent' }
    ],
    rings: [],
    rows: [
      { side: 'b', from: 58.6, to: 61.8, count: 1, w: 2.6, h: 1.4, kind: 'warehouse_packbench', label: '打包台', zone: 'Z3', tier: 'mid' },
      { side: 't', from: 23.5, to: 31.4, count: 2, w: 3.4, h: 1.2, gap: 0.4, kind: 'warehouse_receiving', label: '收货台', zone: 'Z4', tier: 'mid' }
    ],
    walls: [
      { side: 't', at: 36.2, span: 2.6, kind: 'warehouse_slotindex', label: '货位编号牌' },
      { side: 'b', at: 51.0, span: 2.6, kind: 'warehouse_outflow', label: '出库流程图' },
      { side: 'l', at: 8.4, span: 2.4, kind: 'warehouse_zoneplate', label: '区域标识' },
      { side: 'r', at: 9.2, span: 2.4, kind: 'warehouse_loadplate', label: '安全载荷牌' }
    ],
    sdxl: { seed: 1001, prompt: 'spacecraft cargo bay wall plate, neutral grey-white enamel, thin amber slot-number grid and a subtle load-limit scale, steel frame, no readable text, flat front view' },
    design: '两组各四列纵向货架，中间对齐门的 3.2 格主横通道，两端留端头通道；阵列本身就是层次，不再用零散货堆填空。'
  }
};

module.exports = { RULES, WORKFLOW, THEMES, SPECS };
