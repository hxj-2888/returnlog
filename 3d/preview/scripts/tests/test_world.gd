extends RefCounted
## 世界与美术自测：地图几何、地板、探针、船员动画、设备、供电
##
## 2026-11-12 从 main.gd 迁出（大文件拆分：main.gd 9,580 → 5,5xx 行）。
## 约定：全部 static，宿主实例经 __h 传入；本文件不持有任何状态，不直接读 Engine 单例。
## 调用：TestWorld._run_xxx(self)  —— 见 main.gd 的参数分发。

const MapBuilderScript := preload("res://scripts/map_builder.gd")
const SpaceData := preload("res://scripts/space_data.gd")
const TestAiPort := preload("res://scripts/tests/test_aiport.gd")
const TestProbe := preload("res://scripts/tests/test_probe.gd")

static func _run_arttest(__h) -> void:
	var themed := 0
	var wall_tints := {}
	for room: Dictionary in __h.map_data.get("rooms", []):
		if room.get("theme", null) != null:
			themed += 1
	var cover_n := 0
	var hz_min := 2.0
	var hz_max := 0.0
	var tints := {}
	for c: Dictionary in __h.map_data.get("cover", []):
		cover_n += 1
		var v: Dictionary = c.get("v", {})
		var hz := float(v.get("hz", 1.0))
		hz_min = minf(hz_min, hz)
		hz_max = maxf(hz_max, hz)
		tints[int(v.get("tint", 0))] = true
		for r: Dictionary in __h.map_data.get("rooms", []):
			if r.get("theme", null) == null:
				continue
			var w: Array = (r["theme"] as Dictionary).get("wall", [])
			if w.size() >= 3:
				wall_tints["%d-%d-%d" % [int(w[0] * 100), int(w[1] * 100), int(w[2] * 100)]] = true
	print("ART theme=%d/%d 墙面色差档=%d 色调档使用=%d 种 实例 hz=[%.2f,%.2f] 件数=%d" % [
		themed, __h.map_data.get("rooms", []).size(), wall_tints.size(), tints.size(), hz_min, hz_max, cover_n])
	## 2026-11-09 铁板验收：地图里**不允许有可见的** 1.70m 补高背板节点
	## （`sight_shell` = 背板+立柱+顶梁，`sightglow` = 缝）。资产没删，只在实例化时隐藏，
	## 所以 hidden 应等于「有 GLB 本体的 cover 件数 ×2」，visible 必须为 0。
	var st: Dictionary = __h.builder.sight_shell_stats()
	var sight_visible := 0
	var stack: Array = [__h.builder]
	while not stack.is_empty():
		var n: Node = stack.pop_back()
		for c in n.get_children():
			if c is GeometryInstance3D and String(c.name) in ["sight_shell", "sightglow"] \
					and (c as GeometryInstance3D).visible:
				sight_visible += 1
			stack.append(c)
	print("ART 铁板 hidden=%d show=%s 可见铁板节点=%d" % [
		int(st.get("hidden", 0)), str(bool(st.get("show", false))), sight_visible])
	# 一致性：落在掩体上的设备，base_y 必须 = 名义高度 × hz + 0.02
	var bad := 0
	var checked := 0
	for dev in __h.extras.devices:
		if not is_instance_valid(dev) or dev.point_index < 0:
			continue
		var p: Dictionary = (__h.map_data.get("points", []) as Array)[dev.point_index]
		var hit: Dictionary = {}
		for c: Dictionary in __h.map_data.get("cover", []):
			var cx := float(c.get("x", 0))
			var cy := float(c.get("y", 0))
			if p.x >= cx - 0.2 and p.x <= cx + float(c.get("w", 0)) + 0.2 \
					and p.y >= cy - 0.2 and p.y <= cy + float(c.get("h", 0)) + 0.2:
				hit = c
				break
		if hit == {}:
			continue
		checked += 1
		## 2026-11-07：被 cover 压住的点已由 scene_extras._task_placement() 重定位到
		## 掩体外侧台座（0.57m），不再站 cover 顶面。XZ 偏离原点位即视为重定位，
		## 期望值改为台座高度；否则仍按「名义高度 × hz + 0.02」对账。
		var px := float(p.get("x", 0.0))
		var py := float(p.get("y", 0.0))
		var relocated := Vector2(dev.global_position.x - px, dev.global_position.z - py).length() > 0.15
		var v: Dictionary = hit.get("v", {})
		var expect := 0.57
		if not relocated:
			expect = float(MapBuilderScript.COVER_HEIGHT.get(String(hit.get("kind", "")), 1.0)) \
				* float(v.get("hz", 1.0)) + 0.02
		if absf(dev.global_position.y - expect) > 0.001:
			bad += 1
			print("ART FAIL %s 箱体 %s hz=%.2f 设备 y=%.3f 期望=%.3f" % [
				dev.task_label, hit.get("kind"), float(v.get("hz", 1.0)), dev.global_position.y, expect])
	print("ART 设备顶面一致性 检查=%d 不一致=%d" % [checked, bad])


