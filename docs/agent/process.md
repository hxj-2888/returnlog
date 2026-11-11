> 本文件为 `AGENTS.md` 原章节的**逐字搬迁**（2026-11-11 工程规范化），章节正文未改写。
> 现行口径以根 `AGENTS.md` 与 `docs/ASSET_GOVERNANCE.md` 为准；本文件仅供按需查阅，其中的门禁读数 / 踩坑记录 / 清理记录属于历史，不是现行基线。

## 五、改动流程

1. 先读 `README.md`、本文件、`CHANGELOG.md` 最近条目。
2. 小步修改；涉及地图/寻路/会议/输入的改动，先 `npm start` 或直接 `file://` 冒烟。
3. 跑 `npm test`，确认「X 通过 / 0 失败」，并抽查 `tools/screenshots/` 的截图（元素存在 ≠ 像素可见）。
4. 更新 `CHANGELOG.md`（版本号 + 日期 + 实测读数）。
5. 提交并推送：**分支按 §一.13 拆分**——2.5D 主线推 `main`，3D 客户端推副分支（`v1-preview`），
   共享数据/美术管线随 main；不得整分支 merge 把 3D 客户端带进 main。
   `origin`(GitHub) 是发布目标，`gitee` 是镜像（失败只警告、不拦停）；GitHub 走代理、Gitee 直连，两条互为兜底。仓库简介保持「新返航录 · 返航录V3」口径。
