from math import atan2, hypot, pi
from pathlib import Path

import bpy
from mathutils import Vector


PROJECT_ROOT = Path(__file__).resolve().parents[2]
MODEL_DIR = PROJECT_ROOT / "assets" / "models"
BLEND_PATH = MODEL_DIR / "orbitgo-warp-lancer.blend"
GLB_PATH = MODEL_DIR / "orbitgo-warp-lancer.glb"
PREVIEW_PATH = Path("/tmp/orbitgo-warp-lancer-preview.png")


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


def add_uv_sphere(name, location, scale, material, parent, segments=40, rings=24):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.parent = parent
    add_material(obj, material)
    return shade_smooth(obj)


def add_cube(name, location, dimensions, rotation, material, parent, bevel=0.045):
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.parent = parent
    add_material(obj, material)
    return apply_bevel(obj, bevel, 2) if bevel else obj


def add_beam_xy(name, start, end, z, width, height, material, parent, bevel=0.025):
    dx = end[0] - start[0]
    dy = end[1] - start[1]
    length = hypot(dx, dy)
    return add_cube(
        name,
        ((start[0] + end[0]) * 0.5, (start[1] + end[1]) * 0.5, z),
        (length, width, height),
        (0.0, 0.0, atan2(dy, dx)),
        material,
        parent,
        bevel,
    )


def add_cylinder(name, location, radius, depth, material, parent, vertices=32):
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


def add_torus(name, location, major_radius, minor_radius, material, parent, major_segments=56):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major_radius,
        minor_radius=minor_radius,
        major_segments=major_segments,
        minor_segments=12,
        location=location,
        rotation=(pi / 2, 0.0, 0.0),
    )
    obj = bpy.context.object
    obj.name = name
    obj.parent = parent
    add_material(obj, material)
    return shade_smooth(obj)


def add_warp_membrane(name, location, radius, material, parent):
    bpy.ops.mesh.primitive_circle_add(
        vertices=64,
        radius=radius,
        fill_type="TRIFAN",
        location=location,
        rotation=(pi / 2, 0.0, 0.0),
    )
    obj = bpy.context.object
    obj.name = name
    obj.parent = parent
    add_material(obj, material)
    return obj


def point_camera(camera, target):
    direction = Vector(target) - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


bpy.ops.wm.read_factory_settings(use_empty=True)
MODEL_DIR.mkdir(parents=True, exist_ok=True)
bpy.context.scene.unit_settings.system = "METRIC"
bpy.context.scene.unit_settings.scale_length = 1.0

titanium = create_material("HullTitanium", (0.34, 0.42, 0.44), 0.82, 0.22, (0.015, 0.035, 0.04), 0.35)
graphite = create_material("GraphiteArmor", (0.014, 0.024, 0.029), 0.84, 0.34, (0.006, 0.018, 0.024), 0.3)
ceramic = create_material("PearlCeramic", (0.62, 0.66, 0.64), 0.46, 0.25, (0.025, 0.045, 0.045), 0.32)
copper = create_material("CopperTrim", (0.62, 0.25, 0.07), 0.9, 0.2, (0.2, 0.035, 0.003), 0.7)
navigation = create_material("NavigationGlow", (0.04, 0.78, 0.87), 0.26, 0.1, (0.02, 0.86, 1.0), 8.0)
glass = create_material("CockpitGlass", (0.008, 0.055, 0.075), 0.32, 0.08, (0.015, 0.45, 0.63), 2.5, 0.9)
inset = create_material("InsetMetal", (0.004, 0.008, 0.012), 0.7, 0.58, (0.005, 0.05, 0.07), 0.3)
warp_field = create_material("WarpField", (0.015, 0.25, 0.32), 0.05, 0.08, (0.02, 0.75, 1.0), 3.4, 0.18)

root = bpy.data.objects.new("OrbitGoWarpLancer", None)
bpy.context.collection.objects.link(root)

