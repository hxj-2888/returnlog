# parseSpeech 差分 POC 读数

生成时间：2026-11-11T04:43:38.423Z

> 本报告由 `node 3d/tools/poc-parse-speech.cjs` 生成。fixtures 的期望值来自 2.5D
> `js/t2/decision.js#parseSpeech`，Godot 侧同时跑运行时手写解析器与 POC 生成解析器。

## 读数

- fixtures：**503** 条；运行时 'lines_data.parse_speech'：**503/503**；POC 生成解析器：**503/503**。

## 初始偏差（修复前，90/503 不一致）

- 3D 的 `names` 过滤了死亡/濒死席位，2.5D 只排除玩家自己；会议里提到死者时 3D 不识别。
- 3D 的席位匹配只认 `N号`，不认 2.5D `seatNo()` 的补零裸号 `07`。
- 3D 的席位正则没有排除玩家自己的席位（`1号` 被解析成 0 号玩家）。
- 3D 的 `%d号` 子串匹配导致 `12号` 同时命中 `2号`；2.5D 不会。
- 3D 把整段文本截到 80 字再解析；2.5D 只截 `raw`，解析仍用全文。

修复后运行时与生成解析器均为 503/503；fixtures 覆盖名称重叠、死亡席位、补零/中文席位、
六类 claim、否定/支持/投票/否认/时段/截断与 300 条确定性 fuzz。

## 边界（POC，不是生产 codegen）

- 词表 / 席位表 / 意图正则是从 `lines.json` 自动生成的；
- 控制流仍是 `parseSpeech` 的固定算法模板；通用 JS 控制流转译需要 IR 与上游 core 拆分；
- 见 `3d/reports/portability-audit.md` 的 B/C/D 层边界。

## 复跑

```bash
node 3d/tools/poc-gen-parse-speech.cjs
node 3d/tools/poc-parse-speech.cjs
```