static func _run_floortest(__h) -> void:
	## 2026-11-07：地板口径自测。
	## 关键：不能「拿真源和自己比」—— want 和 got 都读同一份 JSON，永远相等，
	## 等于没测（第一版就是这么写的，注入漂移也照样 0 失败）。
	## 正确做法：检查**场景里真实建出来的地面网格** ——
	##   ① 地面 MeshInstance3D 的材质贴图名 = 真源的 tex
	##   ② 该网格 UV 的实际重复周期 = 真源的 repeat_m
	##   ③ 材质染色 = 真源的 tint
	## 注入漂移（改 JSON 或改 map_builder）时必须报 FAIL。
	var spec: Dictionary = MapBuilderScript.load_floor_spec()
	var fails: Array = []
	if spec.is_empty():
		print("FLOORTEST FAIL floor_spec 未加载")
		__h.get_tree().quit()
		return
	var rooms: Dictionary = spec.get("rooms", {})
	## 收集场景里所有 y≈0.02 的地面网格，按材质贴图归类
	var floors: Array = []
	for child in __h.builder.get_children():
		if not (child is MeshInstance3D):
			continue
		var mi: Variant = child as MeshInstance3D
		if absf(mi.position.y) > 0.5:
			continue
		var mat: Variant = mi.material_override as StandardMaterial3D
		if mat == null or mat.albedo_texture == null:
			continue
		var mesh: Variant = mi.mesh as ArrayMesh
		if mesh == null or mesh.get_surface_count() == 0:
			continue
		var arr: Variant = mesh.surface_get_arrays(0)
		var uvs: PackedVector2Array = arr[Mesh.ARRAY_TEX_UV]
		var verts: PackedVector3Array = arr[Mesh.ARRAY_VERTEX]
		if uvs.size() < 2 or verts.size() < 2:
			continue
		## UV 周期：取任意两个顶点，算 UV 差 / 世界距离差 = 1/repeat_m
		var per_m := 0.0
		for i in range(mini(verts.size(), 64)):
			for j in range(i + 1, mini(verts.size(), 64)):
				var dv: Variant = verts[j] - verts[i]
				var du: Variant = uvs[j] - uvs[i]
				var dworld := Vector2(dv.x, dv.z).length()
				if dworld < 0.5:
					continue
				var dtex: Variant = du.length()
				if dtex < 0.001:
					continue
				per_m = dtex / dworld
				break
			if per_m > 0.0:
				break
		## 2026-11-07：地板贴图开始按舱放在 textures/qwen/<rid>/ 子目录，
		## 只取文件名会把 6 个舱都读成 "floor"，既误判又失去按舱区分能力。
		## 改成相对 res://assets/textures/ 的路径（去掉 .png），与 floor_spec.tex 同口径。
		var tex_name := String(mat.albedo_texture.resource_path).replace("res://assets/textures/", "").replace(".png", "")
		floors.append({"tex": tex_name, "per_m": per_m,
			"tint": mat.albedo_color, "repeat": 1.0 / per_m if per_m > 0.0 else 0.0})
	if floors.is_empty():
		print("FLOORTEST FAIL 场景里没有找到地面网格")
		__h.get_tree().quit()
		return
	var checked := {}
	for rid: String in rooms.keys():
		var fs: Dictionary = rooms[rid]
		var want_tex := String(fs.get("tex", "")).replace(".png", "")
		var want_repeat := float(fs.get("repeat_m", 4.0))
		var tint: Variant = fs.get("tint", null)
		var want_tint := Color(1, 1, 1)
		if tint is Array and (tint as Array).size() >= 3:
			var arr2: Array = tint
			want_tint = Color(float(arr2[0]), float(arr2[1]), float(arr2[2]))
		var hit = null
		for f: Dictionary in floors:
			if String(f["tex"]) == want_tex and not checked.has(String(f["tex"]) + str(f["tint"])):
				hit = f
				break
		if hit == null:
			fails.append("%s 场景里找不到贴图 %s 的地面" % [rid, want_tex])
			continue
		checked[String(hit["tex"]) + str(hit["tint"])] = true
		var got_repeat := float(hit["repeat"])
		if absf(got_repeat - want_repeat) > 0.02:
			fails.append("%s 尺度 %.3f != 真源 %.3f" % [rid, got_repeat, want_repeat])
		var got_tint: Color = hit["tint"]
		var d := absf(got_tint.r - want_tint.r) + absf(got_tint.g - want_tint.g) + absf(got_tint.b - want_tint.b)
		if d > 0.02:
			fails.append("%s 染色 %s != 真源 %s" % [rid, str(got_tint), str(want_tint)])
	print("FLOORTEST 舱=%d 地面网格=%d 失败=%d %s" % [rooms.size(), floors.size(), fails.size(), str(fails)])


