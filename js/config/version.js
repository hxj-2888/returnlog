/* ==== ARCH NODE · 架构节点标注（根 ARCHITECTURE.md） ====
 * layer     : T2
 * domain    : 空间与资源
 * definedBy : 角色数值与元信息
 * truth     : js/config/version.js#SKConfig.version
 * verify    : 门禁版本显示
 * flag      : F  (F=现行事实 / N=规范裁定)
 * note      : 版本单一真源
 * 说明      : 本注释只作架构标注，不改变任何运行逻辑；多父只引用不复制。
 * ============================================================== */
/* =============================================================
 * SKConfig · 版本与项目元信息（返航录V3.7 · 2026-11-11）
 * -------------------------------------------------------------
 * 职责：   全项目唯一的版本口径：显示名、构建日期、仓库地址。
 * 不变量： · 只读常量（Object.freeze），不读 DOM、不写业务状态；
 *          · 改版本只改这里 + package.json（displayVersion 同步），
 *            并在 CHANGELOG.md 记录；
 *          · 显示版本为「返航录V3.x」；package.json 的 3.x.0 是语义化镜像。
 * 依赖：   无。
 * 对外：   window.SKConfig
 * ============================================================= */
(function (global) {
  'use strict';

  global.SKConfig = Object.freeze({
    name: '新返航录',
    version: '返航录V3.7',
    build: '2026-11-11',
    license: 'MIT',
    repos: Object.freeze({
      github: 'https://github.com/hxj-2888/returnlog',
      gitee: 'https://gitee.com/hxj-2888/returnlog',
    }),
  });
})(typeof window !== 'undefined' ? window : globalThis);
