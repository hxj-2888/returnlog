extends SceneTree

## 千问原始方图 → 运行时贴图：裁掉四周（去白边/渐变），缩到目标尺寸。
## 用法：godot --headless --path 3d/preview --script tools/crop-materials.gd
## 只跑一次，产物入库；原始图留在 3d/assets/renders/qwen-materials/（已忽略）。

const RAW := "C:/Users/ASUS/Desktop/新返航录 3D 版/3d/assets/renders/qwen-materials"
const OUT_W := "C:/Users/ASUS/Desktop/新返航录 3D 版/3d/preview/assets/weapons"
const OUT_C := "C:/Users/ASUS/Desktop/新返航录 3D 版/3d/preview/assets/models/crew_tex"

const ITEMS := [
	{"slug": "knife-blade", "crop": 0.70, "out": OUT_W, "size": 384},
	{"slug": "knife-grip", "crop": 0.70, "out": OUT_W, "size": 384},
	{"slug": "crew-fabric", "crop": 0.72, "out": OUT_C, "size": 384},
	{"slug": "crew-webbing", "crop": 0.78, "out": OUT_C, "size": 384},
	{"slug": "crew-leather", "crop": 0.72, "out": OUT_C, "size": 384},
	{"slug": "crew-skin", "crop": 0.72, "out": OUT_C, "size": 384},
]


func _initialize() -> void:
	DirAccess.make_dir_recursive_absolute(OUT_W)
	DirAccess.make_dir_recursive_absolute(OUT_C)
	var ok := 0
	for it in ITEMS:
		var slug: String = it["slug"]
		var src := "%s/%s_512.png" % [RAW, slug]
		var img := Image.load_from_file(src)
		if img == null or img.is_empty():
			print("CROP_MISS %s" % src)
			continue
		var w := img.get_width()
		var h := img.get_height()
		var r: float = it["crop"]
		var cw := int(round(float(w) * r))
		var ch := int(round(float(h) * r))
		var x := int((w - cw) / 2)
		var y := int((h - ch) / 2)
		var region := img.get_region(Rect2i(x, y, cw, ch))
		var target: int = it["size"]
		region.resize(target, target, Image.INTERPOLATE_LANCZOS)
		var dst := "%s/%s.png" % [it["out"], slug]
		var err := region.save_png(dst)
		if err == OK:
			ok += 1
			print("CROP_OK %s %dx%d -> %s" % [slug, target, target, dst])
		else:
			print("CROP_FAIL %s err=%d" % [slug, err])
	print("CROP_DONE ok=%d/%d" % [ok, ITEMS.size()])
	quit(0 if ok == ITEMS.size() else 1)
