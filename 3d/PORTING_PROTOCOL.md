# 2.5D → 3D 移植规程（现行）

> 2026-11-11 用户裁定：**3D 版直接沿用 2.5D**。3D 不是第二套规则，是同一套规则的 3D 表现层。
> 本文件是硬规程，违反即回退。

## 1. 唯一真源

| 内容 | 真源 | 3D 侧允许的形态 |
|---|---|---|
| 判定 / 状态机 / 数值 | `新返航录/js/`（`game.js`、`ai/*.js`、`t2/*.js`） | 逐函数移植 + `@src` 注释 |
| 空间 / 交互半径 / 站桩时长 | `js/ai/sanity.js`、`js/t2/space.js` | 由 `export-space.cjs` 导出到 `preview/data/space.json`，GDScript 只读 |
| 规则表 / AI 权重 / 语料 | `js/ai/*.js` | 由 `export-rules.cjs` / `export-lines.cjs` / `export-sim.cjs` 导出 |
| 美术 / 输入 | 无（3D 自有） | 只允许「输入映射」与「表现层」差异 |

## 2. 只允许三类差异

1. **输入映射**：2.5D 的 A/B/D 等键位 → 3D 的鼠标左右键、E/F/R/G/Q/V/B/C。
   目标选择必须仍然是 2.5D 的规则（例如 `stab()` / `shoot()` 都是「最近 + LOS」，
   **不是准星锥**）。
2. **表现层**：模型、材质、粒子、镜头、HUD 布局。表现可以不同，但不得反过来影响判定。
3. **性能**：距离预筛、缓存、批量更新。必须与逐条判定等价，且不得改变结果。

除此之外的一切差异都算**自造规则**，禁止。

## 3. 逐函数移植流程（先复制，再改）

> 文件级无法直接复制：2.5D 是 JS + DOM + Canvas，3D 是 GDScript + Godot 场景。
> 可控的复制单位是**函数**：原文逐字保留，桩先占位，翻译只做语法转换。

```bash
# 1) 生成原文桩（含 js 行号与逐字原文）
node 3d/tools/gen-port-stubs.cjs --only knife,fireShot,die,dawn

# 2) 在桩里逐行翻译；每个函数头保留 @src
#    # @src js/game.js:4226 knife(killer,victim)

# 3) 在 spec/gameplay-parity.json 登记映射
#    { "src": "js/game.js:knife", "target": "sim/sim_state.gd:knife", "status": "ported" }

# 4) 跑审阅：缺口必须逐条清零
npm run audit:parity

# 5) 提交前跑严格门禁
npm run audit:parity:strict
```

### 状态定义（`spec/gameplay-parity.json`）

| 状态 | 含义 | 要求 |
|---|---|---|
| `ported` | 逐行移植 | 守卫 / 字段写入不得有缺口 |
| `adapter` | 拆分到多个函数，或输入层适配 | 必须在 `note` 写清拆分点与差异 |
| `pending` | 尚未移植 | 禁止在 `--strict` 下提交 |
| `not-applicable` | 2.5D 的 DOM / Canvas / 主循环等不可 1:1 | 必须写理由 |

## 4. 审阅器做什么

`node 3d/tools/check-gameplay-parity.cjs`（`npm run audit:parity`）：

1. **函数映射**：扫描 2.5D 全部函数（当前 385 个）与 3D 实现，按 spec 表 → 同名归一化匹配。
2. **守卫对账**：抽 2.5D 的 `if (...) return`，检查 3D 实现里有没有对应标识符。
3. **状态写入对账**：抽 `.alive/.downed/.ghost/...` 的赋值，检查 3D 有没有写这个字段。
4. **3D 独有扫描**：有状态写入、但没有任何 2.5D 来源的函数 → 可疑自造规则。
5. **真源漂移**：`space.json` / `rules.json` 的 `sources` 指纹必须与当前 `js/` 一致。
6. **硬编码**：`GHOST_TASK_CAP` 等常量必须来自 `space.json`，不许在 GDScript 写死。

输出：`docs/agent/PARITY_REPORT.md` + `parity-report.csv`（逐函数明细）。

积压用 `budget` 预算制：允许当前缺口存在，但不许变差；每清一批就跑 `--update-baseline` 把预算压下去。

## 5. 已发生的事故（反例，必须记住）

| 事故 | 3D 自造的东西 | 2.5D 原文 |
|---|---|---|
| 濒死 12 秒必死 | `downedT = 12` + tick 里 `die()` | 没有倒地计时；天亮 `dawn()` 才判 `bled` |
| 第二刀必死 | `if downed: return die(v)` | `knife()` 直接 `return`（濒死者不能再刀） |
| 死亡弹「你已阵亡」 | 全屏结算面板 + `R` 重开 | `alive=false; ghost=true`，穿墙全视继续做任务（额度 1 分） |
| 刀不到脸前的人 | 相机点积 `> 0.55` | `stab()` 只取最近 + `losNow`，没有锥 |
| 枪贴脸打不中 | 相机点积 `> 0.90` | `shoot()` 只取最近 + `losNow` + `visibleAt` |
| 破坏可重复 | `sabUsed` 只在玩家入口记 | `damageRoom()` 自己记 `sabUsed`（AI 同一条） |

## 6. 提交前检查清单

- [ ] `npm run audit:parity:strict` → 不差于 `spec/gameplay-parity.json#budget`（缺口下降后 `--update-baseline` 收紧）
- [ ] 新增或修改的规则函数有 `@src`，并在 `spec/gameplay-parity.json` 登记
- [ ] 任何 `adapter` 的 `note` 写清了「拆到哪里」与「为什么不是逐行」
- [ ] 没有新增计时器、阈值、阵营过滤、状态分支（除非 `@deviation` + 用户裁定）
- [ ] `npm run guard` PASS、`npm run baseline:check` OK