core_outline = [
    (-0.48, -4.15),
    (-0.72, -2.35),
    (-0.64, 1.75),
    (-0.37, 3.85),
    (0.0, 5.85),
    (0.37, 3.85),
    (0.64, 1.75),
    (0.72, -2.35),
    (0.48, -4.15),
]
create_prism("LongCore", core_outline, 0.3, graphite, 0.09, root)
add_uv_sphere("UpperFlowShell", (0.0, 0.25, 0.24), (0.66, 3.55, 0.38), titanium, root)
add_uv_sphere("LowerFlowShell", (0.0, -0.35, -0.26), (0.53, 3.72, 0.28), graphite, root)
add_uv_sphere("PearlNoseShell", (0.0, 2.72, 0.18), (0.48, 2.3, 0.3), ceramic, root)

canopy = add_uv_sphere("CockpitCanopy", (0.0, 2.0, 0.55), (0.46, 1.35, 0.3), glass, root)
canopy.rotation_euler.x = -0.04
for side in (-1, 1):
    add_beam_xy(
        f"CanopyRail_{side}",
        (side * 0.25, 0.92),
        (side * 0.13, 3.18),
        0.73,
        0.035,
        0.045,
        copper,
        root,
        0.012,
    )

add_cube("DorsalSpine", (0.0, -0.2, 0.56), (0.09, 6.25, 0.11), (0.0, 0.0, 0.0), copper, root, 0.025)
for side in (-1, 1):
    add_cube(
        f"FuselageGlowRail_{side}",
        (side * 0.37, -0.18, 0.46),
        (0.04, 6.2, 0.055),
        (0.0, 0.0, side * 0.01),
        navigation,
        root,
        0.012,
    )

for side in (-1, 1):
    wing_outline = [
        (0.42 * side, 1.32),
        (1.05 * side, 0.88),
        (4.55 * side, -1.08),
        (4.22 * side, -2.08),
        (2.12 * side, -2.72),
        (0.58 * side, -2.08),
    ]
    create_prism(f"FlowWing_{side}", wing_outline, 0.13, titanium, 0.075, root)
    inner_panel = [
        (0.62 * side, 0.76),
        (1.18 * side, 0.46),
        (3.8 * side, -1.06),
        (3.62 * side, -1.55),
        (2.0 * side, -2.04),
        (0.72 * side, -1.62),
    ]
    panel = create_prism(f"WingInset_{side}", inner_panel, 0.075, graphite, 0.045, root)
    panel.location.z = 0.16

    add_beam_xy(
        f"WingLight_{side}",
        (0.78 * side, 0.6),
        (4.04 * side, -1.25),
        0.27,
        0.05,
        0.055,
        navigation,
        root,
        0.014,
    )
    add_beam_xy(
        f"WingLeadingTrim_{side}",
        (0.76 * side, 1.0),
        (4.35 * side, -1.03),
        0.16,
        0.07,
        0.08,
        copper,
        root,
        0.018,
    )
    add_beam_xy(
        f"NacelleBoom_{side}",
        (0.52 * side, -1.34),
        (2.72 * side, -2.26),
        -0.02,
        0.28,
        0.22,
        graphite,
        root,
        0.05,
    )

    add_uv_sphere(f"WarpNacelleShell_{side}", (2.78 * side, -2.38, -0.02), (0.5, 2.03, 0.48), ceramic, root)
    add_cylinder(f"WarpNacelleCore_{side}", (2.78 * side, -2.58, -0.03), 0.36, 3.55, inset, root, 36)
    add_cylinder(f"WarpNacelleBand_{side}", (2.78 * side, -3.18, -0.03), 0.51, 0.22, copper, root, 36)
    add_torus(f"WarpCoilOuter_{side}", (2.78 * side, -4.34, -0.03), 0.69, 0.07, navigation, root)
    add_torus(f"WarpCoilTrim_{side}", (2.78 * side, -4.34, -0.03), 0.83, 0.038, copper, root)
    add_torus(f"NacelleIntake_{side}", (2.78 * side, -0.84, -0.03), 0.36, 0.045, navigation, root)

    wing_tip = create_prism(
        f"NeedleWingTip_{side}",
        [(-0.24, 1.0), (0.18, 0.5), (0.28, -1.3), (-0.18, -0.75)],
        0.09,
        ceramic,
        0.035,
        root,
    )
    wing_tip.location = (4.28 * side, -1.34, 0.02)
    wing_tip.rotation_euler.z = -0.13 * side

