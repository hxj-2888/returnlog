extends SceneTree
## 只读分片蒙特卡洛夹具（1000 局参考基线用）
## ------------------------------------------------------------------
## 与 main.gd#_run_sim1000 **完全同口径**：dt=0.1 / 15 夜 / 17250 tick /
## 15 人全 AI、spectator、sim_run=true、map_v2.json + space.json。
## 唯一差别是 seed 段可指定，便于多进程并行跑满 1000 局；
## **不改动任何玩法 / 判定 / 数值 / AI 逻辑**，只读 sim 状态累计计数，
## 输出一行 `SIMSHARD <JSON>` 供外部合并成基线报告。
##
## 用法：
##   godot --headless --path 3d/preview --script res://scripts/tests/sim_shard.gd \
##     -- --shard 0 --games 63 --seed0 20261108

const SimScript := preload("res://scripts/sim/sim_state.gd")
const MAP_PATH := "res://data/map_v2.json"
const SPACE_PATH := "res://data/space.json"
const DT := 0.1
const MAX_NIGHTS := 15
const MAX_TICKS := 17250


func _load_json(p: String) -> Dictionary:
	var f := FileAccess.open(p, FileAccess.READ)
	if f == null:
		return {}
	var v: Variant = JSON.parse_string(f.get_as_text())
	return v if v is Dictionary else {}


func _arg(name: String, def: String) -> String:
	var args := OS.get_cmdline_user_args()
	var i := args.find("--" + name)
	if i >= 0 and i + 1 < args.size():
		return String(args[i + 1])
	return def


func _initialize() -> void:
	var shard := int(_arg("shard", "0"))
	var games := int(_arg("games", "10"))
	var seed0 := int(_arg("seed0", "20261108"))
	var map_data := _load_json(MAP_PATH)
	var space := _load_json(SPACE_PATH)
	if map_data.is_empty() or space.is_empty():
		print("SIMSHARD ERROR 数据加载失败")
		quit(1)
		return
	var out := _run(shard, games, seed0, map_data, space)
	# 结果独立落盘：父进程被中断时分片结果仍在磁盘，可续跑、可核对。
	var out_path := _arg("out", "")
	if out_path != "":
		var f := FileAccess.open(out_path, FileAccess.WRITE)
		if f != null:
			f.store_string(JSON.stringify(out))
			f.close()
	print("SIMSHARD " + JSON.stringify(out))
	quit(0 if int(out.get("done", 0)) == games else 1)


func _run(shard: int, games: int, seed0: int, map_data: Dictionary,
		space: Dictionary) -> Dictionary:
	var human_wins := 0
	var alien_wins := 0
	var timeouts := 0
	var why_stat: Dictionary = {"维修 45 分达成": 0, "异形全部出局": 0, "人类全灭": 0, "超时": 0}
	var eject_all := 0
	var eject_alien := 0
	var eject_human := 0
	var sum_nights := 0.0
	var sum_prog := 0.0
	var sum_chat := 0
	var sum_knife := 0
	var sum_meet := 0
	var sum_kill := 0
	var sum_revive := 0
	var sum_human_alive := 0.0
	var sum_alien_alive := 0.0
	var timeout_humans := 0.0
	var diag: Dictionary = {}
	var ev_stat: Dictionary = {}
	var done := 0
	var t0 := Time.get_ticks_msec()
	for g in games:
		var s = SimScript.new()
		s.sim_run = true
		if not s.new_game(seed0 + g, 0, map_data, space):
			continue
		s.spectator = true
		for k in MAX_TICKS:
			if bool(s.over) or int(s.night) > MAX_NIGHTS:
				break
			s.tick(DT)
		done += 1
		# 每 5 局报一次进度：并行跑批时必须能看见在推进，而不是黑盒等待。
		if (g + 1) % 5 == 0:
			print("SHARD_PROGRESS shard=%d done=%d/%d" % [shard, g + 1, games])
		if not bool(s.over):
			timeouts += 1
			why_stat["超时"] = int(why_stat["超时"]) + 1
		elif bool(s.over_win):
			human_wins += 1
		else:
			alien_wins += 1
		var wwhy := String(s.over_why)
		if why_stat.has(wwhy):
			why_stat[wwhy] = int(why_stat[wwhy]) + 1
		sum_nights += float(s.night)
		sum_prog += float(s.prog)
		var ha := 0
		var aa := 0
		for a: Dictionary in s.agents:
			if bool(a.get("alien", false)):
				if bool(a.get("alive", false)):
					aa += 1
				diag["hides"] = int(diag.get("hides", 0)) + int(a.get("_hides", 0))
			elif bool(a.get("alive", false)):
				ha += 1
		sum_human_alive += float(ha)
		sum_alien_alive += float(aa)
		if not bool(s.over):
			timeout_humans += float(ha)
		if s._ai_alien != null:
			for kk: String in s._ai_alien.stats.keys():
				diag[kk] = int(diag.get(kk, 0)) + int(s._ai_alien.stats[kk])
		for e: Dictionary in s.events:
			var kind := String(e.get("kind", ""))
			ev_stat[kind] = int(ev_stat.get(kind, 0)) + 1
			match kind:
				"chat": sum_chat += 1
				"knife": sum_knife += 1
				"meeting": sum_meet += 1
				"kill": sum_kill += 1
				"revive": sum_revive += 1
				"eject":
					eject_all += 1
					if bool(e.get("alien", false)):
						eject_alien += 1
					else:
						eject_human += 1
	return {
		"shard": shard, "seed0": seed0, "games": games, "done": done,
		"human_wins": human_wins, "alien_wins": alien_wins, "timeouts": timeouts,
		"why": why_stat, "eject_all": eject_all, "eject_alien": eject_alien,
		"eject_human": eject_human, "sum_nights": sum_nights, "sum_prog": sum_prog,
		"sum_chat": sum_chat, "sum_knife": sum_knife, "sum_meet": sum_meet,
		"sum_kill": sum_kill, "sum_revive": sum_revive,
		"sum_human_alive": sum_human_alive, "sum_alien_alive": sum_alien_alive,
		"timeout_humans": timeout_humans, "diag": diag, "ev_stat": ev_stat,
		"sec": float(Time.get_ticks_msec() - t0) / 1000.0,
	}
