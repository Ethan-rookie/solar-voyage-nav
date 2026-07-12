import * as THREE from "../vendor/three.module.js";

const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);
const FORWARD = new THREE.Vector3(0, 0, 1);

export function createSolarScene({ canvas, bodies, visuals, getBodyPosition }) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.setClearColor(0x010203, 1);
  canvas.dataset.renderer = "three-webgl";

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x010203);
  scene.fog = new THREE.FogExp2(0x010203, 0.00035);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.08, 2600);
  camera.position.set(0, 230, 520);
  scene.add(camera);

  const systemGroup = new THREE.Group();
  const orbitGroup = new THREE.Group();
  const routeGroup = new THREE.Group();
  scene.add(systemGroup, orbitGroup, routeGroup);

  scene.add(new THREE.HemisphereLight(0xa8bfd0, 0x130b07, 0.7));
  scene.add(new THREE.AmbientLight(0x33404b, 0.72));
  const sunlight = new THREE.PointLight(0xffca78, 1200, 0, 1);
  scene.add(sunlight);

  const glowTexture = createGlowTexture();
  const ringTexture = createRingTexture();
  const starfield = createStarfield();
  const oortCloud = createOortCloud();
  const cockpitStreaks = createCockpitStreaks();
  camera.add(cockpitStreaks.lines);
  scene.add(starfield, oortCloud.group);

  const textureLoader = new THREE.TextureLoader();
  const anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
  const bodyEntries = new Map();
  const pickMeshes = [];
  const orbitEntries = [];
  const labelLayer = createLabelLayer(canvas);

  for (const body of bodies) {
    const visual = visuals[body.id] || {};
    const entry = createBody(body, visual, textureLoader, anisotropy, glowTexture, ringTexture);
    bodyEntries.set(body.id, entry);
    systemGroup.add(entry.group);
    pickMeshes.push(entry.surface);

    const label = createBodyLabel(body);
    labelLayer.appendChild(label);
    entry.label = label;

    if (body.orbitRadius) {
      const orbit = createOrbit(body);
      orbitGroup.add(orbit.line);
      orbitEntries.push(orbit);
    }
  }

  const routeState = createRouteState(glowTexture);
  routeGroup.add(routeState.tube, routeState.glowLine, routeState.flowGroup, routeState.ship, routeState.gates);
  const departureScenery = createDepartureScenery(glowTexture);
  scene.add(departureScenery.group);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const currentTarget = new THREE.Vector3();
  const desiredTarget = new THREE.Vector3();
  const desiredCamera = new THREE.Vector3();
  const lookTarget = new THREE.Vector3();
  let width = 1;
  let height = 1;
  let routeCurve = null;
  let routeGeometryKey = "";
  let lastFrame = null;

  function resize(nextWidth, nextHeight, dpr) {
    width = Math.max(1, nextWidth);
    height = Math.max(1, nextHeight);
    renderer.setPixelRatio(Math.min(dpr || 1, 2));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function render(frame) {
    lastFrame = frame;
    updateBodies(frame);
    updateOrbits(frame);
    updateRoute(frame);
    updateDepartureScenery(frame);
    updateOortCloud(frame);
    updateCamera(frame);
    updateCockpitStreaks(frame, cockpitStreaks);
    updateLabels(frame);
    starfield.rotation.y = frame.sceneTime * 0.003;
    starfield.rotation.x = Math.sin(frame.sceneTime * 0.025) * 0.018;
    renderer.render(scene, camera);
  }

  function updateDepartureScenery(frame) {
    const active = frame.state.viewMode === "cockpit" && routeCurve;
    if (!active) {
      departureScenery.group.visible = false;
      return;
    }
    const progress = resolveCockpitProgress(frame);
    const fade = THREE.MathUtils.clamp(1 - progress / 0.16, 0, 1);
    departureScenery.group.visible = fade > 0.01;
    if (!departureScenery.group.visible) return;
    const originEntry = bodyEntries.get(frame.state.origin);
    departureScenery.group.position.copy(originEntry.group.position);
    departureScenery.group.scale.setScalar(Math.max(2.2, originEntry.displayRadius * 1.15));
    departureScenery.group.rotation.y = frame.sceneTime * 0.12;
    departureScenery.group.rotation.z = Math.sin(frame.sceneTime * 0.18) * 0.08;
    for (const material of departureScenery.materials) material.opacity = material.userData.baseOpacity * fade;
  }

  function updateOortCloud(frame) {
    const arriving = frame.state.destination === "oort" && frame.state.viewMode === "cockpit";
    const progress = arriving ? resolveCockpitProgress(frame) : 0;
    oortCloud.group.rotation.y = frame.sceneTime * 0.0012;
    oortCloud.group.rotation.x = Math.sin(frame.sceneTime * 0.006) * 0.025;
    oortCloud.points.material.opacity = arriving ? 0.24 + progress * 0.5 : 0.2;
    oortCloud.comets.material.opacity = arriving ? 0.18 + progress * 0.42 : 0.12;
  }

  function pick(clientX, clientY) {
    if (!lastFrame) return null;
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(pickMeshes, false);
    return hits.find((hit) => hit.object.userData.bodyId !== "sun")?.object.userData.bodyId || null;
  }

  function updateBodies(frame) {
    const routeIds = new Set(frame.route.waypoints);
    for (const body of bodies) {
      const entry = bodyEntries.get(body.id);
      const position = getBodyPosition(body.id, frame.state.day);
      entry.group.position.set(position.x, position.y, position.z);

      const visual = visuals[body.id] || {};
      const spin = visual.texture?.liveSpin || (body.id === "sun" ? 0.012 : 0.006);
      entry.surface.rotation.y = frame.sceneTime * spin * 8 + (body.phase || 0);
      if (entry.clouds) entry.clouds.rotation.y = entry.surface.rotation.y * 1.08 + 0.2;

      const selected = body.id === frame.state.selectedBody || routeIds.has(body.id);
      entry.halo.visible =
        body.id === "sun" ||
        (selected && frame.state.viewMode !== "cockpit" && frame.state.viewMode !== "destination");
      if (selected) {
        const pulse = 1 + Math.sin(frame.sceneTime * 2.2 + body.priority) * 0.06;
        entry.halo.scale.setScalar(entry.displayRadius * 4.3 * pulse);
        entry.halo.material.opacity = routeIds.has(body.id) ? 0.72 : 0.46;
      }

      if (entry.atmosphere) {
        entry.atmosphere.material.opacity = body.id === frame.state.destination ? 0.19 : 0.1;
      }
    }
  }

  function updateOrbits(frame) {
    for (const orbit of orbitEntries) {
      const parent = orbit.body.parent ? getBodyPosition(orbit.body.parent, frame.state.day) : { x: 0, y: 0, z: 0 };
      orbit.line.position.set(parent.x, parent.y, parent.z);
      const active = orbit.body.id === frame.state.origin || orbit.body.id === frame.state.destination;
      orbit.line.material.color.set(active ? 0xf1b75c : 0xa9b7bd);
      orbit.line.material.opacity = frame.state.layers.orbits ? (active ? 0.42 : 0.13) : 0;
      orbit.line.visible = frame.state.layers.orbits;
    }
  }

  function updateRoute(frame) {
    const vectors = frame.routePoints.map((point) => new THREE.Vector3(point.x, point.y, point.z));
    if (vectors.length < 2) {
      routeGroup.visible = false;
      routeCurve = null;
      return;
    }
    routeGroup.visible = true;
    routeCurve = new THREE.CatmullRomCurve3(vectors, false, "centripetal", 0.35);
    const destinationView = frame.state.viewMode === "destination";
    routeState.tube.visible = !destinationView && frame.state.viewMode !== "cockpit";
    routeState.glowLine.visible = !destinationView;
    routeState.flowGroup.visible = !destinationView;

    const routeKey = `${frame.route.waypoints.join("-")}:${Math.floor(frame.state.day / 2)}`;
    if (routeKey !== routeGeometryKey) {
      routeGeometryKey = routeKey;
      const tubeGeometry = new THREE.TubeGeometry(routeCurve, Math.max(72, vectors.length), 0.52, 7, false);
      routeState.tube.geometry.dispose();
      routeState.tube.geometry = tubeGeometry;
    }

    const routePositions = routeState.glowLine.geometry.attributes.position;
    for (let index = 0; index < vectors.length; index += 1) {
      routePositions.setXYZ(index, vectors[index].x, vectors[index].y, vectors[index].z);
    }
    routeState.glowLine.geometry.setDrawRange(0, vectors.length);
    routePositions.needsUpdate = true;
    routeState.glowLine.geometry.computeBoundingSphere();
    const vehicleColor = new THREE.Color(frame.vehicle.accent);
    routeState.tube.material.color.copy(vehicleColor);
    routeState.tube.material.opacity = frame.state.viewMode === "route" ? 0.9 : 0.7;
    routeState.glowLine.material.color.copy(vehicleColor);

    for (let index = 0; index < routeState.flow.length; index += 1) {
      const sprite = routeState.flow[index];
      const progress = wrap(frame.sceneTime * 0.085 + index / routeState.flow.length);
      const point = routeCurve.getPointAt(progress);
      sprite.position.copy(point);
      const pulse = 1.8 + Math.sin(frame.sceneTime * 3 + index) * 0.35;
      sprite.scale.setScalar(pulse);
      sprite.material.color.set(index % 3 === 0 ? 0xf1b75c : vehicleColor);
    }

    const shipVisible = frame.state.missionActive || frame.state.routeProgress > 0;
    routeState.ship.visible = shipVisible && frame.state.viewMode !== "cockpit" && !destinationView;
    if (shipVisible) {
      const progress = THREE.MathUtils.clamp(frame.state.routeProgress, 0, 0.9999);
      const point = routeCurve.getPointAt(progress);
      const tangent = routeCurve.getTangentAt(progress).normalize();
      routeState.ship.position.copy(point);
      routeState.ship.quaternion.setFromUnitVectors(UP, tangent);
      routeState.ship.material.color.copy(vehicleColor);
    }

    updateRouteGates(frame);
  }

  function updateRouteGates(frame) {
    const cockpit = frame.state.viewMode === "cockpit" && routeCurve;
    routeState.gates.visible = Boolean(cockpit);
    if (!cockpit) return;

    const baseProgress = resolveCockpitProgress(frame);
    const start = routeCurve.getPointAt(baseProgress);
    const destinationPosition = getBodyPosition(frame.state.destination, frame.state.day);
    const destination = new THREE.Vector3(destinationPosition.x, destinationPosition.y, destinationPosition.z);
    const direction = destination.clone().sub(start).normalize();
    for (let index = 0; index < routeState.gateMeshes.length; index += 1) {
      const gate = routeState.gateMeshes[index];
      const progress = 0.2 + index * 0.105;
      const point = new THREE.Vector3().lerpVectors(start, destination, progress);
      gate.position.copy(point);
      gate.quaternion.setFromUnitVectors(FORWARD, direction);
      const scale = 1.7 + index * 0.18;
      gate.scale.setScalar(scale);
      gate.material.opacity = 0.18 - index * 0.014;
      gate.rotation.z = frame.sceneTime * 0.08 + index * 0.31;
    }
  }

  function updateCamera(frame) {
    if (frame.state.viewMode === "cockpit" && routeCurve) {
      updateCockpitCamera(frame);
      return;
    }

    resolveTarget(frame, desiredTarget);
    const targetAmount = 1 - Math.exp(-frame.dt * 5.5);
    currentTarget.lerp(desiredTarget, targetAmount);

    const yaw = frame.state.camera.yaw;
    const pitch = frame.state.camera.pitch;
    const cosPitch = Math.cos(pitch);
    const direction = new THREE.Vector3(
      Math.sin(yaw) * cosPitch,
      Math.sin(pitch),
      Math.cos(yaw) * cosPitch,
    );

    let distance;
    if (frame.state.viewMode === "destination") {
      const destinationEntry = bodyEntries.get(frame.state.destination);
      const destinationBody = destinationEntry?.body;
      const closeupDistance = destinationBody?.ringed
        ? destinationEntry.displayRadius * 6.8
        : ["jupiter", "saturn", "uranus", "neptune"].includes(destinationBody?.id)
          ? destinationEntry.displayRadius * 4.7
          : 30;
      distance = closeupDistance * (3.05 / Math.max(frame.state.camera.zoom, 0.5));
    } else if (frame.state.viewMode === "route") {
      distance = 380 / Math.max(frame.state.camera.zoom, 0.5);
    } else {
      distance = 440 / Math.max(frame.state.camera.zoom, 0.5);
    }

    desiredCamera.copy(currentTarget).addScaledVector(direction, distance);
    const cameraAmount = 1 - Math.exp(-frame.dt * 7.2);
    camera.position.lerp(desiredCamera, cameraAmount);
    camera.up.set(0, 1, 0);
    camera.lookAt(currentTarget);
    camera.fov = THREE.MathUtils.lerp(camera.fov, frame.state.viewMode === "destination" ? 36 : 42, cameraAmount);
    camera.updateProjectionMatrix();
  }

  function updateCockpitCamera(frame) {
    const progress = resolveCockpitProgress(frame);
    const point = routeCurve.getPointAt(progress);
    const tangent = routeCurve.getTangentAt(Math.min(progress + 0.002, 0.999)).normalize();
    const side = new THREE.Vector3().crossVectors(tangent, UP).normalize();
    if (!Number.isFinite(side.x)) side.set(1, 0, 0);
    const originRadius = bodyEntries.get(frame.state.origin)?.displayRadius || 2;
    const departureAmount = 1 - THREE.MathUtils.smoothstep(progress, 0.01, 0.11);
    desiredCamera
      .copy(point)
      .addScaledVector(tangent, -3.4)
      .addScaledVector(UP, 1.25)
      .addScaledVector(side, 0.35);
    const originPosition = getBodyPosition(frame.state.origin, frame.state.day);
    const origin = new THREE.Vector3(originPosition.x, originPosition.y, originPosition.z);
    const departureCamera = origin
      .clone()
      .addScaledVector(tangent, -(originRadius * 2.7 + 8))
      .addScaledVector(UP, originRadius * 0.7 + 1.5)
      .addScaledVector(side, originRadius * 1.25);
    desiredCamera.lerp(departureCamera, departureAmount);
    lookTarget.copy(point).addScaledVector(tangent, 34).addScaledVector(UP, 0.4);
    const destination = getBodyPosition(frame.state.destination, frame.state.day);
    lookTarget.lerp(new THREE.Vector3(destination.x, destination.y, destination.z), 0.44 + (1 - departureAmount) * 0.38);
    const departureLook = origin.clone().addScaledVector(UP, originRadius * 0.12);
    lookTarget.lerp(departureLook, departureAmount);
    const amount = 1 - Math.exp(-frame.dt * 6.8);
    camera.position.lerp(desiredCamera, amount);
    currentTarget.lerp(lookTarget, amount);
    camera.up.set(0, 1, 0);
    camera.lookAt(currentTarget);
    camera.fov = THREE.MathUtils.lerp(camera.fov, width <= 760 ? 63 : 56, amount);
    camera.updateProjectionMatrix();
  }

  function resolveTarget(frame, target) {
    if (frame.state.viewMode === "destination") {
      const position = getBodyPosition(frame.state.destination, frame.state.day);
      target.set(position.x, position.y, position.z);
      return;
    }
    if (frame.state.viewMode === "route" && frame.routePoints.length) {
      target.set(0, 0, 0);
      for (const point of frame.routePoints) target.add(new THREE.Vector3(point.x, point.y, point.z));
      target.multiplyScalar(1 / frame.routePoints.length);
      return;
    }
    target.set(0, 0, 0);
  }

  function updateLabels(frame) {
    const routeIds = new Set(frame.route.waypoints);
    const candidates = [];
    for (const body of bodies) {
      const entry = bodyEntries.get(body.id);
      const active = routeIds.has(body.id);
      const required = active || body.priority >= 5 || body.id === frame.state.selectedBody;
      if (!frame.state.layers.labels || !required) {
        entry.label.hidden = true;
        continue;
      }
      if (frame.state.viewMode === "cockpit") {
        entry.label.hidden = true;
        continue;
      }
      if (frame.state.viewMode === "destination" && body.id === frame.state.destination) {
        entry.label.hidden = true;
        continue;
      }

      const projected = entry.group.position.clone().project(camera);
      const visible = projected.z > -1 && projected.z < 1;
      if (!visible) {
        entry.label.hidden = true;
        continue;
      }
      const x = (projected.x * 0.5 + 0.5) * width;
      const y = (-projected.y * 0.5 + 0.5) * height;
      if (x < 12 || x > width - 12 || y < 86 || y > height - 72) {
        entry.label.hidden = true;
        continue;
      }
      const routeIndex = frame.route.waypoints.indexOf(body.id);
      const role = routeIndex === 0 ? "出发" : routeIndex === frame.route.waypoints.length - 1 ? "抵达" : "中继";
      entry.label.textContent = active ? `${role} · ${body.name}` : body.name;
      entry.label.classList.toggle("is-route", active);
      entry.label.classList.toggle("is-target", body.id === frame.state.destination);
      candidates.push({ body, entry, x, y, active, priority: active ? 100 + routeIndex : body.priority });
    }

    candidates.sort((a, b) => b.priority - a.priority);
    const occupied = [];
    for (const candidate of candidates) {
      const widthGuess = candidate.entry.label.textContent.length * 12 + 24;
      const offsetY = candidate.active ? (candidate.body.id === frame.state.origin ? 18 : -20) : 0;
      const rect = { x: candidate.x + 12, y: candidate.y - 12 + offsetY, w: widthGuess, h: 25 };
      const overlaps = occupied.some((other) => intersects(rect, other));
      if (overlaps && !candidate.active) {
        candidate.entry.label.hidden = true;
        continue;
      }
      if (overlaps) rect.y += candidate.body.id === frame.state.origin ? 30 : -30;
      occupied.push(rect);
      candidate.entry.label.hidden = false;
      candidate.entry.label.style.transform = `translate3d(${Math.round(rect.x)}px, ${Math.round(rect.y)}px, 0)`;
    }
  }

  return { resize, render, pick, renderer, scene, camera };
}