static func _run_probetest(__h) -> void:
	await TestProbe._run_probetest(__h)


static func _run_crewanimtest(__h) -> bool:
	var fails: Array = []
	__h.started = false
	if __h.sim == null or __h.crew_view == null:
		print("CREWANIMTEST FAIL sim/crew_view 缺失")
		return false
	__h.sim.meeting = {}
	__h.crew_view.set_model_mode(true)
	__h.crew_view.build(__h.sim)
	var actor_i: Variant = -1
	var victim_i: Variant = -1
	for a: Dictionary in __h.sim.agents:
		var i := int(a.get("i", -1))
		if i == int(__h.sim.me_idx):
			continue
		if bool(a.get("alien", false)) and actor_i < 0:
			actor_i = i
		elif not bool(a.get("alien", false)) and victim_i < 0:
			victim_i = i
	if actor_i < 0 or victim_i < 0 or not __h.crew_view._anims.has(actor_i) 			or not __h.crew_view._anims.has(victim_i):
		print("CREWANIMTEST FAIL 没有可用的 AI 动作模型")
		return false
	var a: Dictionary = __h.sim.agent(actor_i)
	var v: Dictionary = __h.sim.agent(victim_i)
	a["alive"] = true
	a["downed"] = false
	a["knife"] = 1
	v["alive"] = true
	v["downed"] = false
	if not __h.sim.knife(actor_i, victim_i):
		fails.append("sim.knife 没有成功")
	__h.crew_view.sync(__h.sim, 0.016)
	var ap_a: Variant = __h.crew_view._anims[actor_i] as AnimationPlayer
	var ap_v: Variant = __h.crew_view._anims[victim_i] as AnimationPlayer
	var knife_now := String(ap_a.current_animation)
	var down_now := String(ap_v.current_animation)
	var names: Variant = ap_a.get_animation_list()
	print("CREWANIMTEST clips=%s knife=%s down=%s" % [str(names), knife_now, down_now])
	for need: String in ["idle", "walk", "knife", "down"]:
		var has := false
		for n in names:
			if String(n).to_lower().contains(need):
				has = true
				break
		if not has:
			fails.append("缺动画 " + need)
	if not knife_now.to_lower().contains("knife"):
		fails.append("knife 没有触发（=%s）" % knife_now)
	if not down_now.to_lower().contains("down"):
		fails.append("down 没有触发（=%s）" % down_now)
	print("CREWANIMTEST %s %d 项失败 %s" % ["OK" if fails.is_empty() else "FAIL",
		fails.size(), str(fails)])
	return fails.is_empty()


## 人物 blockout 同框验收（2026-11-11）：在真实会议室并排摆
## 2.5D billboard / 3D blockout / 1.75 m 标尺，只做表现核对，不参与判定。


