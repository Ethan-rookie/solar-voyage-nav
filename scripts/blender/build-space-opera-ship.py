from math import pi
from pathlib import Path

import bpy
from mathutils import Vector


PROJECT_ROOT = Path(__file__).resolve().parents[2]
MODEL_DIR = PROJECT_ROOT / "assets" / "models"
BLEND_PATH = MODEL_DIR / "orbitgo-swept-wing.blend"
GLB_PATH = MODEL_DIR / "orbitgo-swept-wing.glb"
PREVIEW_PATH = Path("/tmp/orbitgo-blender-preview.png")


def create_material(name, color, metallic, roughness, emission=None, emission_strength=0.0, alpha=1.0):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.diffuse_color = (*color, alpha)
    material.metallic = metallic
    material.roughness = roughness
    node = material.node_tree.nodes.get("Principled BSDF")
    node.inputs["Base Color"].default_value = (*color, 1.0)
    node.inputs["Metallic"].default_value = metallic
    node.inputs["Roughness"].default_value = roughness
    node.inputs["Alpha"].default_value = alpha
    if emission:
        node.inputs["Emission Color"].default_value = (*emission, 1.0)
        node.inputs["Emission Strength"].default_value = emission_strength
    if alpha < 1.0 and hasattr(material, "surface_render_method"):
        material.surface_render_method = "DITHERED"
    return material


def add_material(obj, material):
    obj.data.materials.append(material)
    return obj


def apply_bevel(obj, width=0.08, segments=3):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    modifier = obj.modifiers.new("EdgeBevel", "BEVEL")
    modifier.width = width
    modifier.segments = segments
    modifier.limit_method = "ANGLE"
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    obj.select_set(False)
    return obj


def shade_smooth(obj):
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return obj


def create_prism(name, outline, depth, material, bevel=0.06, parent=None):
    count = len(outline)
    vertices = [(x, y, -depth) for x, y in outline] + [(x, y, depth) for x, y in outline]
    faces = [tuple(reversed(range(count))), tuple(range(count, count * 2))]
    for index in range(count):
        next_index = (index + 1) % count
        faces.append((index, next_index, count + next_index, count + index))
    mesh = bpy.data.meshes.new(f"{name}Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent
    add_material(obj, material)
    return apply_bevel(obj, bevel, 3) if bevel else obj


def add_uv_sphere(name, location, scale, material, parent):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=18, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.parent = parent
    add_material(obj, material)
    return shade_smooth(obj)


def add_cube(name, location, dimensions, rotation_z, material, parent, bevel=0.045):
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=(0.0, 0.0, rotation_z))
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.parent = parent
    add_material(obj, material)
    return apply_bevel(obj, bevel, 2) if bevel else obj


def add_cylinder(name, location, radius, depth, material, parent, vertices=24):
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=radius,
        depth=depth,
        location=location,
        rotation=(pi / 2, 0.0, 0.0),
    )
    obj = bpy.context.object
    obj.name = name
    obj.parent = parent
    add_material(obj, material)
    return shade_smooth(obj)


def add_torus(name, location, major_radius, minor_radius, material, parent):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major_radius,
        minor_radius=minor_radius,
        major_segments=40,
        minor_segments=10,
        location=location,
        rotation=(pi / 2, 0.0, 0.0),
    )
    obj = bpy.context.object
    obj.name = name
    obj.parent = parent
    add_material(obj, material)
    return shade_smooth(obj)


def point_camera(camera, target):
    direction = Vector(target) - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


bpy.ops.wm.read_factory_settings(use_empty=True)
MODEL_DIR.mkdir(parents=True, exist_ok=True)
bpy.context.scene.unit_settings.system = "METRIC"
bpy.context.scene.unit_settings.scale_length = 1.0