function createBody(body, visual, textureLoader, anisotropy, glowTexture, ringTexture) {
  const group = new THREE.Group();
  group.name = body.id;
  const giantScale = ["jupiter", "saturn", "uranus", "neptune"].includes(body.id) ? 1.34 : 1.14;
  const displayRadius = body.id === "sun" ? 11.5 : Math.max(body.radius * giantScale, body.family === "卫星" ? 0.82 : 1.3);
  const geometry = body.region
    ? new THREE.DodecahedronGeometry(displayRadius, 2)
    : new THREE.SphereGeometry(displayRadius, body.priority >= 7 ? 96 : 48, body.priority >= 7 ? 64 : 32);
  const material = createBodyMaterial(body, visual);
  const surface = new THREE.Mesh(geometry, material);
  surface.userData.bodyId = body.id;
  surface.rotation.z = body.axialTilt ?? (body.id === "earth" ? 0.41 : body.id === "saturn" ? 0.47 : 0.12);
  if (body.region) surface.scale.set(1.45, 0.72, 1.05);
  group.add(surface);

  if (body.region) {
    const fragmentGeometry = new THREE.DodecahedronGeometry(displayRadius * 0.1, 0);
    const fragmentMaterial = new THREE.MeshStandardMaterial({
      color: 0xc9edf3,
      emissive: 0x315a66,
      emissiveIntensity: 0.7,
      roughness: 0.72,
      metalness: 0,
    });
    const fragments = new THREE.InstancedMesh(fragmentGeometry, fragmentMaterial, 74);
    const matrix = new THREE.Matrix4();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const position = new THREE.Vector3();
    const seed = hashString(body.id);
    for (let index = 0; index < 74; index += 1) {
      const angle = seededUnit(seed + index * 19) * TAU;
      const radius = displayRadius * (2.2 + seededUnit(seed + index * 23) * 8.4);
      position.set(
        Math.cos(angle) * radius,
        (seededUnit(seed + index * 29) - 0.5) * displayRadius * 5,
        Math.sin(angle) * radius,
      );
      rotation.setFromEuler(new THREE.Euler(angle, index * 0.31, index * 0.17));
      const fragmentScale = 0.55 + seededUnit(seed + index * 31) * 2.1;
      scale.set(fragmentScale, fragmentScale * 0.72, fragmentScale * 1.2);
      matrix.compose(position, rotation, scale);
      fragments.setMatrixAt(index, matrix);
    }
    group.add(fragments);
  }

  if (visual.texture?.src) {
    textureLoader.load(
      visual.texture.src,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = THREE.RepeatWrapping;
        texture.anisotropy = anisotropy;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = true;
        texture.rotation = 0;
        texture.offset.x = visual.texture.offset || 0;
        material.map = texture;
        material.color.set(body.id === "mars" ? 0xd88968 : 0xffffff);
        material.needsUpdate = true;
      },
      undefined,
      () => {},
    );
  } else if (body.id !== "sun") {
    const texture = createProceduralPlanetTexture(body, visual);
    texture.anisotropy = anisotropy;
    material.map = texture;
    material.color.set(0xffffff);
    material.needsUpdate = true;
  }

  const glowColor = new THREE.Color(visual.glow || visual.haze || body.accent || body.color);
  const atmosphereMaterial = new THREE.MeshBasicMaterial({
    color: glowColor,
    transparent: true,
    opacity: body.id === "sun" ? 0.24 : 0.1,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const atmosphere = new THREE.Mesh(geometry.clone(), atmosphereMaterial);
  atmosphere.scale.setScalar(body.id === "sun" ? 1.34 : 1.045);
  group.add(atmosphere);

  let clouds = null;
  if (body.id === "earth") {
    clouds = new THREE.Mesh(
      geometry.clone(),
      new THREE.MeshPhongMaterial({ color: 0xd8eef2, transparent: true, opacity: 0.08, depthWrite: false }),
    );
    clouds.scale.setScalar(1.012);
    group.add(clouds);
  }

  if (body.ringed) {
    const innerScale = body.ringInner || 1.35;
    const outerScale = body.ringOuter || 2.28;
    const planetRingTexture = createPlanetRingTexture(body, visual);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(displayRadius * innerScale, displayRadius * outerScale, 256, 8),
      new THREE.MeshBasicMaterial({
        map: planetRingTexture,
        color: 0xffffff,
        transparent: true,
        opacity: body.id === "uranus" ? 0.62 : 0.92,
        side: THREE.DoubleSide,
        alphaTest: 0.025,
        depthWrite: false,
      }),
    );
    ring.rotation.x = body.id === "uranus" ? 0.5 : Math.PI / 2 - 0.28;
    ring.rotation.z = -0.22;
    ring.renderOrder = 2;
    group.add(ring);
  }

  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: body.id === "sun" ? glowTexture : ringTexture,
      color: body.id === "sun" ? 0xffb34b : body.accent,
      transparent: true,
      opacity: body.id === "sun" ? 0.88 : 0.58,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: body.id !== "sun",
    }),
  );
  halo.scale.setScalar(body.id === "sun" ? displayRadius * 5.2 : displayRadius * 4.3);
  halo.visible = body.id === "sun";
  group.add(halo);

  return { body, group, surface, atmosphere, clouds, halo, displayRadius, label: null };
}