static func _run_devicetest(__h) -> void:
	__h._sim_gate = false
	## 与 --mgtest 同一条坑：会议开着时 _process 会把小游戏卡片收掉，
	## 旧夹具因此在开局讨论里恒报 open=false。先把会正常走完。
	__h._finish_meeting(__h.sim)
	await __h.get_tree().create_timer(0.3).timeout
	var kinds := {}
	for d in __h.extras.devices:
		kinds[d.kind] = true
	print("DEVICE_COUNT %d kinds=%d %s" % [__h.extras.devices.size(), kinds.size(), str(kinds.keys())])
	var dev = null
	for d in __h.extras.devices:
		if d.kind == "wire":
			dev = d
			break
	if dev == null:
		dev = __h.extras.devices[0]
	__h._open_device(dev)
	await __h.get_tree().process_frame
	await __h.get_tree().process_frame
	var opened: bool = __h.mg_layer.is_open() and __h.player.ui_locked
	print("DEVICE_TEST open=%s kind=%s locked=%s" % [
		str(__h.mg_layer.is_open()), dev.kind, str(__h.player.ui_locked)])
	__h.mg_layer.debug_solve()
	await __h.get_tree().create_timer(0.9).timeout
	var closed: bool = not __h.mg_layer.is_open() and not __h.player.ui_locked
	print("DEVICE_TEST closed=%s unlocked=%s" % [
		str(not __h.mg_layer.is_open()), str(not __h.player.ui_locked)])
	__h._devicetest_ok = opened and closed
	if not __h.extras.devices.is_empty():
		__h._open_device(__h.extras.devices[0])
		await __h.get_tree().process_frame
		__h.mg_layer.cancel()
		await __h.get_tree().create_timer(0.2).timeout
		print("DEVICE_CANCEL closed=%s unlocked=%s" % [
			str(not __h.mg_layer.is_open()), str(not __h.player.ui_locked)])


