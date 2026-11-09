extends SceneTree
func _initialize():
    print("GI_MODE_DISABLED=", GeometryInstance3D.GI_MODE_DISABLED)
    print("GI_MODE_STATIC=", GeometryInstance3D.GI_MODE_STATIC)
    print("GI_MODE_DYNAMIC=", GeometryInstance3D.GI_MODE_DYNAMIC)
    var scn = load("res://assets/import-probe/probe-cube.glb")
    if scn:
        var root = scn.instantiate()
        _walk(root)
    quit()
func _walk(n):
    if n is MeshInstance3D:
        print("MESH ", n.name, " gi_mode=", n.gi_mode)
    for c in n.get_children():
        _walk(c)
