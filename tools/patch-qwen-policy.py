# -*- coding: utf-8 -*-
"""幂等补丁：落实 2026-11-07「允许使用千问模型生图」的用户裁定。

只更新**当前生效**的禁令与工具口径；CHANGELOG / ADR / 测试报告里的历史记录按项目惯例保留原文。
许可事实（Qwen Research License 非商用、转商用需换图或授权）一律保留，只是把「流程禁令」撤销。

用法： C:\\Python314\\python.exe tools/patch-qwen-policy.py
再次运行会逐条输出「已应用过」，不会重复写入。
"""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# (相对路径, 原文, 新文, 是否带 BOM)
PATCHES = [
    ('AGENTS.md',
     "   `assets/minigame/panel-*.png` 为 Qwen-Image 2.1 生成（Research License **非商用**，\n"
     "   用户 2026-11-06 裁定可用于本非商用项目；**后续补充 3D 美图素材一律 SDXL、\n"
     "   千问本地生图暂停**），来源与裁定记录见 `assets/minigame/CREDITS.md`。",
     "   `assets/minigame/panel-*.png` 为 Qwen-Image 2.1 生成（Research License **非商用**）。\n"
     "   **2026-11-07 用户裁定：解除「后续 3D 美图素材一律 SDXL / 千问本地生图暂停」的限制，\n"
     "   允许使用千问模型生图**（SDXL 与千问均可作为 3D 美术素材来源；出图仍须本地生成、\n"
     "   不调用线上生图）。项目仍为非商用试玩版、不发行，Qwen-Image 2.1 的 Research License\n"
     "   边界不变 —— 未来发行/商用须换成 Apache-2.0 的 Qwen 1.0 / SDXL 产物或取得商用授权。\n"
     "   历次裁定见 `assets/minigame/CREDITS.md`；千问出图入口见 §三工具表。", False),

    ('AGENTS.md',
     "| `3d/tools/gen-cover-refs.py` | 工具 | 本地 SDXL 按舱出参考图（10 舱 JOBS，固定 seed）；一次加载模型可连续出多张，产物 `3d/assets/refs/<room>.{png,json}` |",
     "| `3d/tools/gen-cover-refs.py` | 工具 | 本地 SDXL 按舱出参考图（10 舱 JOBS，固定 seed）；一次加载模型可连续出多张，产物 `3d/assets/refs/<room>.{png,json}` |\n"
     "| `3d/tools/gen-art-refs.ps1` | 美术工具 | 千问本地模型（Qwen-Image 2.1 Turbo）出 10 舱 / 26 任务参考图（768² / 8 步）；`npm run 3d:refs:cabin` / `3d:refs:tasks`，**必须 pwsh 7**；2026-11-07 解禁 |", False),

    ('assets/minigame/CREDITS.md',
     "- **用户裁定（2026-11-06）**：\n"
     "  1. 本项目为非商用试玩版，**已生成的这两张图可用于游戏内**（解除\n"
     "     `3d/HANDOFF.md` §1 原先「千问图不进运行时」的限制，仅限本目录既有两张）。\n"
     "  2. **后续补充 3D 美图素材一律采用 SDXL 保持风格一致，千问本地生图暂停使用。**",
     "- **用户裁定（2026-11-06，2026-11-07 更新）**：\n"
     "  1. 本项目为非商用试玩版，**千问生成的图可用于游戏内**（解除\n"
     "     `3d/HANDOFF.md` §1 原先「千问图不进运行时」的限制）。\n"
     "  2. **2026-11-07 裁定：解除「后续 3D 美图素材一律 SDXL / 千问本地生图暂停」，\n"
     "     允许使用千问模型生图**，SDXL 与千问均可作为 3D 美术素材来源。", False),

    ('3d/HANDOFF.md',
     "**美术分工（2026-11-06 用户裁定更新）**：游戏内场景/面板贴图沿用 **SDXL**；\n"
     "**后续补充 3D 美图素材一律 SDXL、千问本地生图暂停使用**。已生成的两张\n"
     "`assets/minigame/panel-*.png`（Qwen-Image 2.1，Research License 非商用）经用户裁定\n"
     "可用于本非商用项目的运行时（断口标注真源 `js/data/plates.js`，来源见\n"
     "`assets/minigame/CREDITS.md`）；若未来转商用需换图或另行授权。",
     "**美术分工（2026-11-07 用户裁定更新）**：**SDXL 与千问均可用于 3D 美术素材生成**\n"
     "（解除 2026-11-06「一律 SDXL / 千问暂停」的限制；出图仍须本地生成）。\n"
     "`assets/minigame/panel-*.png` 与千问新出图（Qwen-Image 2.1，Research License 非商用）\n"
     "可用于本非商用项目的运行时（断口标注真源 `js/data/plates.js`，来源见\n"
     "`assets/minigame/CREDITS.md`）；若未来转商用需换图或另行授权。", False),

    ('3d/HANDOFF.md',
     "Qwen      Qwen-Image 2.1 Turbo · Research License · 非商用 · 仅游戏外美术",
     "Qwen      Qwen-Image 2.1 Turbo · Research License · 非商用 · 2026-11-07 解禁，可用于游戏内（转商用需换图/授权）", False),

    ('3d/WORKFLOW_SDXL_BLENDER.md',
     "> 与 `AGENTS.md` §一-6 一致：**后续补充 3D 美图素材一律 SDXL，千问本地生图暂停**；\n"
     "> 已生成的两张 Qwen-Image 2.1 面板只作既有已裁定素材，不进本管线。",
     "> 与 `AGENTS.md` §一-6 一致（2026-11-07 更新）：**千问模型生图已解禁**，\n"
     "> SDXL 与千问均可作为 3D 美术素材来源；本管线仍以 SDXL 为主，千问出图走\n"
     "> `3d/tools/gen-art-refs.ps1`（tileable albedo 仍须四向镜像拼贴，不能拿概念图直接贴）。", False),

    ('README.md',
     "用户 2026-11-06 裁定可用于本非商用项目；**后续新增素材一律 SDXL、千问本地生图暂停**；",
     "**2026-11-07 裁定允许使用千问模型生图**（SDXL / 千问均可，须本地生成）；", False),

    ('3d/ASSETS.md',
     "## 千问美术参考（**游戏外**，不进运行时）",
     "## 千问美术素材（2026-11-07 解禁，可用于游戏内；转商用需换图/授权）", False),

    ('3d/ASSETS.md',
     "| 许可 | **Qwen Research License（非商用）**。仅游戏外参考；若要进包必须换 SDXL 或另行授权（AGENTS.md §一-6） |",
     "| 许可 | **Qwen Research License（非商用）**。2026-11-07 用户裁定可进本非商用项目运行时；若未来发行/商用须换 SDXL / Qwen 1.0 或另行授权（AGENTS.md §一-6） |", False),

    ('3d/ASSETS.md',
     "- 许可：SDXL 本地生成、项目自产；沿用 `AGENTS.md` §一-6「3D 美图素材一律 SDXL」。",
     "- 许可：SDXL 本地生成、项目自产；素材来源口径见 `AGENTS.md` §一-6（2026-11-07 起千问同步可用）。", False),

    ('tools/ship-layout-plan.md',
     "千问本地生图按 `AGENTS.md` §一-6 暂停，只保留既有两张已裁定面板。",
     "千问本地生图于 2026-11-07 解禁，SDXL / 千问均可作为 3D 美术素材来源（须本地生成）。", False),

    ('3d/README.md',
     "# 美术素材参考图（千问本地模型 · 游戏外参考，不进运行时）",
     "# 美术素材生成（千问本地模型 · 2026-11-07 解禁，可用于游戏内；须本地生成）", False),

    ('3d/tools/gen-panel-texture.py',
     "# 注意：按用户 2026-11-06 裁定，3D 美图素材一律 SDXL；千问只做游戏外美术。",
     "# 注意：2026-11-07 用户裁定解除「一律 SDXL / 千问暂停」；本脚本仍走 SDXL 高分辨率管线。", False),

    ('docs/调研报告_Blender_Godot_AI_MCP插件_20261106.md',
     "   千问本地生图保持暂停。",
     "   千问本地生图已于 2026-11-07 解禁（本调研时的旧约束，现按 AGENTS.md §一-6 新裁定执行）。", False),

    ('3d/tools/gen-art-refs.ps1',
     "# gen-art-refs.ps1 · 美术素材参考图（千问本地模型 · 游戏外参考，不进运行时）",
     "# gen-art-refs.ps1 · 美术素材生成（千问本地模型 · 2026-11-07 解禁，可用于游戏内）", True),

    ('3d/tools/gen-art-refs.ps1',
     "# 许可：Qwen Research License（非商用）。本批只是游戏外参考；\n"
     "#   若要进包必须换 SDXL 或另行授权（AGENTS.md §一-6 / HANDOFF §1）。",
     "# 许可：Qwen Research License（非商用）。2026-11-07 用户裁定可用于本非商用项目运行时；\n"
     "#   若未来发行 / 商用须换 SDXL / Qwen 1.0 或另行授权（AGENTS.md §一-6）。", True),

    ('3d/tools/gen-art-refs.ps1',
     'license      = "Qwen Research License (non-commercial). Out-of-game art reference only; shipping into the runtime requires SDXL or separate licensing (AGENTS.md red line 6)."',
     'license      = "Qwen Research License (non-commercial). 2026-11-07 user ruling: allowed for this non-commercial project, including in-game use; commercial release requires SDXL / Qwen 1.0 or separate licensing (AGENTS.md red line 6)."', True),
]


def main():
    changed = 0
    for rel, old, new, bom in PATCHES:
        p = os.path.join(ROOT, rel)
        enc = 'utf-8-sig' if bom else 'utf-8'
        with open(p, encoding=enc) as f:
            text = f.read()
        if new in text:
            print('  已应用过  %s' % rel)
            continue
        if old not in text:
            print('  !! 未命中 %s :: %s' % (rel, old.splitlines()[0][:60]))
            continue
        with open(p, 'w', encoding=enc, newline='') as f:
            f.write(text.replace(old, new, 1))
        changed += 1
        print('  已更新    %s' % rel)
    print('共更新 %d 处 / %d 条规则' % (changed, len(PATCHES)))


if __name__ == '__main__':
    main()