static func _run_powertest(__h) -> void:
	if __h.space.is_empty():
		print("POWERTEST FAIL space.json 缺失（先跑 node 3d/tools/export-space.cjs）")
		return
	var s0: Dictionary = __h.builder.light_stats()
	print("POWERTEST 供电 rooms=%d/%d corridor=%d/%d ambient=%.3f fill=%.3f" % [
		s0.rooms_on, s0.rooms, s0.corridor_on, s0.corridor, s0.ambient, s0.fill])
	__h.set_power(false)
	var s1: Dictionary = __h.builder.light_stats()
	var expect_amb: float = MapBuilderScript.BLACKOUT_AMBIENT
	print("POWERTEST 断电 rooms_on=%d corridor_on=%d ambient=%.3f 期望=%.3f 通过=%s" % [
		s1.rooms_on, s1.corridor_on, s1.ambient, expect_amb,
		str(s1.rooms_on == 0 and s1.corridor_on == 0 and absf(s1.ambient - expect_amb) < 0.001)])
	print("POWERTEST 断电 补光 fill=%.3f（预演期补光必须一起切，否则熄灯在画面上看不出来）" % s1.fill)

	# 门：开合/扫描是**模拟层状态**（sim.door_tick ← 2.5D doorTick）。
	# 断电时靠近，未满扫描秒数必须拦人；扫满才放行；离开重新上锁。
	var scan_sec: Variant = SpaceData.num(__h.space, "door", "scan_sec")
	var pass_r: Variant = SpaceData.num(__h.space, "door", "pass")
	var vis_door: Dictionary = __h.extras.doors[0]
	var door_key := String(vis_door.get("key", ""))
	var door: Dictionary = {}
	for sd: Dictionary in __h.sim.doors:
		if String(sd.get("key", "")) == door_key:
			door = sd
			break
	if door.is_empty():
		print("POWERTEST FAIL sim 与场景的门键对不上：%s" % door_key)
		return
	# 开局 pre 会议还挂着（2.5D doorTick 同样在会议期冻结）——测试里清掉它，
	# 只为了门能推进；真实对局里会议期间门就该冻着。
	__h.sim.meeting = {}
	var at2 := Vector2(float(door["x"]), float(door["y"]))
	var me_agent: Dictionary = __h.sim.agent(__h.sim.me_idx)
	var saved_pos: Vector2 = me_agent.get("pos", Vector2.ZERO)
	__h.sim.light_state = 2
	__h.sim.power_on = false
	# 2.5D doorTick 的 busy 只看 agent 位置：把人放到门口，才有"有人要过门"这件事。
	me_agent["pos"] = at2
	door["open"] = 0.0
	door["scan_t"] = 0.0
	__h.sim.door_tick(0.1)
	print("POWERTEST 门 0.1s scan=%.2f open=%.2f 拦人=%s（期望 scan<%.1f 且拦）" % [
		float(door["scan_t"]), float(door["open"]), str(float(door["open"]) <= pass_r), scan_sec])
	# 穿门方向的线段必须**垂直穿过**门缝（与门同向的线是平行线，segX 恒 false）
	var seg_a := Vector2(float(door["x"]), float(door["y"]) - 3.0) if bool(door["horiz"]) \
		else Vector2(float(door["x"]) - 3.0, float(door["y"]))
	var seg_b := Vector2(float(door["x"]), float(door["y"]) + 3.0) if bool(door["horiz"]) \
		else Vector2(float(door["x"]) + 3.0, float(door["y"]))
	var blocked_mid: bool = __h.sim.door_blocked_segment(seg_a.x, seg_a.y, seg_b.x, seg_b.y)
	var los_closed: bool = not __h.sim.los_now(seg_a.x, seg_a.y, seg_b.x, seg_b.y)
	print("POWERTEST 门 未扫满 doorBlockedSegment=%s los被门挡=%s（期望 true true）"
		% [str(blocked_mid), str(los_closed)])
	var steps := int(ceil(scan_sec / 0.1)) + 6
	for i in steps:
		__h.sim.door_tick(0.1)
	var los_open: bool = __h.sim.los_now(seg_a.x, seg_a.y, seg_b.x, seg_b.y)
	print("POWERTEST 门 %.1fs scan=%.2f open=%.2f 放行=%s los通=%s（期望 true true）" % [
		scan_sec, float(door["scan_t"]), float(door["open"]),
		str(float(door["open"]) > pass_r), str(los_open)])
	# 人离开 → 重新上锁（2.5D：离开后 scanT 归零）
	me_agent["pos"] = at2 + Vector2(14.0, 0.0)
	for i in 40:
		__h.sim.door_tick(0.1)
	print("POWERTEST 门 离开后 scan=%.2f open=%.2f 重新拦人=%s" % [
		float(door["scan_t"]), float(door["open"]), str(float(door["open"]) <= pass_r)])
	me_agent["pos"] = saved_pos
	__h.sim.light_state = 0
	__h.sim.power_on = true
	door = vis_door
	# 门扇几何：关闭时两扇必须在中线合拢（gap=0），完全打开时让出整段门洞（gap=2*half）。
	var half := float(door["half"])
	var off: Vector3 = door["offset"]
	var leaves: Array = door["leaves"]
	var blockers: Array = door["blockers"]
	__h.extras._apply_door_state(door, 0.0, pass_r, true, scan_sec)
	var c0: Vector3 = (leaves[0] as Node3D).position
	var c1: Vector3 = (leaves[1] as Node3D).position
	var gap_closed := absf(((c1 - off * (half * 0.5)) - (c0 + off * (half * 0.5))).dot(off))
	var closed_blocked: Variant = not (blockers[0]["shape"] as CollisionShape3D).disabled
	__h.extras._apply_door_state(door, 1.0, pass_r, true, scan_sec)
	c0 = (leaves[0] as Node3D).position
	c1 = (leaves[1] as Node3D).position
	var gap_open := absf(((c1 - off * (half * 0.5)) - (c0 + off * (half * 0.5))).dot(off))
	var open_blocked: Variant = not (blockers[0]["shape"] as CollisionShape3D).disabled
	print("POWERTEST 门扇 closed_gap=%.3f closed_blocked=%s open_gap=%.3f open_blocked=%s" % [
		gap_closed, str(closed_blocked), gap_open, str(open_blocked)])
	__h.extras._apply_door_state(door, 0.0, pass_r, true, scan_sec)
	__h.set_power(true)
	var s2: Dictionary = __h.builder.light_stats()
	print("POWERTEST 复电 rooms_on=%d corridor_on=%d ambient=%.3f" % [
		s2.rooms_on, s2.corridor_on, s2.ambient])
	# 三态：电路修好后合闸是 1（全舱全亮），不是常态 0（只亮亮舱）。
	# 2.5D refreshLight：st===1 → G.lit[r.id]=true for all rooms。
	var all_rooms: int = (__h.map_data.get("rooms", []) as Array).size()
	if __h.sim != null:
		__h.sim.power_fixed = true
		__h.sim.light_state = 2
		__h.apply_light_state(2)
		__h.sim.light_state = 1
		__h.apply_light_state(1)
	var s3: Dictionary = __h.builder.light_stats()
	print("POWERTEST 三态 全亮 rooms_on=%d/%d 通过=%s" % [
		s3.rooms_on, all_rooms, str(int(s3.rooms_on) == all_rooms)])
	if __h.sim != null:
		__h.sim.power_fixed = false
		__h.sim.light_state = 0
		__h.apply_light_state(0)

	# 电闸时长：拉闸 min(off_max, off_step×n)，合闸 on_default
	var br = null
	for dev in __h.extras.devices:
		if dev.point_index < 0:
			br = dev
			break
	if br == null:
		print("POWERTEST FAIL 找不到电闸设备")
		return
	if __h.sim != null:
		__h.sim.breaker_pulls = 0
		__h.sim.light_state = 0
	var seq: Array = []
	for i in 4:
		seq.append(String(__h._breaker_offer(br).get("hint", "")))
		if __h.sim != null:
			__h.sim.breaker_pulls += 1
	print("POWERTEST 拉闸时长序列 %s" % str(seq))
	if __h.sim != null:
		__h.sim.light_state = 2
	__h.power_on = false
	print("POWERTEST 合闸时长 %s" % String(__h._breaker_offer(br).get("hint", "")))
	if __h.sim != null:
		__h.sim.light_state = 0
	__h.power_on = true