hull_material = create_material("HullBlue", (0.075, 0.29, 0.35), 0.72, 0.3, (0.015, 0.09, 0.12), 0.4)
panel_material = create_material("PanelOrange", (0.63, 0.12, 0.035), 0.56, 0.36, (0.18, 0.018, 0.004), 0.3)
trim_material = create_material("TrimGold", (0.82, 0.38, 0.08), 0.8, 0.24, (0.19, 0.055, 0.005), 0.5)
navigation_material = create_material("NavigationGlow", (0.12, 0.86, 0.92), 0.35, 0.12, (0.08, 0.85, 1.0), 5.0)
glass_material = create_material("CockpitGlass", (0.02, 0.13, 0.19), 0.28, 0.08, (0.04, 0.42, 0.62), 1.8, 0.92)
dark_material = create_material("DarkMetal", (0.018, 0.035, 0.045), 0.82, 0.48)
inset_material = create_material("InsetMetal", (0.006, 0.014, 0.02), 0.68, 0.62, (0.01, 0.08, 0.1), 0.25)

root = bpy.data.objects.new("OrbitGoSweptWing", None)
bpy.context.collection.objects.link(root)

fuselage_outline = [
    (-0.92, -1.65),
    (-1.16, 0.72),
    (-0.58, 2.2),
    (0.0, 3.18),
    (0.58, 2.2),
    (1.16, 0.72),
    (0.92, -1.65),
]
create_prism("Fuselage", fuselage_outline, 0.48, hull_material, 0.11, root)
add_uv_sphere("UpperArmor", (0.0, 0.38, 0.38), (1.02, 1.78, 0.45), panel_material, root)
add_uv_sphere("LowerArmor", (0.0, -0.12, -0.4), (0.94, 1.55, 0.46), dark_material, root)

nose = create_prism(
    "NoseArmor",
    [(-0.72, 0.2), (0.0, 2.15), (0.72, 0.2), (0.58, -0.65), (-0.58, -0.65)],
    0.34,
    trim_material,
    0.08,
    root,
)
nose.location.y = 1.45

add_uv_sphere("CockpitCanopy", (0.0, 1.05, 0.83), (0.86, 1.24, 0.48), glass_material, root)
canopy_frame = add_torus("CockpitFrame", (0.0, 1.02, 1.07), 0.67, 0.045, trim_material, root)
canopy_frame.scale.y = 1.38
for side in (-1, 1):
    add_cube(
        f"CockpitRail_{side}",
        (side * 0.36, 1.02, 1.1),
        (0.045, 1.65, 0.05),
        side * 0.12,
        trim_material,
        root,
        0.018,
    )

for side in (-1, 1):
    wing_outline = [
        (0.62 * side, 1.02),
        (4.72 * side, 0.28),
        (4.34 * side, -0.92),
        (3.08 * side, -2.08),
        (0.86 * side, -1.52),
    ]
    create_prism(f"MainWing_{side}", wing_outline, 0.18, hull_material, 0.085, root)
    panel = create_prism(f"WingPanel_{side}", wing_outline, 0.09, panel_material, 0.05, root)
    panel.scale.x = 0.82
    panel.scale.y = 0.82
    panel.location = (side * -0.08, -0.14, 0.25)
    add_cube(
        f"LeadingEdge_{side}",
        (side * 2.55, 0.34, 0.31),
        (3.6, 0.12, 0.16),
        side * -0.17,
        trim_material,
        root,
    )
    add_cube(
        f"WingStripe_{side}",
        (side * 2.42, -0.72, 0.33),
        (2.9, 0.12, 0.14),
        side * -0.24,
        panel_material,
        root,
    )
    wing_tip = create_prism(
        f"WingTip_{side}",
        [(-0.42, 0.7), (0.28, 0.38), (0.42, -0.75), (-0.28, -0.52)],
        0.14,
        panel_material,
        0.045,
        root,
    )
    wing_tip.location = (side * 4.35, -0.38, 0.12)
    wing_tip.rotation_euler.z = side * -0.08

    add_uv_sphere(f"EngineShroud_{side}", (side * 3.2, -0.82, -0.02), (0.72, 1.32, 0.62), hull_material, root)
    add_cylinder(f"EngineCore_{side}", (side * 3.2, -1.05, -0.06), 0.56, 2.35, dark_material, root, 28)
    add_cylinder(f"EngineBand_{side}", (side * 3.2, -1.42, -0.06), 0.64, 0.3, trim_material, root, 28)
    add_torus(f"EngineIntake_{side}", (side * 3.2, 0.18, -0.06), 0.42, 0.055, navigation_material, root)
    add_torus(f"EngineGlow_{side}", (side * 3.2, -2.24, -0.06), 0.46, 0.085, navigation_material, root)
    for index in range(3):
        add_cube(
            f"Vent_{side}_{index}",
            (side * (1.25 + index * 0.42), -1.1 - index * 0.08, 0.36),
            (0.46, 0.08, 0.1),
            side * -0.24,
            inset_material,
            root,
            0.018,
        )

