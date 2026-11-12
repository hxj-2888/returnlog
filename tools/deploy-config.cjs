/* 发布白名单单一真源 —— tools/deploy-pages.cjs 与 tools/asset-guard.cjs 共用。
 *
 * 依据 docs/ASSET_GOVERNANCE.md §3 / §7：
 *   「是否入库」「是否发布」「是否留在磁盘」是三个独立决策，必须分别声明。
 *   本文件只管「是否发布」；入库口径见 .gitignore，磁盘留存见 docs/ASSET_GOVERNANCE.md 附录 B。
 *
 * 背景：此前 .gitignore 已声明素材库 PNG 只在本机留档，但部署 SKIP 未同步排除，
 * 导致 78.03 MB 烘焙源材质 + 1.23 MB 渲染中间帧被上传（发布包虚胖到 124.85 MB）。
 *
 * 改动本文件必须同步检查两仓：3D 版 tools/ 属只读基线（BASELINE.sha256.json），
 * 由 npm run baseline:sync 从主仓拉取，不得在 3D 版手改。
 */
'use strict';

const ENTRIES = ['index.html', 'LICENSE', 'README.md', 'js', 'audio', 'assets'];

const SKIP = [
  /^assets\/scene\/v4\/facility\/_raw\//,            // L2 SDXL 候选原图
  /^assets\/scene\/v4\/tex\/(?!door-panel\.png$)/,   // L1 烘焙源材质（door-panel 是运行时依赖）
  /^assets\/qwen-lib\/.*\.png$/,                    // L1 千问素材库原图，Blender 构建期用
  /^assets\/scene\/v4\/facility\/_raw_fx\//,         // L2 Blender 渲染中间帧
  /\.md$/,                                          // L5 文档
];

module.exports = { ENTRIES, SKIP };
