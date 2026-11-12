# 船员参考图（千问本地生成）

完整 768² 原图在素材层 `returnlog_assets/unreferenced/qwen21/3d/crew-refs/`（不入库）；
本目录是 640px 预览 + 生成清单，供仓库内追溯与评审。

生成：
```powershell
& "C:/Program Files/PowerShell/7/pwsh.exe" -File 3d/tools/gen-art-refs.ps1 -Set crew
```
模型/seed/prompt/许可见 `manifest.json`。Qwen-Image 2.1 Research License（非商用）。
建模脚本：`3d/tools/build-crew-rigged.py`；游戏内默认模型 `char_crew_lowpoly`。
