# 3D 批量模拟基线（2026-11-08T21:07:07 · v1-preview 批）

- 引擎：Godot 4.6 / `scripts/sim/sim_state.gd`，seed 20261108 起 100 局，dt=0.1，单局上限 2000 秒。
- **人类 68.0% / 异形 32.0% / 超时 0**（n=100）。2.5D 同口径 1000 局是 49.9/50.1/超时 0。
- 平均夜 3.18；场均发言 53.6 条 / 出刀 6.1 次 / 会议 5.3 次 / 末进度 39.0。
- 败因：维修 28 / 异形全部出局 40 / 人类全灭 32 / 超时 0。
- 驱逐 390 次（异形 211 / 人类 179，命中率 54.1%），末局存活异形 1.52。
- 存活：人类 4.30 / 异形 1.52；死亡 528 / 救起 165；超时局人类 0.00。
- 异形决策遥测：`{ "block_cap": 1262, "knife_try": 611, "knife_ok": 611, "block_crowd": 240, "block_bold": 57, "block_conceal": 353, "no_target": 308, "shot_ok": 5 }`。
- 用时 679.0 秒。发言 S 轨已接入，讨论段按 `MEET.discussNight` 真实推进。

## 口径说明（重要）

- 本批**包含**：pre/day/night 三相位会议链、`settleAccountability` 追责、`credBroadcast`
  信誉广播、RUSH 逃逸、异形开枪、异形补给链、红身 + seenBy 追踪、CONFIRM.nearR 证据分级、
  MISID 目击认错、cred/reliability 按目标记账、susAdd 递减增益、watchers/exposure 排除
  attention≠online、escapeCost(最近门距) + 光感半径 —— 即 parity-map 25 项清零的全部接线。
- 本批**不含**（批跑开始后追加、尚未回跑基线）：`note_testimony` 的 **DESC 描述失真**
  （roomErr 0.22 / kindErr 0.18 / confLoss 0.78，代码已接、基线待重跑）。
- **已知剩余偏差**：驱逐命中率 54.1% vs 2.5D 40%（2.5D 误逐占 59.98%）—— 构陷编排
  （FRAME 0.85 假口供 / COFRAME / FIRST / SOCIAL.pileOn）与领袖剧本未迁，人类指控质量偏高。
  这两组是 `parity-map.json#summary.pending_next_batch` 的下一批内容。
- 修复记录：`_dawn` 夜数双计 bug（白天会议与进夜并行）已修，本批夜数 3.18 为真实推进。