function createBodyMaterial(body, visual) {
  if (body.id === "sun") {
    return new THREE.MeshBasicMaterial({ color: visual.palette?.[1] || body.color });
  }
  if (body.region) {
    return new THREE.MeshStandardMaterial({
      color: visual.palette?.[0] || body.color,
      roughness: 0.68,
      metalness: 0,
      emissive: 0x477b88,
      emissiveIntensity: 1.15,
      flatShading: true,
    });
  }
  const color = visual.palette?.[0] || body.color;
  return new THREE.MeshStandardMaterial({
    color,
    roughness: visual.kind === "ice" || visual.kind === "iceGiant" ? 0.58 : 0.82,
    metalness: 0,
    emissive: new THREE.Color(body.color).multiplyScalar(0.035),
    emissiveIntensity: 0.45,
  });
}

function createProceduralPlanetTexture(body, visual) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  const palette = visual.palette?.length ? visual.palette : [body.color, body.accent, "#ffffff", "#20252b"];
  const base = context.createLinearGradient(0, 0, 0, canvas.height);
  base.addColorStop(0, palette[2] || palette[0]);
  base.addColorStop(0.32, palette[0]);
  base.addColorStop(0.68, palette[1] || palette[0]);
  base.addColorStop(1, palette[3] || palette[1] || palette[0]);
  context.fillStyle = base;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const seed = hashString(body.id);
  const banded = ["gas", "iceGiant", "clouded", "haze"].includes(visual.kind);
  if (banded) {
    const bands = visual.bands || 12;
    for (let index = 0; index < bands * 3; index += 1) {
      const y = (index / (bands * 3)) * canvas.height + Math.sin(index * 1.9 + seed) * 8;
      const height = 5 + seededUnit(seed + index * 7) * 22;
      context.fillStyle = colorWithAlpha(palette[index % palette.length], 0.12 + seededUnit(seed + index * 11) * 0.26);
      context.fillRect(0, y, canvas.width, height);
      context.fillStyle = "rgba(255,255,255,0.035)";
      context.fillRect(0, y + height * 0.22, canvas.width, Math.max(1, height * 0.12));
    }
  }

  if (["cratered", "iceRock", "irregular", "twoTone", "volcanic"].includes(visual.kind)) {
    if (visual.kind === "twoTone") {
      const shade = context.createLinearGradient(340, 0, 720, 0);
      shade.addColorStop(0, "rgba(22,20,18,0.68)");
      shade.addColorStop(1, "rgba(22,20,18,0)");
      context.fillStyle = shade;
      context.fillRect(0, 0, 720, canvas.height);
    }
    const craterCount = (visual.craters || 12) * 3;
    for (let index = 0; index < craterCount; index += 1) {
      const x = seededUnit(seed + index * 13 + 1) * canvas.width;
      const y = seededUnit(seed + index * 17 + 2) * canvas.height;
      const radius = 4 + seededUnit(seed + index * 23 + 3) * 31;
      const crater = context.createRadialGradient(x - radius * 0.22, y - radius * 0.25, radius * 0.08, x, y, radius);
      crater.addColorStop(0, "rgba(255,255,255,0.2)");
      crater.addColorStop(0.28, "rgba(255,255,255,0.06)");
      crater.addColorStop(0.62, "rgba(16,15,15,0.34)");
      crater.addColorStop(1, "rgba(0,0,0,0)");
      context.fillStyle = crater;
      context.beginPath();
      context.arc(x, y, radius, 0, TAU);
      context.fill();
    }
  }

  if (["ice", "iceRock"].includes(visual.kind)) {
    context.lineWidth = 1.5;
    context.strokeStyle = colorWithAlpha(palette[1] || "#8fcddd", 0.42);
    for (let index = 0; index < (visual.cracks || 10); index += 1) {
      const y = seededUnit(seed + index * 19) * canvas.height;
      context.beginPath();
      context.moveTo(0, y);
      for (let step = 1; step <= 8; step += 1) {
        context.lineTo((step / 8) * canvas.width, y + Math.sin(step * 1.7 + index) * (8 + index % 4));
      }
      context.stroke();
    }
  }

  if (visual.kind === "volcanic") {
    for (let index = 0; index < 18; index += 1) {
      const x = seededUnit(seed + index * 29) * canvas.width;
      const y = seededUnit(seed + index * 31) * canvas.height;
      const radius = 4 + seededUnit(seed + index * 37) * 18;
      context.fillStyle = index % 3 ? "rgba(105,65,26,0.52)" : "rgba(255,236,139,0.72)";
      context.beginPath();
      context.arc(x, y, radius, 0, TAU);
      context.fill();
    }
  }

  for (let index = 0; index < 620; index += 1) {
    const x = seededUnit(seed + index * 41) * canvas.width;
    const y = seededUnit(seed + index * 43) * canvas.height;
    const alpha = 0.018 + seededUnit(seed + index * 47) * 0.055;
    context.fillStyle = index % 2 ? `rgba(255,255,255,${alpha})` : `rgba(0,0,0,${alpha})`;
    context.fillRect(x, y, 1 + (index % 3), 1 + (index % 2));
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

function createPlanetRingTexture(body, visual) {
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 768;
  const context = canvas.getContext("2d");
  const center = canvas.width / 2;
  const base = visual.ringColor || body.accent || "#d8cfb5";
  const inner = body.id === "uranus" ? 214 : 182;
  const outer = 370;
  const bands = body.id === "uranus" ? 14 : 46;
  for (let index = 0; index < bands; index += 1) {
    const t = index / Math.max(1, bands - 1);
    const radius = inner + (outer - inner) * t;
    const gap = body.id === "saturn" && (index === 19 || index === 20 || index === 33);
    const alpha = gap ? 0.025 : 0.16 + seededUnit(hashString(body.id) + index * 17) * 0.68;
    context.strokeStyle = colorWithAlpha(base, alpha);
    context.lineWidth = body.id === "uranus" ? 2 + (index % 3) : 3 + (index % 5);
    context.beginPath();
    context.arc(center, center, radius, 0, TAU);
    context.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

function colorWithAlpha(color, alpha) {
  const value = new THREE.Color(color);
  return `rgba(${Math.round(value.r * 255)},${Math.round(value.g * 255)},${Math.round(value.b * 255)},${alpha})`;
}

function hashString(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

function seededUnit(seed) {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function createOrbit(body) {
  const points = [];
  const samples = body.parent === "sun" ? 220 : 120;
  for (let index = 0; index <= samples; index += 1) {
    const angle = (index / samples) * TAU;
    points.push(
      new THREE.Vector3(
        Math.cos(angle) * body.orbitRadius,
        Math.sin(angle * 1.7 + (body.phase || 0)) * (body.inclination || 0),
        Math.sin(angle) * body.orbitRadius,
      ),
    );
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({ color: 0xa9b7bd, transparent: true, opacity: 0.13, depthWrite: false });
  return { body, line: new THREE.LineLoop(geometry, material) };
}

function createRouteState(glowTexture) {
  const routePositions = new Float32Array(256 * 3);
  const emptyGeometry = new THREE.BufferGeometry();
  const routeAttribute = new THREE.BufferAttribute(routePositions, 3);
  routeAttribute.setUsage(THREE.DynamicDrawUsage);
  emptyGeometry.setAttribute("position", routeAttribute);
  emptyGeometry.setDrawRange(0, 2);
  const tube = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.LineCurve3(new THREE.Vector3(), new THREE.Vector3(0, 0, 0.01)), 2, 0.45, 6, false),
    new THREE.MeshBasicMaterial({ color: 0xf1b75c, transparent: true, opacity: 0.74, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  const glowLine = new THREE.Line(
    emptyGeometry,
    new THREE.LineBasicMaterial({ color: 0xf1b75c, transparent: true, opacity: 0.44, blending: THREE.AdditiveBlending, depthWrite: false }),
  );

  const flowGroup = new THREE.Group();
  const flow = [];
  for (let index = 0; index < 10; index += 1) {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTexture, color: 0xf1b75c, transparent: true, opacity: 0.86, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    flow.push(sprite);
    flowGroup.add(sprite);
  }

  const ship = new THREE.Mesh(
    new THREE.ConeGeometry(1.2, 4.2, 4),
    new THREE.MeshBasicMaterial({ color: 0xf1b75c }),
  );
  ship.visible = false;

  const gates = new THREE.Group();
  gates.visible = false;
  const gateMeshes = [];
  for (let index = 0; index < 6; index += 1) {
    const gate = new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.025, 6, 64),
      new THREE.MeshBasicMaterial({ color: index % 2 ? 0x91c8d1 : 0xf1b75c, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    gateMeshes.push(gate);
    gates.add(gate);
  }

  return { tube, glowLine, flowGroup, flow, ship, gates, gateMeshes };
}

function createDepartureScenery(glowTexture) {
  const group = new THREE.Group();
  group.visible = false;
  const materials = [];
  const ringSpecs = [
    { radius: 1.7, tube: 0.018, color: 0x91d9e5, opacity: 0.48, x: 1.18, z: 0.12 },
    { radius: 2.2, tube: 0.012, color: 0xf1b75c, opacity: 0.34, x: 0.72, z: -0.34 },
    { radius: 2.7, tube: 0.009, color: 0xc7eff4, opacity: 0.22, x: 1.5, z: 0.48 },
  ];
  for (const spec of ringSpecs) {
    const material = new THREE.MeshBasicMaterial({
      color: spec.color,
      transparent: true,
      opacity: spec.opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    material.userData.baseOpacity = spec.opacity;
    materials.push(material);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(spec.radius, spec.tube, 6, 96), material);
    ring.rotation.x = spec.x;
    ring.rotation.z = spec.z;
    group.add(ring);
  }

  for (let index = 0; index < 12; index += 1) {
    const material = new THREE.SpriteMaterial({
      map: glowTexture,
      color: index % 3 === 0 ? 0xf1b75c : 0x91d9e5,
      transparent: true,
      opacity: 0.62,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    material.userData.baseOpacity = 0.62;
    materials.push(material);
    const beacon = new THREE.Sprite(material);
    const angle = (index / 12) * TAU;
    const radius = 1.9 + (index % 4) * 0.22;
    beacon.position.set(Math.cos(angle) * radius, Math.sin(angle * 2.1) * 0.35, Math.sin(angle) * radius);
    beacon.scale.setScalar(index % 3 === 0 ? 0.18 : 0.1);
    group.add(beacon);
  }
  return { group, materials };
}

function createOortCloud() {
  const group = new THREE.Group();
  const count = 6200;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const ice = new THREE.Color(0xaed8e3);
  const dust = new THREE.Color(0x86979d);
  for (let index = 0; index < count; index += 1) {
    const shell = 430 + Math.pow(Math.random(), 0.72) * 310;
    const theta = Math.random() * TAU;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[index * 3] = shell * Math.sin(phi) * Math.cos(theta);
    positions[index * 3 + 1] = shell * Math.cos(phi) * 0.78;
    positions[index * 3 + 2] = shell * Math.sin(phi) * Math.sin(theta);
    const color = Math.random() > 0.42 ? ice : dust;
    const brightness = 0.35 + Math.random() * 0.65;
    colors[index * 3] = color.r * brightness;
    colors[index * 3 + 1] = color.g * brightness;
    colors[index * 3 + 2] = color.b * brightness;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const points = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      size: 1.8,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0.2,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  group.add(points);

  const cometCount = 90;
  const cometPositions = new Float32Array(cometCount * 6);
  for (let index = 0; index < cometCount; index += 1) {
    const radius = 450 + Math.random() * 260;
    const theta = Math.random() * TAU;
    const y = (Math.random() - 0.5) * 530;
    const x = Math.cos(theta) * radius;
    const z = Math.sin(theta) * radius;
    const offset = index * 6;
    cometPositions[offset] = x;
    cometPositions[offset + 1] = y;
    cometPositions[offset + 2] = z;
    cometPositions[offset + 3] = x * 1.018;
    cometPositions[offset + 4] = y * 1.018;
    cometPositions[offset + 5] = z * 1.018;
  }
  const cometGeometry = new THREE.BufferGeometry();
  cometGeometry.setAttribute("position", new THREE.BufferAttribute(cometPositions, 3));
  const comets = new THREE.LineSegments(
    cometGeometry,
    new THREE.LineBasicMaterial({
      color: 0xbfefff,
      transparent: true,
      opacity: 0.12,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  group.add(comets);
  return { group, points, comets };
}

function createStarfield() {
  const count = 2800;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const warm = new THREE.Color(0xe8dfce);
  const cool = new THREE.Color(0x8faebc);
  for (let index = 0; index < count; index += 1) {
    const radius = 520 + Math.random() * 1050;
    const theta = Math.random() * TAU;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[index * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[index * 3 + 1] = radius * Math.cos(phi);
    positions[index * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
    const tone = Math.random() > 0.72 ? warm : cool;
    const brightness = 0.45 + Math.random() * 0.55;
    colors[index * 3] = tone.r * brightness;
    colors[index * 3 + 1] = tone.g * brightness;
    colors[index * 3 + 2] = tone.b * brightness;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({ size: 1.35, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false });
  return new THREE.Points(geometry, material);
}

function createCockpitStreaks() {
  const count = 150;
  const positions = new Float32Array(count * 6);
  const speeds = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    resetStreak(positions, speeds, index, true);
  }
  const geometry = new THREE.BufferGeometry();
  const attribute = new THREE.BufferAttribute(positions, 3);
  attribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("position", attribute);
  const material = new THREE.LineBasicMaterial({
    color: 0xb9d7e0,
    transparent: true,
    opacity: 0.34,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const lines = new THREE.LineSegments(geometry, material);
  lines.frustumCulled = false;
  lines.visible = false;
  return { lines, positions, speeds, count };
}

function updateCockpitStreaks(frame, streaks) {
  const active = frame.state.viewMode === "cockpit";
  streaks.lines.visible = active;
  if (!active) return;
  const routeProgress = frame.state.missionActive || frame.state.routeProgress > 0 ? frame.state.routeProgress : 0.015;
  streaks.lines.material.opacity = 0.12 + THREE.MathUtils.smoothstep(routeProgress, 0.05, 0.28) * 0.3;
  const boost = frame.state.missionActive ? 1.7 : 0.85;
  for (let index = 0; index < streaks.count; index += 1) {
    const offset = index * 6;
    const step = frame.dt * streaks.speeds[index] * boost;
    streaks.positions[offset + 2] += step;
    streaks.positions[offset + 5] += step;
    if (streaks.positions[offset + 2] > -2) resetStreak(streaks.positions, streaks.speeds, index, false);
  }
  streaks.lines.geometry.attributes.position.needsUpdate = true;
}

function resetStreak(positions, speeds, index, initial) {
  const offset = index * 6;
  const z = initial ? -12 - Math.random() * 180 : -150 - Math.random() * 80;
  const spread = 7 + Math.abs(z) * 0.2;
  const x = (Math.random() - 0.5) * spread;
  const y = (Math.random() - 0.5) * spread * 0.62;
  const length = 1.6 + Math.random() * 4.2;
  positions[offset] = x;
  positions[offset + 1] = y;
  positions[offset + 2] = z;
  positions[offset + 3] = x * 1.018;
  positions[offset + 4] = y * 1.018;
  positions[offset + 5] = z + length;
  speeds[index] = 28 + Math.random() * 56;
}

function createGlowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.12, "rgba(255,238,188,0.95)");
  gradient.addColorStop(0.38, "rgba(241,183,92,0.38)");
  gradient.addColorStop(1, "rgba(241,183,92,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createRingTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  context.strokeStyle = "rgba(255,255,255,0.92)";
  context.lineWidth = 4;
  context.beginPath();
  context.arc(64, 64, 45, 0, TAU);
  context.stroke();
  context.strokeStyle = "rgba(255,255,255,0.28)";
  context.lineWidth = 1;
  context.beginPath();
  context.arc(64, 64, 56, 0, TAU);
  context.stroke();
  return new THREE.CanvasTexture(canvas);
}

function createLabelLayer(canvas) {
  const layer = document.createElement("div");
  layer.className = "webgl-label-layer";
  layer.setAttribute("aria-hidden", "true");
  canvas.insertAdjacentElement("afterend", layer);
  return layer;
}

function createBodyLabel(body) {
  const label = document.createElement("span");
  label.className = "space-label";
  label.dataset.body = body.id;
  label.textContent = body.name;
  label.hidden = true;
  return label;
}

function resolveCockpitProgress(frame) {
  if (frame.state.missionActive || frame.state.routeProgress > 0) {
    return THREE.MathUtils.clamp(frame.state.routeProgress, 0.008, 0.96);
  }
  return 0.015 + Math.sin(frame.sceneTime * 0.12) * 0.0025;
}

function intersects(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function wrap(value) {
  return ((value % 1) + 1) % 1;
}
