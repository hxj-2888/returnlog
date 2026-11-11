# 会议面板 UI spec POC

生成时间：2026-11-11T05:00:25.322Z

> 由 `node 3d/tools/poc-meeting-ui.cjs` 生成。spec 是信息结构 / 状态 / 事件契约；
> 2.5D DOM 与 3D Control 都按它校验；POC 再用它生成一个 Godot Control 面板。

## 读数

- `UI-SPEC OK`：17 元素 / 17 DOM / 17 Godot / 11 模板 / 3 状态 / 6 事件。
- 生成面板：**pass=7 fail=0 nodes=17 templates=11 states=3**。

## 边界

- POC 只生成结构、文本、模板按钮与状态可见性；**不生成业务 handler**，也不替换运行时 `main.gd`。
- 2.5D 目前仍是 spec 的来源（DOM 是手写模板）；下一步才是让 2.5D 也消费 spec。
- 布局是功能结构，不是像素/HTML/CSS 翻译；像素排布仍属于 renderer。

## 复跑

```bash
node 3d/tools/poc-meeting-ui.cjs
```
