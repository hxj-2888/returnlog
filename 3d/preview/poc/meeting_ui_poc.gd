extends SceneTree
## 会议面板 UI spec POC 的 Godot 端：
## 加载 spec 生成的 generated_meeting_panel.gd，验证结构 / 模板 / 状态可见性。
##
## 运行：
##   Godot --headless --path 3d/preview --script res://poc/meeting_ui_poc.gd

func _initialize() -> void:
	var script: GDScript = load("res://poc/generated_meeting_panel.gd")
	if script == null:
		print("MEETING-UI-POC FAIL 找不到 generated_meeting_panel.gd")
		quit(1)
		return
	var ui = script.new()
	var root: Control = ui.build()
	var nodes: Dictionary = {}
	_collect(root, nodes)
	var pass_n := 0
	var fail_n := 0
	if nodes.size() == int(ui.ELEMENT_COUNT):
		pass_n += 1
	else:
		fail_n += 1
		print("MEETING-UI-POC FAIL 元素 %d ≠ %d" % [nodes.size(), int(ui.ELEMENT_COUNT)])
	var tpl_parent: Control = ui.node("m-tpl-btns")
	var tpl_count := 0
	if tpl_parent != null:
		for c in tpl_parent.get_children():
			if c.has_meta("template_key"):
				tpl_count += 1
	if tpl_count == int(ui.TEMPLATE_COUNT) and tpl_parent is GridContainer \
			and tpl_parent.get_parent() == ui.node("m-tpl"):
		pass_n += 1
	else:
		fail_n += 1
		print("MEETING-UI-POC FAIL 模板按钮 %d / 父节点 %s" % [
			tpl_count, str(tpl_parent.get_parent() if tpl_parent != null else null)])
	if _text_is(ui, "m-send", "发送") and _text_is(ui, "m-skip", "跳过讨论") \
			and _text_is(ui, "m-title", "紧急会议") and _text_is(ui, "m-skip-vote", "跳过投票"):
		pass_n += 1
	else:
		fail_n += 1
		print("MEETING-UI-POC FAIL 关键按钮/标题文本不符")
	var when_ok := false
	var when: OptionButton = ui.node("m-tpl-when") as OptionButton
	if when != null:
		when_ok = when.item_count == 3 and when.get_item_text(0) == "不指定时段" \
			and when.get_item_text(1) == "刚才" and when.get_item_text(2) == "整晚"
	if when_ok:
		pass_n += 1
	else:
		fail_n += 1
		print("MEETING-UI-POC FAIL 时段下拉不符")
	# 状态：讨论 / 投票 / 只读
	ui.apply_state("discuss")
	var discuss_ok: bool = ui.node("m-tpl").visible and not ui.node("m-skip-vote").visible \
		and ui.node("m-text").visible and ui.node("m-send").visible
	ui.apply_state("vote")
	var vote_ok: bool = not ui.node("m-tpl").visible and ui.node("m-skip-vote").visible \
		and not ui.node("m-text").visible and ui.node("m-tally").visible
	ui.apply_state("readonly")
	var ro_ok: bool = ui.node("m-say").visible and not ui.node("m-text").visible \
		and not ui.node("m-send").visible and not ui.node("m-skip-vote").visible
	if discuss_ok:
		pass_n += 1
	else:
		fail_n += 1
		print("MEETING-UI-POC FAIL discuss 可见性")
	if vote_ok:
		pass_n += 1
	else:
		fail_n += 1
		print("MEETING-UI-POC FAIL vote 可见性")
	if ro_ok:
		pass_n += 1
	else:
		fail_n += 1
		print("MEETING-UI-POC FAIL readonly 可见性")
	print("MEETING-UI-POC pass=%d fail=%d nodes=%d templates=%d states=3" % [
		pass_n, fail_n, nodes.size(), tpl_count])
	root.queue_free()
	quit(0 if fail_n == 0 else 1)


func _collect(n: Node, out: Dictionary) -> void:
	for c in n.get_children():
		if c.has_meta("spec_id"):
			out[String(c.get_meta("spec_id"))] = c
		_collect(c, out)


func _text_is(ui, id: String, want: String) -> bool:
	var n = ui.node(id)
	if n is Button:
		return String(n.text) == want
	if n is Label:
		return String(n.text) == want
	return false
