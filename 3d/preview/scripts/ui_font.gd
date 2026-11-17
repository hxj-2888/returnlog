class_name UIFont
extends RefCounted

## 3D Web 导出不支持系统字体；统一用随包 OFL 字体（Noto Sans CJK SC 子集）。
const FONT_PATH := "res://assets/fonts/NotoSansCJKsc-Regular-subset.otf"

static var _font: FontFile


static func get_font() -> FontFile:
	if _font == null:
		_font = load(FONT_PATH) as FontFile
	return _font
