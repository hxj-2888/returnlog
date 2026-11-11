> 本文件为 `AGENTS.md` 原章节的**逐字搬迁**（2026-11-11 工程规范化），章节正文未改写。
> 现行口径以根 `AGENTS.md` 与 `docs/ASSET_GOVERNANCE.md` 为准；本文件仅供按需查阅，其中的门禁读数 / 踩坑记录 / 清理记录属于历史，不是现行基线。

## 五、改动流程

1. **先问「2.5D 里这条在哪」**：在只读基线 `js/` 中检索（`js/game.js` / `js/ai/sanity.js` /
   `js/ai/traits.js` / `js/t2/*` / `js/data/*`）。找得到 → 照抄语义，数值走 `3d/preview/data/*.json`；
   找不到 → 按 §三.11 判维度产物，不许在 GDScript 里自造状态 / 计数器 / 阈值 / 系统。
2. **绝不手改只读基线**：`js/`、`assets/`、`audio/`、`tools/`（除 `sync-baseline.cjs`）与
   `package.json` 的 `version` / `gameVersion` 一律只读。确需上游变更时：
   去原仓 `C:\Users\ASUS\Desktop\新返航录` 改 → 跑原仓门禁 → 本工程 `npm run baseline:sync`
   → `npm run export:all` → `npm run check` → 再移植。
3. **改完必跑**：`npm run check` + 相关 Godot 无头自测；报告写**本次实跑**的「X 通过 / Y 失败」，
   失败按回归处理，不得沿用旧读数（§一.4）。
4. **数据契约变更**：`3d/preview/data/*.json` 的字段增删 / 语义变化必须升 `schema_version` 并写 ADR
   （`3d/DECISIONS.md`）；改了 `js/` 而没重导 → 对账会 FAIL，这是设计，不是 bug。
5. **留痕**：可见变更写 `3d/CHANGELOG.md`，工程级变更写根 `CHANGELOG.md`，决策写 `3d/DECISIONS.md`，
   每次导出记录源文件哈希（导出器已自动写入 `sources`）。
6. **提交**：中文，格式 `type(scope): 摘要`；不提交 `node_modules/` / `.godot/` / 日志 / 本机截图。
7. **验收层不反向驱动执行层**（原仓 `ARCHITECTURE.md` §8，2026-11-09 用户重申）：
   T3 读数（蒙特卡洛 / 胜率 / 救起数 / 门禁与自测结果）只作**事后记录**，
   不得作为当前批「某项改动该做 / 该回滚 / 是否达标」的依据，也不写「某读数 > 0 算通过」。
   T2 改动的论证依据只能是 `js/` 真源语义（写明文件与行号）或「真人会不会这样」。
   门禁与自测只用来回答「有没有写坏」，不用来回答「该不该做」。
   跨批次反馈须显式登记；**agent 不得自行跨批次立项**，建议只走提问清单。
8. **截图 / 机位 / 视觉验收严禁捕获鼠标**（2026-11-11 用户现场裁定，强制）：
   - 所有截图参数（`--shot / --crewshot / --doorshot / --mgshot / --devshot /
     --covershot / --ceilshot / --pipeshot / --meetshot / --endshot / --minishot /
     --homeshot`）必须走 `_screenshot_mode`：`Input.mouse_mode=VISIBLE`、
     `player.capture_mouse_on_ready=false`、不响应鼠标视角/攻击，退出 `_exit_tree()` 再释放。
   - 截图路径**禁止** `Input.mouse_mode=CAPTURED`、`Input.warp_mouse()` 或任何把光标锁进
     游戏窗口的 API；截图进程必须自行退出，运行前确认没有其它 Godot 进程占用鼠标。
   - `--probetest` / `--mousetest` 等**输入链自测不是截图**：若必须 CAPTURED，测完立即恢复
     VISIBLE，并在输出里标 `mouse=CAPTURED`；不得拿它冒充截图/机位验收。
   - 截图只作为本机验收图，按 §五.6 不入库；现有落地为 `main.gd::_screenshot_mode`、
     `player.capture_mouse_on_ready`，截图打印 `CREW_MOUSE mode=0` 作为读数。