## 交互收集自测：电闸 / 任务设备 / 管道 / 圆桌领取 / 补给，逐项站位读数。


static func _run_aiporttest(__h) -> void:
	TestAiPort._run_aiporttest(__h)


static func _run_audiotest(__h) -> void:
	if __h.audio == null:
		print("AUDIOTEST FAIL 没有 audio 节点")
		return
	__h.audio.play_music()
	var st: Dictionary = __h.audio.music_state()
	print("AUDIOTEST 音乐 文件=%s 时长=%.1fs 导入循环=%s 播放=%s" % [
		str(bool(st.get("file", false))), float(st.get("len", 0.0)),
		__h.audio.music_loop_param(), str(bool(st.get("playing", false)))])
	print("AUDIOTEST 音量 档=%.2f 增益=%.2f（%.1fdB）· 感知曲线 pow(v,0.7) 与 2.5D 一致" % [
		float(st.get("volume", 0.0)), float(st.get("gain", 0.0)),
		linear_to_db(maxf(0.001, float(st.get("gain", 0.0))))])
	print("AUDIOTEST 总线 Master=%.1fdB（音乐滑杆不再写总线）· 音效档=%.2f" % [
		AudioServer.get_bus_volume_db(0), __h.ui_panels.get_sfx()])
	__h.audio.set_listener(Vector2.ZERO)
	print("AUDIOTEST volAt d=0→%.2f d=9→%.2f d=18→%.2f（2.5D: 1.00 / 0.57 / 0.14）" % [
		__h.audio.vol_at(Vector2.ZERO), __h.audio.vol_at(Vector2(9, 0)), __h.audio.vol_at(Vector2(18, 0))])
	print("AUDIOTEST 音效开关 M=%s（2.5D SND.setOn 同义）" % str(__h.audio.is_on()))
	print("AUDIOTEST 采样 work=%s step=%s scream=%s door=%s（与 2.5D FILE 表对齐）" % [
		str(__h.audio.has_kind("work")), str(__h.audio.has_kind("step")),
		str(__h.audio.has_kind("scream")), str(__h.audio.has_kind("door"))])


## 门禁夹具：new_game 会开 MEET_PRE（开局公开讨论）、dawn 会开 MEET_DAY（全员会）。
## 会议期间 sim.tick 只推进会议相位、不推进夜钟（2.5D 的 MEET.pauseClock）。
## 想验「夜里」或「下一夜」的自测必须先把会正常走完；skip_discussion 是 2.5D
## 也有的玩家操作，不是改判定、也不是绕过验收。