ring_y = -3.35
add_warp_membrane("CentralWarpField", (0.0, ring_y + 0.035, 0.02), 1.38, warp_field, root)
add_torus("CentralWarpRing", (0.0, ring_y, 0.02), 1.46, 0.085, navigation, root, 72)
add_torus("CentralWarpTrim", (0.0, ring_y, 0.02), 1.66, 0.042, copper, root, 72)
for side in (-1, 1):
    add_cube(
        f"WarpRingStrutX_{side}",
        (side * 0.86, ring_y, 0.02),
        (1.18, 0.11, 0.08),
        (0.0, 0.0, 0.0),
        graphite,
        root,
        0.018,
    )
    add_cube(
        f"WarpRingStrutZ_{side}",
        (0.0, ring_y, side * 0.83),
        (0.075, 0.11, 1.12),
        (0.0, 0.0, 0.0),
        graphite,
        root,
        0.018,
    )

add_cylinder("CentralImpulseDrive", (0.0, -3.02, -0.06), 0.31, 2.45, inset, root, 32)
add_torus("CentralDriveGlow", (0.0, -4.32, -0.06), 0.29, 0.055, navigation, root)
add_uv_sphere("NoseSensor", (0.0, 5.52, 0.05), (0.085, 0.2, 0.085), navigation, root, 24, 14)

for side in (-1, 1):
    for index in range(4):
        add_beam_xy(
            f"FlowVent_{side}_{index}",
            (side * (0.78 + index * 0.16), -0.35 - index * 0.5),
            (side * (1.05 + index * 0.18), -0.52 - index * 0.5),
            0.36,
            0.055,
            0.045,
            inset,
            root,
            0.012,
        )

landing_gear = bpy.data.objects.new("LandingGear", None)
bpy.context.collection.objects.link(landing_gear)
landing_gear.parent = root
for index, (x, z) in enumerate(((-2.68, -0.22), (2.68, -0.22), (0.0, 0.44))):
    add_cylinder(f"GearStrut_{index}", (x, -4.12, z), 0.052, 0.86, graphite, landing_gear, 12)
    add_cylinder(f"GearFoot_{index}", (x, -4.58, z), 0.26, 0.1, copper, landing_gear, 18)

# Preview-only lighting and camera are excluded from the selected GLB export.
preview_world = bpy.data.worlds.new("PreviewWorld")
preview_world.use_nodes = True
preview_world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.001, 0.003, 0.005, 1.0)
preview_world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.035
bpy.context.scene.world = preview_world

bpy.ops.object.light_add(type="AREA", location=(6.5, 5.0, 9.0))
key_light = bpy.context.object
key_light.name = "PreviewKey"
key_light.data.energy = 1450
key_light.data.shape = "DISK"
key_light.data.size = 6.0
point_camera(key_light, (0.0, 0.1, 0.0))

bpy.ops.object.light_add(type="AREA", location=(-7.0, -4.5, 4.0))
fill_light = bpy.context.object
fill_light.name = "PreviewFill"
fill_light.data.energy = 980
fill_light.data.color = (0.04, 0.52, 0.72)
fill_light.data.size = 5.0
point_camera(fill_light, (0.0, -0.4, 0.0))

bpy.ops.object.light_add(type="AREA", location=(0.0, -7.5, 1.5))
rim_light = bpy.context.object
rim_light.name = "PreviewRim"
rim_light.data.energy = 1050
rim_light.data.color = (0.35, 0.75, 1.0)
rim_light.data.size = 4.0
point_camera(rim_light, (0.0, -1.6, 0.0))

bpy.ops.object.camera_add(location=(11.8, -14.8, 11.2))
camera = bpy.context.object
camera.name = "PreviewCamera"
camera.data.lens = 62
point_camera(camera, (0.0, 0.1, 0.0))
bpy.context.scene.camera = camera

bpy.context.scene.render.engine = "BLENDER_EEVEE"
bpy.context.scene.render.resolution_x = 1080
bpy.context.scene.render.resolution_y = 720
bpy.context.scene.render.resolution_percentage = 100
bpy.context.scene.render.image_settings.file_format = "PNG"
bpy.context.scene.render.filepath = str(PREVIEW_PATH)
bpy.context.scene.render.film_transparent = False
bpy.context.scene.view_settings.look = "AgX - Medium High Contrast"
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