add_cylinder("CenterEngine", (0.0, -1.48, -0.38), 0.46, 1.8, inset_material, root, 24)
add_torus("CenterEngineGlow", (0.0, -2.4, -0.38), 0.37, 0.07, navigation_material, root)
add_cube("DorsalSpine", (0.0, -0.02, 0.64), (0.18, 3.2, 0.14), 0.0, trim_material, root, 0.035)
tail = create_prism(
    "TailDeck",
    [(-1.05, 0.85), (1.05, 0.85), (0.72, -1.0), (-0.72, -1.0)],
    0.22,
    dark_material,
    0.06,
    root,
)
tail.location.y = -1.4

landing_gear = bpy.data.objects.new("LandingGear", None)
bpy.context.collection.objects.link(landing_gear)
landing_gear.parent = root
for index, (x, z) in enumerate(((-2.45, -0.36), (2.45, -0.36), (0.0, 0.58))):
    add_cylinder(f"GearStrut_{index}", (x, -2.02, z), 0.07, 1.25, dark_material, landing_gear, 12)
    add_cylinder(f"GearFoot_{index}", (x * 1.05, -2.62, z), 0.4, 0.12, trim_material, landing_gear, 18)

# Preview lighting is excluded from the GLB export.
preview_world = bpy.data.worlds.new("PreviewWorld")
preview_world.color = (0.002, 0.004, 0.008)
bpy.context.scene.world = preview_world
bpy.ops.object.light_add(type="AREA", location=(5.0, 3.0, 8.0))
key_light = bpy.context.object
key_light.name = "PreviewKey"
key_light.data.energy = 1200
key_light.data.shape = "DISK"
key_light.data.size = 5.0
point_camera(key_light, (0.0, 0.0, 0.0))
bpy.ops.object.light_add(type="AREA", location=(-5.0, -2.0, 4.0))
fill_light = bpy.context.object
fill_light.name = "PreviewFill"
fill_light.data.energy = 700
fill_light.data.color = (0.1, 0.45, 0.7)
fill_light.data.size = 4.0
point_camera(fill_light, (0.0, 0.0, 0.0))
bpy.ops.object.camera_add(location=(10.5, -10.5, 11.0))
camera = bpy.context.object
camera.name = "PreviewCamera"
camera.data.lens = 58
point_camera(camera, (0.0, 0.0, 0.0))
bpy.context.scene.camera = camera
bpy.context.scene.render.engine = "BLENDER_EEVEE"
bpy.context.scene.render.resolution_x = 960
bpy.context.scene.render.resolution_y = 720
bpy.context.scene.render.resolution_percentage = 100
bpy.context.scene.render.image_settings.file_format = "PNG"
bpy.context.scene.render.filepath = str(PREVIEW_PATH)
bpy.context.scene.render.film_transparent = False
bpy.ops.render.render(write_still=True)

bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))

bpy.ops.object.select_all(action="DESELECT")
root.select_set(True)
for child in root.children_recursive:
    child.select_set(True)
bpy.context.view_layer.objects.active = root
bpy.ops.export_scene.gltf(
    filepath=str(GLB_PATH),
    export_format="GLB",
    use_selection=True,
    export_yup=True,
    export_apply=False,
    export_materials="EXPORT",
    export_cameras=False,
    export_lights=False,
    export_extras=True,
)

print(f"Saved Blender source: {BLEND_PATH}")
print(f"Exported GLB: {GLB_PATH}")
print(f"Rendered preview: {PREVIEW_PATH}")
