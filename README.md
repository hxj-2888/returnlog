# 新返航录（试玩版 · 返航录V3.7）

11 人类 vs 4 异形的实时太空船对抗网页游戏。零依赖前端、无构建、`file://` 可直接运行。

## 快速开始

- 直接打开 `index.html`；或 `npm start` 起本地静态服务。
- 门禁：`npm test` / `npm run ci:gate`
- T3 体检：`npm run t3:check`
- 资产门禁：`npm run guard` / `node tools/assets-check.cjs`
- 全平台发布：`npm run ship`

## AI 读取边界

单一真源：`AGENTS.md` §零。默认只读 `AGENTS → ARCHITECTURE → docs/00-先导 → 任务对应的 js/`；
默认不读 `tests/`、`tests/reports/`、`assets/` 二进制、`android/`、`tools/` 美术/发布、
`docs/changelog-history-*.md`（历史分卷）。不要全仓 grep。

## 目录

```
index.html            唯一加载清单
js/                   T1/T2 运行时（22 个模块）
audio/                T1 运行时音效
assets/               T1 运行时引用 + MANIFEST / 许可（二进制不默认读）
docs/                 规范（先导 / 验收 / 工作流 / 资产治理 / 历史分卷）
tests/                T3 可执行门禁、夹具与报告（默认不读）
3d/preview/data/      T3 导出快照；3d/tools/export-*.cjs 导出链
tools/                发布与美术管线（默认不读）
```

详细项目结构、门禁清单、3D 与部署说明已拆到 [docs/README-details.md](docs/README-details.md)。

## 规范入口

- [AGENTS.md](AGENTS.md) — 红线、命令与改动流程
- [ARCHITECTURE.md](ARCHITECTURE.md) — T1/T2/T3 三层架构
- [docs/00-先导-游戏体验.md](docs/00-先导-游戏体验.md) — 体验描述面
- [docs/acceptance.md](docs/acceptance.md) — T3 验收规范
- [docs/workflow.md](docs/workflow.md) — 本机命令与提交流程
- [docs/ASSET_GOVERNANCE.md](docs/ASSET_GOVERNANCE.md) — 资产治理
- [CHANGELOG.md](CHANGELOG.md) — 当前批次 + 索引；历史分卷在 `docs/changelog-history-*.md`

## 许可与署名

见 [LICENSE](LICENSE)、`assets/**/CREDITS.md` / `LICENSE.txt`、`audio/CREDITS.md`。素材署名不可删，二次分发同样适用。
