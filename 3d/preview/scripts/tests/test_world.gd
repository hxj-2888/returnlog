extends RefCounted
## 世界与美术自测：地图几何、地板、探针、船员动画、设备、供电
##
## 2026-11-12 从 main.gd 迁出（大文件拆分：main.gd 9,580 → 5,5xx 行）。
## 约定：全部 static，宿主实例经 __h 传入；本文件不持有任何状态，不直接读 Engine 单例。
## 调用：TestWorld._run_xxx(self)  —— 见 main.gd 的参数分发。

const MapBuilderScript := preload("res://scripts/map_builder.gd")
const SpaceData := preload("res://scripts/space_data.gd")

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
	var fails: Array = []
	__h.role = "alien"
	__h.sim.ai_enabled = false
	if not __h.sim.new_game(__h._cur_seed, 0, __h.map_data, __h.space, true):
		print("PROBETEST FAIL new_game")
		__h._probetest_ok = false
		return
	__h.sim.spectator = false
	__h._finish_meeting(__h.sim)
	__h.sim.meeting = {}
	if __h.crew_view != null:
		__h.crew_view.build(__h.sim)
		print("CREW_VIEW models=%d billboards=%d" % [
			__h.crew_view._models.size(), __h.crew_view._sprites.size()])
		# 漂移回归：moving=true 必须切 walk，回到静止必须切 idle。
		var anim_i: Variant = -1
		for a: Dictionary in __h.sim.agents:
			var ai := int(a.get("i", -1))
			if ai != int(__h.sim.me_idx) and __h.crew_view._anims.has(ai):
				anim_i = ai
				break
		if anim_i >= 0:
			var aa: Dictionary = __h.sim.agent(anim_i)
			aa["moving"] = true
			__h.crew_view.sync(__h.sim, 0.016)
			var walk_now := String((__h.crew_view._anims[anim_i] as AnimationPlayer).current_animation)
			aa["moving"] = false
			__h.crew_view.sync(__h.sim, 0.016)
			var idle_now := String((__h.crew_view._anims[anim_i] as AnimationPlayer).current_animation)
			print("CREW_ANIM_SWITCH walk=%s idle=%s" % [walk_now, idle_now])
			if not walk_now.to_lower().contains("walk"):
				fails.append("moving=true 没有切 walk（=%s）" % walk_now)
			if not idle_now.to_lower().contains("idle"):
				fails.append("moving=false 没有切 idle（=%s）" % idle_now)
	var me: Dictionary = __h.sim.me()
	if not bool(me.get("alien", false)):
		fails.append("玩家没被设成异形")
	# 其他人先挪到远处：AI 关了但 tick 仍会跑，避免目标被别的逻辑拖走。
	var victim: Dictionary = {}
	for a: Dictionary in __h.sim.agents:
		if int(a.get("i", -1)) == int(__h.sim.me_idx):
			continue
		a["pos"] = Vector2(6.0, 6.0)
		a["path"] = PackedVector2Array()
		a["moving"] = false
		a["doing"] = 0.0
		if victim.is_empty() and not bool(a.get("alien", false)):
			victim = a
	if victim.is_empty():
		print("PROBETEST FAIL 夹具没找到人类目标")
		__h._probetest_ok = false
		return
	__h.player.global_position = Vector3(31.0, 0.05, 33.5)
	__h.player.rotation.y = 0.0   # 前方 -Z
	__h.player.ui_locked = false
	__h.mouse_released = false
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	__h._e_down = false
	if __h.wheel != null and __h.wheel.is_open():
		__h.wheel.close()
	await __h.get_tree().process_frame
	await __h.get_tree().process_frame

	var place_pair: Variant = func() -> void:
		me["alive"] = true
		me["downed"] = false
		me["detained"] = false
		me["knife"] = 1
		victim["pos"] = Vector2(__h.player.global_position.x, __h.player.global_position.z - 1.0)
		victim["alive"] = true
		victim["downed"] = false
		victim["detained"] = false
		victim["killedBy"] = -1
		victim["deathCause"] = ""

	# ① 交互扫描：站位正前方 1.0m 有人，E 的候选里必须有 attack
	place_pair.call()
	await __h.get_tree().process_frame
	var offers: Variant = __h._collect_offers()
	var ids: Array = []
	var has_attack := false
	for o: Dictionary in offers:
		var oid := String(o.get("id", ""))
		ids.append(oid)
		if oid == "attack":
			has_attack = true
	print("PROBE ① 交互项=%d [%s] 有出刀=%s" % [offers.size(),
		", ".join(PackedStringArray(ids)), str(has_attack)])
	if not has_attack:
		fails.append("E 的候选里没有 attack（旁边有人却打不了）")

	# ② 真实 E：单项直接执行 → 目标濒死、刀数 -1
	__h._e_down = false
	await __h._tap_key(KEY_E)
	await __h.get_tree().process_frame
	var e_downed := bool(victim.get("downed", false))
	print("PROBE ② 真实 E → 濒死=%s 剩余刀=%d" % [str(e_downed), int(me.get("knife", -1))])
	if not e_downed:
		fails.append("真实 E 没有放倒目标")
	if int(me.get("knife", -1)) != 0:
		fails.append("E 出刀后刀数不是 0（=%d）" % int(me.get("knife", -1)))

	# ③ 真实左键：同一套结算
	place_pair.call()
	__h._knife_cd = 0.0
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	await __h.get_tree().process_frame
	var aim_dbg: Variant = __h._aim_target(SpaceData.num(__h.space, "reach", "knife"), 0.55)
	print("PROBE ③ 前置 mouse=%d released=%s cd=%.2f 瞄到=%s 目标pos=%s 我pos=%s" % [
		Input.mouse_mode, str(__h.mouse_released), __h._knife_cd, String(aim_dbg.get("name", "")),
		str(victim.get("pos", Vector2.ZERO)), str(me.get("pos", Vector2.ZERO))])
	await __h._tap_mouse(MOUSE_BUTTON_LEFT)
	await __h.get_tree().process_frame
	print("PROBE ③ 真实左键 → 濒死=%s 剩余刀=%d 探针=%s" % [
		str(bool(victim.get("downed", false))), int(me.get("knife", -1)), str(__h._probe_lines)])
	if not bool(victim.get("downed", false)):
		fails.append("真实左键没有放倒目标")

	# ④ 多项轮盘：站在设备旁、目标仍在刀程内 → E 打开轮盘，按 1 选「出刀」
	var dev = null
	for d in __h.extras.devices:
		if is_instance_valid(d) and d.point_index >= 0:
			dev = d
			break
	if dev == null:
		fails.append("夹具没找到任务设备")
	else:
		var face: Vector3 = dev.face_dir()
		__h.player.global_position = Vector3(dev.global_position.x, 0.05, dev.global_position.z) + face * 1.6
		__h.player.rotation.y = atan2(face.x, face.z)
		place_pair.call()
		victim["pos"] = Vector2(__h.player.global_position.x - sin(__h.player.rotation.y) * 1.0,
			__h.player.global_position.z - cos(__h.player.rotation.y) * 1.0)
		__h._knife_cd = 0.0
		__h._e_down = false
		await __h.get_tree().process_frame
		var multi: Variant = __h._collect_offers()
		var multi_ids: Array = []
		for o2: Dictionary in multi:
			multi_ids.append(String(o2.get("id", "")))
		print("PROBE ④ 设备旁交互项=%d [%s]" % [multi.size(),
			", ".join(PackedStringArray(multi_ids))])
		if multi.size() < 2:
			fails.append("设备旁没有形成多项轮盘（只有 %d 项）" % multi.size())
		else:
			await __h._tap_key(KEY_E)
			await __h.get_tree().process_frame
			if __h.wheel == null or not __h.wheel.is_open():
				fails.append("多项交互按 E 没打开轮盘")
			else:
				await __h._tap_key(KEY_1)
				await __h.get_tree().process_frame
				print("PROBE ④ 轮盘选 1 → 濒死=%s 轮盘关闭=%s" % [
					str(bool(victim.get("downed", false))), str(not __h.wheel.is_open())])
				if not bool(victim.get("downed", false)):
					fails.append("轮盘选 1 没有放倒目标")
				if __h.wheel.is_open():
					fails.append("轮盘选 1 后没有关闭")

	# ⑤ F2 DEV 透视 / F3 文字总览 / 无敌（2026-11-11 PLAN §五）
	# 先保证玩家活着、回到会议室开阔处（设备旁边可能有掩体挡枪线）
	__h.player.global_position = Vector3(31.0, 0.05, 33.5)
	__h.player.rotation.y = 0.0
	me["alive"] = true
	me["downed"] = false
	me["knife"] = 1
	await __h.get_tree().process_frame
	await __h._tap_key(KEY_F2)
	await __h.get_tree().process_frame
	await __h._tap_key(KEY_F3)
	await __h.get_tree().process_frame
	var dev_on := bool(__h.sim.dev)
	var esp_on: bool = __h.esp_canvas != null and __h.esp_canvas.visible
	var panel_on: bool = __h.dev_panel != null and __h.dev_panel.visible
	var row0 := String((__h._dev_row_labels[0] as Label).text) if not __h._dev_row_labels.is_empty() else ""
	print("PROBE ⑤ F2/F3 → dev=%s 透视=%s 文字总览=%s 首行=%s" % [
		str(dev_on), str(esp_on), str(panel_on), row0])
	if not dev_on:
		fails.append("F2 没有打开 DEV")
	if not esp_on:
		fails.append("F2 没有打开透视 ESP")
	if not panel_on:
		fails.append("F3 没有打开 DEV 文字总览")
	if not row0.contains("异形") or not row0.contains("（你）"):
		fails.append("DEV 首行没有显示玩家身份（%s）" % row0)
	# 真实窗口下留一张 DEV 实拍，方便人工核对排版（headless 没有渲染目标）。
	if DisplayServer.get_name() != "headless":
		await RenderingServer.frame_post_draw
		var img: Variant = __h.get_viewport().get_texture().get_image()
		var shot_path := "user://probe-dev.png"
		img.save_png(shot_path)
		print("PROBESHOT_PATH=", ProjectSettings.globalize_path(shot_path))
	# 无敌：人类开枪打玩家 → 不濒死、子弹照扣
	victim["downed"] = false
	victim["alive"] = true
	victim["bullet"] = 1
	victim["pos"] = Vector2(__h.player.global_position.x + 2.0, __h.player.global_position.z)
	var shot: bool = __h.sim.shoot(int(victim.get("i", -1)), int(__h.sim.me_idx))
	var shot_blocked: bool = (not shot) and not bool(me.get("downed", false)) \
		and int(victim.get("bullet", -1)) == 0
	print("PROBE ⑤ DEV 挨枪 → 生效=%s 玩家濒死=%s 子弹=%d" % [
		str(shot), str(bool(me.get("downed", false))), int(victim.get("bullet", -1))])
	if not shot_blocked:
		fails.append("DEV 没有拦住 AI 开枪（shot=%s downed=%s bullet=%d）" % [
			str(shot), str(bool(me.get("downed", false))), int(victim.get("bullet", -1))])
	if __h.sim.die(me):
		fails.append("DEV 没有拦住死亡")
	# 无敌：驱逐
	__h.sim.meeting = {"kind": "day", "phase": "vote", "seq": 900,
		"votes": {0: int(__h.sim.me_idx), 1: int(__h.sim.me_idx), 2: int(__h.sim.me_idx),
			3: int(__h.sim.me_idx), 4: int(__h.sim.me_idx)}}
	__h.sim._close_meeting()
	var res: Dictionary = __h.sim.meeting.get("result", {}) as Dictionary
	print("PROBE ⑤ DEV 被投 → 存活=%s devSaved=%s" % [
		str(bool(me.get("alive", false))), str(bool(res.get("devSaved", false)))])
	if not bool(me.get("alive", false)) or not bool(res.get("devSaved", false)):
		fails.append("DEV 没有拦住驱逐")
	__h.sim.meeting = {}
	await __h._tap_key(KEY_F2)
	await __h.get_tree().process_frame
	if bool(__h.sim.dev):
		fails.append("F2 第二次没有关闭 DEV")
	if __h.esp_canvas != null and __h.esp_canvas.visible:
		fails.append("F2 关闭后透视 ESP 还在")
	if __h.dev_panel != null and __h.dev_panel.visible:
		fails.append("DEV 关闭后文字总览还在")

	# ⑥ knife / down 动作：AI 出刀 → actor 播 knife；受害者倒地 → 播 down。
	var actor_i: Variant = -1
	var victim2: Variant = -1
	for a: Dictionary in __h.sim.agents:
		var ai := int(a.get("i", -1))
		if ai == int(__h.sim.me_idx):
			continue
		if bool(a.get("alien", false)) and actor_i < 0:
			actor_i = ai
		elif not bool(a.get("alien", false)) and victim2 < 0:
			victim2 = ai
	if actor_i >= 0 and victim2 >= 0 and __h.crew_view != null 			and __h.crew_view._anims.has(actor_i) and __h.crew_view._anims.has(victim2):
		var aa: Dictionary = __h.sim.agent(actor_i)
		var vv: Dictionary = __h.sim.agent(victim2)
		aa["alive"] = true
		aa["downed"] = false
		aa["knife"] = 1
		vv["alive"] = true
		vv["downed"] = false
		__h.sim.knife(actor_i, victim2)
		__h.crew_view.sync(__h.sim, 0.016)
		var knife_now := String((__h.crew_view._anims[actor_i] as AnimationPlayer).current_animation)
		var down_now := String((__h.crew_view._anims[victim2] as AnimationPlayer).current_animation)
		print("PROBE ⑥ knife=%s down=%s" % [knife_now, down_now])
		if not knife_now.to_lower().contains("knife"):
			fails.append("出刀事件没有触发 knife 动作（=%s）" % knife_now)
		if not down_now.to_lower().contains("down"):
			fails.append("倒地没有触发 down 动作（=%s）" % down_now)
	else:
		fails.append("knife/down 夹具没找到可用模型")

	print("PROBETEST %s %d 项失败 %s" % ["OK" if fails.is_empty() else "FAIL", fails.size(),
		str(fails)])
	__h._probetest_ok = fails.is_empty()


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
	var pass_n := 0
	var fail_n := 0
	var fails: Array = []
	__h._finish_meeting(__h.sim)
	__h.sim.ai_enabled = false
	__h.sim.meeting = {}
	var a: Dictionary = {}
	var h1: Dictionary = {}
	var h2: Dictionary = {}
	for x: Dictionary in __h.sim.agents:
		if bool(x.get("alien", false)) and a.is_empty():
			a = x
		elif not bool(x.get("alien", false)) and h1.is_empty():
			h1 = x
		elif not bool(x.get("alien", false)) and h2.is_empty():
			h2 = x
	if a.is_empty() or h1.is_empty() or h2.is_empty():
		print("AIPORTTEST FAIL 席位缺失")
		__h._aiporttest_ok = false
		return
	var ai0 := int(a.get("i", -1))
	var h1i := int(h1.get("i", -1))
	var h2i := int(h2.get("i", -1))
	var bridge: Vector2 = __h.sim.room_center("bridge")
	var engine: Vector2 = __h.sim.room_center("engine")
	# 只留 h1/h2 作为候选：其余人类全部拘留（挑目标会排除 detained）。
	for x: Dictionary in __h.sim.agents:
		var xi := int(x.get("i", -1))
		x["detained"] = xi != ai0 and xi != h1i and xi != h2i
		x["downed"] = false
		x["redT"] = 0.0
		x["_avoidHuman"] = -1
		x["accuse"] = -1
		x["target"] = -1
		x["path"] = PackedVector2Array()
	a["mates"] = {}
	a["alive"] = true
	a["knife"] = 1
	a["bullet"] = 0
	a["qual"] = 0
	a["qualPending"] = 0
	a["_sabDone"] = true
	a["drag"] = -1
	a["_fakeCD"] = 999.0
	a["_breakerRollN"] = str(int(__h.sim.night))
	a["_breakerWant"] = false
	a["_avoid_i"] = -1
	a["_avoid_t"] = 0.0
	a["why"] = {}
	a["path"] = PackedVector2Array()
	a["target"] = -1
	a["pos"] = bridge
	h1["alive"] = true
	h1["downed"] = false
	h1["detained"] = false
	h1["pos"] = bridge + Vector2(4, 0)
	h2["alive"] = true
	h2["downed"] = false
	h2["detained"] = false
	h2["pos"] = bridge + Vector2(0, 6)
	# ① 看得见的更近者优先
	__h.sim._ai_alien._decide(a)
	if int(a.get("target", -1)) == h1i:
		pass_n += 1
	else:
		fail_n += 1
		fails.append("看得见的目标没选中：%d（期望 %d）" % [int(a.get("target", -1)), h1i])
	# ② 看不见且没有记忆 → 不进候选（取消全图锁敌）
	h2["detained"] = true
	h1["pos"] = engine
	a["why"] = {}
	a["path"] = PackedVector2Array()
	a["target"] = -1
	__h.sim._ai_alien._decide(a)
	if int(a.get("target", -1)) < 0:
		pass_n += 1
	else:
		fail_n += 1
		fails.append("没记忆的远处目标仍被选中：%d" % int(a.get("target", -1)))
	# ③ 本夜亲眼见过 → 用最后目击位置（25 秒内）
	__h.sim.mind.note_track(ai0, h1i, bridge + Vector2(2, 0), "bridge")
	a["path"] = PackedVector2Array()
	a["target"] = -1
	__h.sim._ai_alien._decide(a)
	if int(a.get("target", -1)) == h1i:
		pass_n += 1
	else:
		fail_n += 1
		fails.append("25 秒内的记忆目标没选中：%d" % int(a.get("target", -1)))
	# ④ 超过 HUNT.memorySec(25s) → 跟丢
	var mem: Array = (a.get("why", {}) as Dictionary).get(h1i, []) as Array
	if not mem.is_empty():
		var last: Dictionary = mem[mem.size() - 1]
		last["t"] = (__h.sim.night_len() - maxf(0.0, float(__h.sim.t))) - 30.0
		(a["why"] as Dictionary)[h1i] = mem
	a["path"] = PackedVector2Array()
	a["target"] = -1
	__h.sim._ai_alien._decide(a)
	if int(a.get("target", -1)) < 0:
		pass_n += 1
	else:
		fail_n += 1
		fails.append("过期记忆仍被使用：%d" % int(a.get("target", -1)))
	# ⑤ humanT：远 2 格但合过闸的人优先（HUMANISH.pull 6 格当量）
	a["why"] = {}
	h2["detained"] = false
	h1["pos"] = bridge + Vector2(6, 0)
	h2["pos"] = bridge + Vector2(4, 0)
	a["path"] = PackedVector2Array()
	a["target"] = -1
	__h.sim._ai_alien._decide(a)
	var no_ht := int(a.get("target", -1))
	__h.sim.mind.humanish_add(a, h1i, 1.0)
	a["path"] = PackedVector2Array()
	a["target"] = -1
	__h.sim._ai_alien._decide(a)
	var with_ht := int(a.get("target", -1))
	if no_ht == h2i and with_ht == h1i:
		pass_n += 1
	else:
		fail_n += 1
		fails.append("humanT 拉近失效：无=%d 有=%d（期望 %d→%d）" % [
			no_ht, with_ht, h2i, h1i])
	# ⑥ 合闸目击：异形 observer 写 humanT +0.28，上限 1
	var br: Vector2 = __h.sim.breaker_pos()
	__h.sim.light_state = 2
	__h.sim.power_on = false
	h1["pos"] = br
	a["pos"] = br + Vector2(1.2, 0)
	a["humanT"] = {}
	a["mates"] = {}
	__h.sim.toggle_power(h1i)
	var ht1: float = __h.sim.mind.humanish_of(a, h1i)
	__h.sim.mind.humanish_add(a, h1i, 1.0)
	var ht_cap: float = __h.sim.mind.humanish_of(a, h1i)
	if absf(ht1 - 0.28) < 0.001 and absf(ht_cap - 1.0) < 0.001:
		pass_n += 1
	else:
		fail_n += 1
		fails.append("humanT 写入/封顶错：%0.2f / %0.2f" % [ht1, ht_cap])
	# ⑦ saw_red 5 秒节流：同一段红光只写一条证据
	h2["alive"] = true
	h2["downed"] = false
	h2["detained"] = false
	h2["pos"] = bridge + Vector2(3, 0)
	h2["why"] = {}
	h2["redSeen"] = {}
	a["pos"] = bridge
	a["redT"] = 1.0
	var e0: float = __h.sim.elapsed
	__h.sim._track_pass()
	var n1: Variant = __h._count_why(h2, ai0, "saw_red")
	__h.sim._track_pass()
	var n2: Variant = __h._count_why(h2, ai0, "saw_red")
	__h.sim.elapsed = e0 + 6.0
	a["redT"] = 1.0
	__h.sim._track_pass()
	var n3: Variant = __h._count_why(h2, ai0, "saw_red")
	a["redT"] = 0.0
	if n1 == 1 and n2 == 1 and n3 == 2:
		pass_n += 1
	else:
		fail_n += 1
		fails.append("saw_red 节流错：%d/%d/%d（期望 1/1/2）" % [n1, n2, n3])
	# ⑧ saw_avoid：每夜一次，记在**观察者**身上
	h2["why"] = {}
	h2["avoidSeen"] = {}
	h2["pos"] = bridge + Vector2(3, 0)
	h1["pos"] = bridge
	h1["_avoidHuman"] = h2i
	__h.sim._track_pass()
	var av1: Variant = __h._count_why(h2, h1i, "saw_avoid")
	__h.sim._track_pass()
	var av2: Variant = __h._count_why(h2, h1i, "saw_avoid")
	var av_seen := int((h2.get("avoidSeen", {}) as Dictionary).get(h1i, -1))
	if av1 == 1 and av2 == 1 and av_seen == int(__h.sim.night):
		pass_n += 1
	else:
		fail_n += 1
		fails.append("saw_avoid 错：%d/%d seen=%d" % [av1, av2, av_seen])
	# ⑨ 空闲游荡 + 躲避：任务做完不再站桩
	h1["_avoidHuman"] = -1
	h1["tasks"] = [0]
	h1["tIdx"] = 1
	h1["path"] = PackedVector2Array()
	h1["doing"] = 0.0
	h1["qualPending"] = 0
	h1["warm"] = {}
	h1["cred"] = {}
	h1["known"] = {}
	h1["alive"] = true
	h1["downed"] = false
	h1["detained"] = false
	__h.sim.dmg = []
	h2["accuse"] = -1
	__h.sim._ai_human._idle_roam(h1)
	var roam_ok: Variant = (h1.get("path", PackedVector2Array()) as PackedVector2Array).size() > 0
	h1["path"] = PackedVector2Array()
	h2["accuse"] = h1i
	__h.sim._ai_human._idle_roam(h1)
	var avoid_ok := int(h1.get("_avoidHuman", -1)) == h2i \
		and (h1.get("path", PackedVector2Array()) as PackedVector2Array).size() > 0
	if roam_ok and avoid_ok:
		pass_n += 1
	else:
		fail_n += 1
		fails.append("idle roam 错：roam=%s avoid=%s/%d" % [
			str(roam_ok), str(avoid_ok), int(h1.get("_avoidHuman", -1))])
	# ⑩ 身份轴 / 目标距离乘子 / trait 系数
	a["almost"] = {"foe": {}, "friend": {}}
	a["known"] = {}
	a["mates"] = {}
	a["cred"] = {}
	(a["almost"] as Dictionary)["foe"] = {h1i: {"kinds": ["saw_knife"]}}
	var h_id: float = __h.sim.mind.identity_axis(a, h1)
	(a["almost"] as Dictionary)["foe"] = {h1i: {"kinds": ["heard_accuse"]}}
	var h_soft: float = __h.sim.mind.identity_axis(a, h1)
	(a["mates"] as Dictionary)[h2i] = {"t": 1.0}
	var h_mate: float = __h.sim.mind.identity_axis(a, h2)
	a["mates"] = {}
	a["almost"] = {"foe": {}, "friend": {}}
	if absf(h_id - 0.05) < 0.001 and h_soft > 0.5 and absf(h_mate) < 0.001 \
			and absf(__h.sim.mind.target_dist_mul(1.0) - 0.5) < 0.001 \
			and absf(__h.sim.mind.target_dist_mul(0.0) - 1.25) < 0.001:
		pass_n += 1
	else:
		fail_n += 1
		fails.append("身份轴错：id=%.2f soft=%.2f mate=%.2f mul=%.2f/%.2f" % [
			h_id, h_soft, h_mate, __h.sim.mind.target_dist_mul(1.0),
			__h.sim.mind.target_dist_mul(0.0)])
	# ⑪ 暴露度：亮舱有目击者 >0；目击者做事 / 是目标本人 → 0
	var wit: Variant = h2
	wit["alive"] = true
	wit["downed"] = false
	wit["detained"] = false
	wit["doing"] = 0.0
	wit["pos"] = bridge + Vector2(2, 0)
	h1["detained"] = true
	h1["doing"] = 0.0
	var exp_seen: float = __h.sim._ai_alien._exposure_at(a, bridge, {})
	wit["doing"] = 3.0
	var exp_busy: float = __h.sim._ai_alien._exposure_at(a, bridge, {})
	wit["doing"] = 0.0
	var exp_except: float = __h.sim._ai_alien._exposure_at(a, bridge, wit)
	h1["detained"] = false
	if exp_seen > 0.0 and exp_busy == 0.0 and exp_except == 0.0:
		pass_n += 1
	else:
		fail_n += 1
		fails.append("暴露度错：seen=%.2f busy=%.2f except=%.2f" % [
			exp_seen, exp_busy, exp_except])
	# ⑫ 无目标寻人点 + 特征系数
	a["why"] = {}
	__h.sim.mind.note_track(ai0, h1i, engine, "engine")
	var hunt: Vector2 = __h.sim._ai_alien._hunt_spot(a)
	var hunt_ok: Variant = hunt.distance_to(engine) < 1.0
	a["why"] = {}
	var hunt2: Vector2 = __h.sim._ai_alien._hunt_spot(a)
	var here_room: String = __h.sim.room_at(a.get("pos", Vector2.ZERO))
	var tally: Dictionary = {}
	for p: Dictionary in (__h.sim.map.get("points", []) as Array):
		var pr := String(p.get("room", ""))
		if pr == "" or pr == here_room:
			continue
		tally[pr] = int(tally.get(pr, 0)) + 1
	var best_room := ""
	var best_n := 0
	for k2: String in tally.keys():
		if int(tally[k2]) > best_n:
			best_n = int(tally[k2])
			best_room = k2
	var hunt_room: String = __h.sim.room_at(hunt2)
	var saved_trait: Dictionary = (a.get("trait", {}) as Dictionary).duplicate()
	a["trait"] = {"aggr": 50, "caut": 50, "soc": 50, "cur": 50}
	var p1: float = __h.sim.mind.trait_c("knifeWatcherPenalty", a)
	var p2: float = __h.sim.mind.trait_c("knifeBusyBonus", a)
	var p3: float = __h.sim.mind.trait_c("grudgeGain", a)
	var p4: float = __h.sim.mind.trait_c("trustGain", a)
	var p5: float = __h.sim.mind.trait_c("voteGrudgePull", a)
	a["trait"] = saved_trait
	if hunt_ok and hunt_room == best_room and absf(p1 - 12.0) < 0.01 \
			and absf(p2 + 12.0) < 0.01 and absf(p3 - 1.0) < 0.01 \
			and absf(p4 - 1.0) < 0.01 and absf(p5 - 6.0) < 0.01:
		pass_n += 1
	else:
		fail_n += 1
		fails.append("寻人点/系数错：hunt=%s room=%s/%s coef=%.1f/%.1f/%.1f/%.1f/%.1f" % [
			str(hunt_ok), hunt_room, best_room, p1, p2, p3, p4, p5])
	# ⑬ humanT 跨夜 ×0.8（1.0 → 0.8）
	__h.sim.mind.humanish_add(a, h1i, 1.0)
	__h.sim.mind.reset_night()
	var ht_decay: float = __h.sim.mind.humanish_of(a, h1i)
	if absf(ht_decay - 0.8) < 0.01:
		pass_n += 1
	else:
		fail_n += 1
		fails.append("humanT 跨夜衰减错：%0.2f" % ht_decay)
	print("AIPORTTEST pass=%d fail=%d %s" % [pass_n, fail_n, str(fails)])
	__h._aiporttest_ok = fail_n == 0


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
