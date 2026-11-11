# 会议面板 UI spec 校验

生成时间：2026-11-11T05:02:18.252Z

- spec：`3d/spec/ui/meeting-panel.spec.json`（17 个元素 / 11 个模板）
- DOM：`js/ui/templates.js#meet` 覆盖 **17/17** 个元素；模板 11 个
- Godot：`main.gd#_build_meeting_ui` 覆盖 **17/17** 个字段；状态 3 / 事件 6
- 结果：**OK**（0 错误 / 0 警告）

## 边界

- 这是 UI **信息结构 / 状态 / 事件**契约，不是像素布局；
- 3D 的 `meeting_time` / `meeting_hint` 是 2.5D `#m-sub` / `#m-ph` 的拆分等价物，列在 `extra_3d`；
- 目前 2.5D DOM 是 spec 的来源，3D 是手工 Control；POC 已能从 spec 生成 Control，下一步才替换手写。
