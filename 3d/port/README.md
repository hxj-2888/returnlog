# 2.5D 原文桩（移植参照，不参与运行）

本目录由 `node 3d/tools/gen-port-stubs.cjs` 生成：每个文件是**一个 2.5D 函数的逐字原文** +
一个空的 GDScript 桩。用途是「先复制，再改」——翻译时只做语法转换，不重新发明规则。

- `@src js/game.js:4285 die(a,cause,by)`：真源位置（文件:行 + 原签名）
- 注释块：2.5D 原文逐字保留（含缩进），改规则前先读它
- 桩函数：`TODO 逐行移植`

这些 `.gd` **不在** `3d/preview` 工程内，不会被 Godot 编译；它们只是移植工作单。
已完成的函数以 `3d/preview/scripts/**` 的实现为准，并在 `3d/spec/mapping-ledger.json` 登记。

重新生成：

```bash
node 3d/tools/gen-port-stubs.cjs --only knife,fireShot,die,dawn
node 3d/tools/gen-port-stubs.cjs --all --out 3d/port
```
