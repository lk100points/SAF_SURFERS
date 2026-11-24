import * as THREE from 'three';

/* SAF SURF — procedural endless runner. No downloaded models or image assets. */

const CONFIG = {
  lanes: [-3.1, 0, 3.1],
  playerZ: 4.0,
  roadWidth: 11.2,
  segmentLength: 32,
  segmentCount: 8,
  initialSpeed: 15.5,
  maxSpeed: 28,
  fixedStep: 1 / 60,
  colors: {
    night: 0x0b1020,
    asphalt: 0x14161c,
    white: 0xe8eef7,
    amber: 0xffb35c,
    cyan: 0x4fd1ff,
    tea: 0x7cff6b,
    blue: 0x3c7bff,
    red: 0xff3c4e
  }
};

const $ = (id) => document.getElementById(id);
const sceneHost = $('scene');

const STORAGE_KEY = 'saf-surf-save-v1';
const DEFAULT_SAVE = {
  tea: 0,
  best: 0,
  selected: { top: 'midnight', shoes: 'chalk' },
  unlocked: { top: ['midnight'], shoes: ['chalk'] },
  hintSeen: false
};

const SHOP = {
  top: [
    { id: 'midnight', name: 'MIDNIGHT', color: '#263B59', price: 0 },
    { id: 'sand', name: 'SAND', color: '#A17A56', price: 20 },
    { id: 'bone', name: 'BONE', color: '#D7D0C4', price: 50 },
    { id: 'pine', name: 'PINE', color: '#345B49', price: 100 },
    { id: 'oxide', name: 'OXIDE', color: '#B65B3D', price: 200 },
    { id: 'graphite', name: 'GRAPHITE', color: '#303640', price: 200 }
  ],
  shoes: [
    { id: 'chalk', name: 'CHALK', color: '#E6E4DD', price: 0 },
    { id: 'ice', name: 'ICE', color: '#58B8CC', price: 20 },
    { id: 'acid', name: 'ACID', color: '#7CFF6B', price: 50 },
    { id: 'wine', name: 'WINE', color: '#7A3442', price: 100 },
    { id: 'amber', name: 'AMBER', color: '#EFA63F', price: 200 },
    { id: 'black', name: 'BLACK', color: '#20242B', price: 200 }
  ]
};

function loadSave() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredCloneSafe(DEFAULT_SAVE);
    const parsed = JSON.parse(raw);
    const save = structuredCloneSafe(DEFAULT_SAVE);
    save.tea = Math.max(0, Number(parsed.tea) || 0);
    save.best = Math.max(0, Number(parsed.best) || 0);
    save.hintSeen = Boolean(parsed.hintSeen);
    for (const category of ['top', 'shoes']) {
      if (typeof parsed.selected?.[category] === 'string') save.selected[category] = parsed.selected[category];
      if (Array.isArray(parsed.unlocked?.[category])) {
        save.unlocked[category] = [...new Set(['top', 'shoes'].includes(category) ? parsed.unlocked[category].filter((id) => SHOP[category].some((item) => item.id === id)) : [])];
      }
      if (!SHOP[category].some((item) => item.id === save.selected[category])) save.selected[category] = DEFAULT_SAVE.selected[category];
      if (!save.unlocked[category].includes(save.selected[category])) save.selected[category] = DEFAULT_SAVE.selected[category];
    }
    return save;
  } catch (error) {
    console.warn('Save data could not be read; using a fresh save.', error);
    return structuredCloneSafe(DEFAULT_SAVE);
  }
}

function structuredCloneSafe(value) {
  return JSON.parse(JSON.stringify(value));
}

const saveData = loadSave();
function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(saveData)); }
  catch (error) { console.warn('Progress could not be saved.', error); }
}

// -----------------------------------------------------------------------------
// Renderer, scene, lighting and reusable materials
// -----------------------------------------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x10192b);
scene.fog = new THREE.FogExp2(0x111a2d, 0.0128);

const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 240);
camera.position.set(0, 5.6, 9);
camera.lookAt(0, 1.2, -8);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.32;
renderer.shadowMap.enabled = false;
sceneHost.appendChild(renderer.domElement);

const hemi = new THREE.HemisphereLight(0xa9c3e5, 0x252b3a, 1.48);
scene.add(hemi);
const moon = new THREE.DirectionalLight(0xd6e5ff, 2.05);
moon.position.set(-7, 14, 8);
scene.add(moon);
const warmLampLight = new THREE.PointLight(0xffc47e, 38, 40, 2);
warmLampLight.position.set(-4.0, 4.8, -5.5);
scene.add(warmLampLight);
const coolLampLight = new THREE.PointLight(0x92dfff, 24, 32, 2);
coolLampLight.position.set(4.0, 3.4, 5.3);
scene.add(coolLampLight);

// Small, deterministic canvas textures add surface character without external assets.
function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function configureTexture(texture, repeatX = 1, repeatY = 1) {
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.anisotropy = Math.min(renderer?.capabilities?.getMaxAnisotropy?.() || 4, 4);
  texture.needsUpdate = true;
  return texture;
}

function makeAsphaltMaps() {
  const size = 512;
  const colorCanvas = document.createElement('canvas');
  const bumpCanvas = document.createElement('canvas');
  colorCanvas.width = colorCanvas.height = bumpCanvas.width = bumpCanvas.height = size;
  const colorCtx = colorCanvas.getContext('2d');
  const bumpCtx = bumpCanvas.getContext('2d');
  const random = seededRandom(41721);
  const colorData = colorCtx.createImageData(size, size);
  const bumpData = bumpCtx.createImageData(size, size);
  for (let i = 0; i < size * size; i += 1) {
    const grain = (random() - 0.5) * 13;
    const cloud = (Math.sin((i % size) * 0.047) + Math.sin(Math.floor(i / size) * 0.033)) * 1.8;
    const value = 29 + grain + cloud;
    const offset = i * 4;
    colorData.data[offset] = Math.max(0, Math.min(255, value * 0.82));
    colorData.data[offset + 1] = Math.max(0, Math.min(255, value * 0.9));
    colorData.data[offset + 2] = Math.max(0, Math.min(255, value * 1.13));
    colorData.data[offset + 3] = 255;
    const bump = 106 + grain * 3.1 + cloud * 2;
    bumpData.data[offset] = bump;
    bumpData.data[offset + 1] = bump;
    bumpData.data[offset + 2] = bump;
    bumpData.data[offset + 3] = 255;
  }
  colorCtx.putImageData(colorData, 0, 0);
  bumpCtx.putImageData(bumpData, 0, 0);
  // Fine aggregate, hairline cracks and worn patches.
  for (let i = 0; i < 1450; i += 1) {
    const x = random() * size;
    const y = random() * size;
    const r = 0.35 + random() * 1.45;
    const light = random() > 0.52;
    colorCtx.fillStyle = light ? 'rgba(120,137,158,0.13)' : 'rgba(0,0,0,0.2)';
    colorCtx.fillRect(x, y, r * 1.8, r);
    const b = light ? 145 : 72;
    bumpCtx.fillStyle = `rgba(${b},${b},${b},0.45)`;
    bumpCtx.fillRect(x, y, r * 1.8, r);
  }
  for (let i = 0; i < 18; i += 1) {
    const x = random() * size;
    const y = random() * size;
    colorCtx.strokeStyle = 'rgba(2,5,12,0.24)';
    colorCtx.lineWidth = 0.7 + random() * 0.8;
    colorCtx.beginPath();
    colorCtx.moveTo(x, y);
    colorCtx.lineTo(x + (random() - 0.5) * 23, y + 5 + random() * 27);
    colorCtx.stroke();
    bumpCtx.strokeStyle = 'rgba(65,65,65,0.55)';
    bumpCtx.lineWidth = 1;
    bumpCtx.beginPath();
    bumpCtx.moveTo(x, y);
    bumpCtx.lineTo(x + (random() - 0.5) * 23, y + 5 + random() * 27);
    bumpCtx.stroke();
  }
  // Irregular damp patches catch nearby lamp light without a costly reflection pass.
  for (let i = 0; i < 34; i += 1) {
    const x = random() * size;
    const y = random() * size;
    const rx = 5 + random() * 19;
    const ry = 2 + random() * 8;
    colorCtx.save();
    colorCtx.translate(x, y);
    colorCtx.rotate((random() - 0.5) * 0.55);
    const puddle = colorCtx.createRadialGradient(0, 0, 1, 0, 0, rx);
    puddle.addColorStop(0, 'rgba(3,10,20,0.17)');
    puddle.addColorStop(0.72, 'rgba(92,124,154,0.09)');
    puddle.addColorStop(1, 'rgba(130,160,190,0)');
    colorCtx.fillStyle = puddle;
    colorCtx.beginPath();
    colorCtx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    colorCtx.fill();
    colorCtx.restore();
  }
  const color = new THREE.CanvasTexture(colorCanvas);
  color.colorSpace = THREE.SRGBColorSpace;
  const bump = new THREE.CanvasTexture(bumpCanvas);
  return { color, bump };
}

function makeFabricMaps() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#e0e0dc';
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 128; i += 4) {
    ctx.strokeStyle = i % 8 === 0 ? 'rgba(55,65,78,0.17)' : 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 128); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(128, i); ctx.stroke();
  }
  const random = seededRandom(9007);
  for (let i = 0; i < 420; i += 1) {
    ctx.fillStyle = random() > 0.5 ? 'rgba(255,255,255,0.16)' : 'rgba(35,45,58,0.09)';
    ctx.fillRect(random() * 128, random() * 128, 1, 1);
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const bump = new THREE.CanvasTexture(canvas);
  return { map, bump };
}

function makePaintMap() {
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 256, 256);
  gradient.addColorStop(0, '#f2f4f4');
  gradient.addColorStop(0.5, '#e1e7e9');
  gradient.addColorStop(1, '#f5f6f4');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);
  const random = seededRandom(1515);
  for (let i = 0; i < 700; i += 1) {
    const v = random() > 0.5 ? 255 : 80;
    ctx.fillStyle = `rgba(${v},${v},${v},${random() * 0.09})`;
    ctx.fillRect(random() * 256, random() * 256, 1 + random() * 3, 1);
  }
  for (let y = 22; y < 256; y += 48) {
    ctx.strokeStyle = 'rgba(64,83,101,0.09)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(256, y); ctx.stroke();
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return map;
}

const asphaltMaps = makeAsphaltMaps();
const fabricMaps = makeFabricMaps();
const paintMap = makePaintMap();

const material = (color, roughness = 0.72, metalness = 0.04, options = {}) => new THREE.MeshStandardMaterial({
  color,
  roughness,
  metalness,
  emissive: options.emissive ?? 0x000000,
  emissiveIntensity: options.emissiveIntensity ?? 0,
  transparent: options.transparent ?? false,
  opacity: options.opacity ?? 1,
  side: options.side ?? THREE.FrontSide
});
const mats = {
  asphalt: new THREE.MeshStandardMaterial({ color: 0xffffff, map: configureTexture(asphaltMaps.color, 3.5, 44), bumpMap: configureTexture(asphaltMaps.bump, 3.5, 44), bumpScale: 0.072, roughness: 0.58, metalness: 0.24 }),
  roadEdge: material(0x30384b, 0.76, 0.12),
  whiteLine: material(0xe3eaf3, 0.48, 0.18, { emissive: 0x53647c, emissiveIntensity: 0.22 }),
  concrete: material(0x333c50, 0.95, 0.02),
  concreteDark: material(0x171d2d, 0.9, 0.03),
  window: material(0x2d4969, 0.28, 0.24, { emissive: 0x203c5d, emissiveIntensity: 0.58 }),
  litWindow: material(0xffc17a, 0.38, 0.04, { emissive: 0xffa84d, emissiveIntensity: 1.95 }),
  lamp: material(0xffd39a, 0.3, 0.04, { emissive: 0xffb760, emissiveIntensity: 2.8 }),
  darkMetal: material(0x111722, 0.45, 0.62),
  metal: material(0x66758b, 0.34, 0.72),
  hoodie: new THREE.MeshStandardMaterial({ color: 0x263b59, map: configureTexture(fabricMaps.map, 2, 2), bumpMap: configureTexture(fabricMaps.bump, 2, 2), bumpScale: 0.028, roughness: 0.94, metalness: 0.01 }),
  jeans: new THREE.MeshStandardMaterial({ color: 0x1e2a4a, map: configureTexture(fabricMaps.map, 3, 3), bumpMap: configureTexture(fabricMaps.bump, 3, 3), bumpScale: 0.035, roughness: 0.96, metalness: 0.01 }),
  shoes: material(0xe6e4dd, 0.78, 0.02),
  skin: material(0xc58d6d, 0.86, 0.01),
  hair: material(0x171a20, 0.92, 0.01),
  hairEdge: material(0x252932, 0.85, 0.01),
  watch: material(0x101a28, 0.35, 0.55),
  watchFace: material(0x4fd1ff, 0.32, 0.18, { emissive: 0x4fd1ff, emissiveIntensity: 1.1 }),
  policeWhite: new THREE.MeshStandardMaterial({ color: 0xffffff, map: configureTexture(paintMap, 1.4, 1.4), roughness: 0.44, metalness: 0.24 }),
  policeCabin: new THREE.MeshStandardMaterial({ color: 0xf5f7f8, map: configureTexture(paintMap, 1.1, 1.1), roughness: 0.43, metalness: 0.22 }),
  policeBonnet: new THREE.MeshStandardMaterial({ color: 0xe1e8ed, map: configureTexture(paintMap, 1.2, 1.2), roughness: 0.4, metalness: 0.26 }),
  policeGlass: material(0x142338, 0.23, 0.42),
  policeGlassSide: material(0x17283d, 0.22, 0.38),
  policeReflect: material(0x7594ae, 0.24, 0.28, { emissive: 0x263d56, emissiveIntensity: 0.4 }),
  policeStripe: material(0x285b9c, 0.45, 0.18),
  policeCrest: material(0xc2a45b, 0.5, 0.25),
  barrier: material(0x384355, 0.92, 0.04),
  barrierTop: material(0x202a3a, 0.82, 0.08),
  warning: material(0xffb35c, 0.65, 0.04, { emissive: 0x8b4d1e, emissiveIntensity: 0.3 }),
  tea: material(0x1b5e3a, 0.62, 0.08),
  teaFoil: material(0x7cff6b, 0.36, 0.32, { emissive: 0x2a8d4b, emissiveIntensity: 0.8 }),
  teaDark: material(0x0d3529, 0.8, 0.03),
  boostBody: material(0xe8edf0, 0.86, 0.04),
  boostFoil: material(0xb8dce8, 0.32, 0.34, { emissive: 0x244b5d, emissiveIntensity: 0.32 }),
  boostAccent: material(0x70dfff, 0.3, 0.18, { emissive: 0x1b8ab0, emissiveIntensity: 0.8 }),
  boostHighlight: material(0xffffff, 0.24, 0.08, { emissive: 0x8adfff, emissiveIntensity: 0.22 }),
  redLamp: material(0xff3c4e, 0.3, 0.1, { emissive: 0xff1837, emissiveIntensity: 1.8 }),
  blueLamp: material(0x3c7bff, 0.3, 0.1, { emissive: 0x174dff, emissiveIntensity: 1.8 }),
  headlight: material(0xffe4a8, 0.25, 0.05, { emissive: 0xffc875, emissiveIntensity: 1.8 }),
  officerUniform: material(0x24344d, 0.82, 0.08),
  officerDark: material(0x111c2c, 0.62, 0.3),
  officerBadge: material(0xd3b86e, 0.34, 0.62, { emissive: 0x5d4d22, emissiveIntensity: 0.18 }),
  officerSkin: material(0xb98367, 0.88, 0.01),
  officerCap: material(0x18263a, 0.76, 0.06),
  handcuff: material(0xb9c6d3, 0.26, 0.82),
  matchaBottle: material(0x204d3b, 0.3, 0.12, { emissive: 0x0d241a, emissiveIntensity: 0.2 }),
  matchaLiquid: material(0x8dcf70, 0.28, 0.04, { emissive: 0x315b24, emissiveIntensity: 0.28 }),
  matchaCap: material(0xe3e6d6, 0.36, 0.18),
  matchaGlow: material(0x9eff75, 0.3, 0.12, { emissive: 0x65dc45, emissiveIntensity: 1.05 }),
  jetBody: material(0xdce5ec, 0.3, 0.72),
  jetDark: material(0x24384a, 0.42, 0.55),
  jetAccent: material(0x6ddfff, 0.28, 0.22, { emissive: 0x279bc7, emissiveIntensity: 1.0 }),
  jetFlameOuter: new THREE.MeshStandardMaterial({ color: 0xffb45f, emissive: 0xff6f2d, emissiveIntensity: 2.4, transparent: true, opacity: 0.76, roughness: 0.28, depthWrite: false }),
  jetFlameInner: new THREE.MeshStandardMaterial({ color: 0xb9f3ff, emissive: 0x5fdcff, emissiveIntensity: 2.8, transparent: true, opacity: 0.86, roughness: 0.22, depthWrite: false })
};

const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const sphereGeo = new THREE.SphereGeometry(1, 10, 8);
const smallSphereGeo = new THREE.SphereGeometry(1, 7, 6);
const cylinderGeo = new THREE.CylinderGeometry(1, 1, 1, 10);
const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.22, 12);
const wheelHubGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.235, 10);
const jetFlameGeo = new THREE.ConeGeometry(0.11, 0.52, 9, 1);
const handcuffGeo = new THREE.TorusGeometry(0.135, 0.025, 7, 16);

function addBox(parent, name, size, position, mat, rotation = null) {
  const mesh = new THREE.Mesh(boxGeo, mat);
  mesh.name = name;
  mesh.scale.set(size[0], size[1], size[2]);
  mesh.position.set(position[0], position[1], position[2]);
  if (rotation) mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
  parent.add(mesh);
  return mesh;
}

function addCylinder(parent, geometry, mat, size, position, rotation = null) {
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.scale.set(size[0], size[1], size[2]);
  mesh.position.set(position[0], position[1], position[2]);
  if (rotation) mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
  parent.add(mesh);
  return mesh;
}

// -----------------------------------------------------------------------------
// Road, lane lines and distant city
// -----------------------------------------------------------------------------
const road = new THREE.Mesh(new THREE.PlaneGeometry(CONFIG.roadWidth, 300), mats.asphalt);
road.name = 'procedural-wet-asphalt';
road.rotation.x = -Math.PI / 2;
road.position.set(0, -0.08, -92);
scene.add(road);

addBox(scene, 'left-road-shoulder', [1.05, 0.2, 300], [-6.12, -0.04, -92], mats.roadEdge);
addBox(scene, 'right-road-shoulder', [1.05, 0.2, 300], [6.12, -0.04, -92], mats.roadEdge);

const roadSegments = [];
const streakMat = material(0x263247, 0.45, 0.18, { emissive: 0x1d2a3e, emissiveIntensity: 0.24 });
for (let i = 0; i < CONFIG.segmentCount; i += 1) {
  const group = new THREE.Group();
  group.position.z = CONFIG.segmentLength * 0.5 - i * CONFIG.segmentLength;
  for (const x of [-1.62, 1.62]) {
    addBox(group, 'solid-lane-line', [0.075, 0.025, CONFIG.segmentLength + 0.08], [x, -0.063, 0], mats.whiteLine);
  }
  // Subtle wet streaks; all are reusable meshes and stay inside the lane surface.
  for (let j = 0; j < 4; j += 1) {
    const x = (j % 2 === 0 ? -1 : 1) * (0.55 + (j % 3) * 0.36);
    const z = -4 - Math.floor(j / 2) * 14 - (i % 2) * 3;
    const streak = addBox(group, 'wet-streak', [0.035, 0.012, 3.2 + (j % 2) * 2.1], [x, -0.074, z], streakMat);
    streak.rotation.y = (j % 2 === 0 ? 1 : -1) * 0.035;
  }
  scene.add(group);
  roadSegments.push(group);
}

const facadeCanvas = document.createElement('canvas');
facadeCanvas.width = 256; facadeCanvas.height = 256;
const facadeCtx = facadeCanvas.getContext('2d');
facadeCtx.fillStyle = '#171f35'; facadeCtx.fillRect(0, 0, 256, 256);
const facadeRandom = seededRandom(3381);
for (let y = 0; y < 256; y += 32) {
  facadeCtx.fillStyle = 'rgba(45,61,82,0.09)';
  facadeCtx.fillRect(0, y, 256, 1);
}
for (let x = 0; x < 256; x += 48) {
  facadeCtx.fillStyle = 'rgba(1,5,15,0.075)';
  facadeCtx.fillRect(x, 0, 2, 256);
}
for (let i = 0; i < 520; i += 1) {
  facadeCtx.fillStyle = facadeRandom() > 0.5 ? 'rgba(125,145,175,0.07)' : 'rgba(0,0,0,0.055)';
  facadeCtx.fillRect(facadeRandom() * 256, facadeRandom() * 256, 1 + facadeRandom() * 2, 1 + facadeRandom() * 5);
}
const facadeTexture = new THREE.CanvasTexture(facadeCanvas);
facadeTexture.colorSpace = THREE.SRGBColorSpace;

const cityBuildings = [];
const buildingMats = [
  material(0x111a30, 0.95, 0.02),
  material(0x151c33, 0.92, 0.04),
  material(0x19213a, 0.9, 0.05),
  material(0x10172a, 0.95, 0.01)
];
for (const facadeMat of buildingMats) {
  facadeMat.map = facadeTexture;
  facadeMat.needsUpdate = true;
}
for (let i = 0; i < 26; i += 1) {
  const side = i % 2 === 0 ? -1 : 1;
  const width = 3.2 + (i % 4) * 0.8;
  const height = 8 + ((i * 7) % 13);
  const depth = 4 + (i % 3) * 1.4;
  const group = new THREE.Group();
  const baseMat = buildingMats[i % buildingMats.length];
  const x = side * (8.0 + (i % 3) * 2.2);
  const z = -10 - i * 7.7;
  addBox(group, 'city-block', [width, height, depth], [0, height / 2 - 0.1, 0], baseMat);
  // Sparse windows are grouped on the street-facing facade only.
  const rows = Math.max(2, Math.floor(height / 3.2));
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < 2; c += 1) {
      const wx = (c - 0.5) * width * 0.42;
      const wy = 1.5 + r * 2.45;
      const lit = ((i + r * 2 + c) % 7 === 0);
      addBox(group, 'building-window', [0.42, 0.72, 0.035], [wx, wy, -depth / 2 - 0.025], lit ? mats.litWindow : mats.window);
    }
  }
  group.position.set(x, 0, z);
  scene.add(group);
  cityBuildings.push({ group, side, width, height, depth, seed: i });
}

// Lamps are emissive geometry with a restrained additive halo; only two point lights illuminate the scene.
const glowCanvas = document.createElement('canvas');
glowCanvas.width = glowCanvas.height = 128;
const glowCtx = glowCanvas.getContext('2d');
const glowGradient = glowCtx.createRadialGradient(64, 64, 2, 64, 64, 62);
glowGradient.addColorStop(0, 'rgba(255,222,173,0.72)');
glowGradient.addColorStop(0.18, 'rgba(255,183,105,0.34)');
glowGradient.addColorStop(0.48, 'rgba(255,162,80,0.11)');
glowGradient.addColorStop(1, 'rgba(255,162,80,0)');
glowCtx.fillStyle = glowGradient;
glowCtx.fillRect(0, 0, 128, 128);
const glowTexture = new THREE.CanvasTexture(glowCanvas);
const lampGlowMaterial = new THREE.SpriteMaterial({ map: glowTexture, color: 0xffd4a0, transparent: true, opacity: 0.38, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
const streetLamps = [];
for (let i = 0; i < 12; i += 1) {
  const side = i % 2 === 0 ? -1 : 1;
  const group = new THREE.Group();
  const x = side * 6.35;
  addCylinder(group, cylinderGeo, mats.darkMetal, [0.09, 5.4, 0.09], [0, 2.7, 0]);
  addBox(group, 'lamp-arm', [0.12, 0.12, 1.15], [0, 5.15, -side * 0.42], mats.darkMetal, [0, 0, side * 0.1]);
  addBox(group, 'lamp-head', [0.38, 0.18, 0.54], [0, 5.05, -side * 0.82], mats.darkMetal);
  const lampFace = addBox(group, 'lamp-emitter', [0.31, 0.045, 0.39], [0, 4.94, -side * 0.82], mats.lamp);
  const halo = new THREE.Sprite(lampGlowMaterial);
  halo.position.set(0, 4.94, -side * 0.82);
  halo.scale.set(2.3, 2.3, 1);
  group.add(halo);
  group.position.set(x, 0, -8 - Math.floor(i / 2) * 31);
  scene.add(group);
  streetLamps.push({ group, lampFace, side });
}

// -----------------------------------------------------------------------------
// Main character: compact, balanced low-poly runner with rounded limbs and wristwatch
// -----------------------------------------------------------------------------
const playerRoot = new THREE.Group();
scene.add(playerRoot);
const playerBody = new THREE.Group();
playerRoot.add(playerBody);
const bodyCore = new THREE.Group();
playerBody.add(bodyCore);

const torsoGeo = new THREE.CapsuleGeometry(0.39, 0.38, 4, 10);
const upperLimbGeo = new THREE.CapsuleGeometry(0.145, 0.28, 4, 8);
const foreLimbGeo = new THREE.CapsuleGeometry(0.125, 0.27, 4, 8);
const thighGeo = new THREE.CapsuleGeometry(0.17, 0.22, 4, 8);
const shinGeo = new THREE.CapsuleGeometry(0.145, 0.27, 4, 8);

const torso = new THREE.Mesh(torsoGeo, mats.hoodie);
torso.name = 'rounded-hoodie-torso';
torso.scale.set(1.17, 1.0, 0.76);
torso.position.set(0, 1.16, 0);
bodyCore.add(torso);
addBox(bodyCore, 'hoodie-hem', [0.91, 0.13, 0.49], [0, 0.68, 0], mats.hoodie);
addBox(bodyCore, 'hoodie-pocket', [0.43, 0.18, 0.025], [0, 0.91, -0.255], mats.hoodie, [0.04, 0, 0]);
addBox(bodyCore, 'hoodie-pocket-seam', [0.36, 0.014, 0.012], [0, 0.83, -0.274], mats.jeans);
const hood = new THREE.Mesh(sphereGeo, mats.hoodie);
hood.scale.set(0.36, 0.31, 0.25);
hood.position.set(0, 1.72, 0.14);
bodyCore.add(hood);
addBox(bodyCore, 'hood-fold-left', [0.045, 0.28, 0.035], [-0.24, 1.66, 0.32], mats.jeans, [0.12, 0, -0.12]);
addBox(bodyCore, 'hood-fold-right', [0.045, 0.28, 0.035], [0.24, 1.66, 0.32], mats.jeans, [0.12, 0, 0.12]);
const neck = new THREE.Mesh(sphereGeo, mats.skin);
neck.scale.set(0.17, 0.19, 0.16);
neck.position.set(0, 1.73, 0);
bodyCore.add(neck);

const head = new THREE.Mesh(sphereGeo, mats.skin);
head.name = 'head';
head.scale.set(0.365, 0.39, 0.34);
head.position.set(0, 2.055, 0);
bodyCore.add(head);
// Modcut: fuller crown, clean temples, a back curtain and separated medium-length strands.
const hairCap = new THREE.Mesh(sphereGeo, mats.hair);
hairCap.scale.set(0.405, 0.235, 0.375);
hairCap.position.set(0, 2.29, 0.025);
bodyCore.add(hairCap);
addBox(bodyCore, 'hair-back', [0.66, 0.36, 0.19], [0, 2.04, 0.255], mats.hair, [0.08, 0, 0]);
addBox(bodyCore, 'hair-side-left', [0.145, 0.39, 0.27], [-0.335, 2.075, 0.055], mats.hair, [0.06, 0, -0.07]);
addBox(bodyCore, 'hair-side-right', [0.145, 0.38, 0.27], [0.335, 2.08, 0.055], mats.hair, [0.06, 0, 0.07]);
for (let i = 0; i < 7; i += 1) {
  const strand = addBox(bodyCore, 'hair-strand', [0.075, 0.22 + (i % 3) * 0.035, 0.12], [((i % 4) - 1.5) * 0.155, 2.315 - (i % 2) * 0.03, 0.285 + (i % 3) * 0.01], i % 2 ? mats.hair : mats.hairEdge, [0.1, (i - 3) * 0.03, (i - 3) * 0.03]);
  strand.scale.x = 0.96;
}
addBox(bodyCore, 'fringe-left', [0.2, 0.12, 0.12], [-0.17, 2.245, -0.275], mats.hair, [0.08, 0, -0.12]);
addBox(bodyCore, 'fringe-right', [0.2, 0.115, 0.12], [0.15, 2.25, -0.28], mats.hair, [0.08, 0, 0.12]);

// Small woven SAF back print: it makes the rear-facing runner read clearly at game distance.
const jacketMarkCanvas = document.createElement('canvas');
jacketMarkCanvas.width = 256;
jacketMarkCanvas.height = 192;
const jacketMarkCtx = jacketMarkCanvas.getContext('2d');
jacketMarkCtx.fillStyle = 'rgba(9,20,30,0.82)';
jacketMarkCtx.beginPath();
jacketMarkCtx.roundRect(12, 10, 232, 172, 13);
jacketMarkCtx.fill();
jacketMarkCtx.strokeStyle = 'rgba(215,232,238,0.8)';
jacketMarkCtx.lineWidth = 5;
jacketMarkCtx.stroke();
jacketMarkCtx.fillStyle = '#f2f4e9';
jacketMarkCtx.textAlign = 'center';
jacketMarkCtx.font = '900 82px Arial';
jacketMarkCtx.fillText('SAF', 128, 100);
jacketMarkCtx.fillStyle = '#7cff6b';
jacketMarkCtx.fillRect(42, 116, 172, 7);
jacketMarkCtx.fillStyle = '#c3d4df';
jacketMarkCtx.font = '800 18px Arial';
jacketMarkCtx.fillText('NIGHT RUN CLUB', 128, 151);
const jacketMarkTexture = new THREE.CanvasTexture(jacketMarkCanvas);
jacketMarkTexture.colorSpace = THREE.SRGBColorSpace;
const jacketMarkMaterial = new THREE.MeshBasicMaterial({ map: jacketMarkTexture, transparent: true, side: THREE.DoubleSide, depthWrite: false, toneMapped: false });
const jacketMark = new THREE.Mesh(new THREE.PlaneGeometry(0.43, 0.325), jacketMarkMaterial);
jacketMark.name = 'saf-jacket-back-print';
jacketMark.position.set(0, 1.22, 0.305);
bodyCore.add(jacketMark);

const armPivots = [];
const forearmPivots = [];
for (const side of [-1, 1]) {
  const shoulder = new THREE.Group();
  shoulder.position.set(side * 0.49, 1.49, 0);
  bodyCore.add(shoulder);
  const upperArm = new THREE.Mesh(upperLimbGeo, mats.hoodie);
  upperArm.position.set(0, -0.235, 0);
  upperArm.rotation.z = side * -0.08;
  shoulder.add(upperArm);
  const elbow = new THREE.Group();
  elbow.position.set(0, -0.46, 0);
  shoulder.add(elbow);
  const forearm = new THREE.Mesh(foreLimbGeo, mats.hoodie);
  forearm.position.set(0, -0.205, 0);
  elbow.add(forearm);
  const hand = new THREE.Mesh(sphereGeo, mats.skin);
  hand.scale.set(0.12, 0.145, 0.12);
  hand.position.set(0, -0.445, -0.015);
  elbow.add(hand);
  if (side === -1) {
    addBox(elbow, 'watch-strap', [0.255, 0.085, 0.24], [0, -0.34, 0.012], mats.watch);
    addBox(elbow, 'watch-face', [0.145, 0.045, 0.15], [-0.01, -0.34, -0.116], mats.watchFace);
    addBox(elbow, 'watch-bezel', [0.165, 0.018, 0.17], [-0.01, -0.34, -0.13], mats.metal);
  }
  armPivots.push({ side, shoulder });
  forearmPivots.push({ side, elbow });
}

const legPivots = [];
for (const side of [-1, 1]) {
  const hip = new THREE.Group();
  hip.position.set(side * 0.225, 0.69, 0);
  bodyCore.add(hip);
  const thigh = new THREE.Mesh(thighGeo, mats.jeans);
  thigh.position.set(0, -0.22, 0);
  hip.add(thigh);
  // Rear pocket stitching and a subtle outseam add scale without noisy detail.
  addBox(hip, 'jeans-pocket', [0.19, 0.17, 0.025], [0, -0.16, 0.166], mats.jeans, [0.08, 0, 0]);
  addBox(hip, 'jeans-pocket-stitch', [0.15, 0.012, 0.012], [0, -0.23, 0.183], mats.white);
  const knee = new THREE.Group();
  knee.position.set(0, -0.435, 0);
  hip.add(knee);
  const shin = new THREE.Mesh(shinGeo, mats.jeans);
  shin.position.set(0, -0.205, 0);
  knee.add(shin);
  addBox(knee, 'sneaker', [0.35, 0.17, 0.52], [0, -0.445, -0.085], mats.shoes, [-0.04, 0, 0]);
  const toeCap = new THREE.Mesh(sphereGeo, mats.shoes);
  toeCap.scale.set(0.17, 0.09, 0.16);
  toeCap.position.set(0, -0.425, -0.275);
  knee.add(toeCap);
  addBox(knee, 'sole', [0.36, 0.065, 0.54], [0, -0.535, -0.085], mats.darkMetal);
  addBox(knee, 'shoe-heel-detail', [0.19, 0.07, 0.035], [0, -0.44, 0.18], mats.metal);
  legPivots.push({ side, hip, knee });
}

const PLAYER_BODY_X = 1.08;
const PLAYER_BODY_Y = 0.92;
const PLAYER_BODY_Z = 1.02;
playerBody.scale.set(PLAYER_BODY_X, PLAYER_BODY_Y, PLAYER_BODY_Z);

const podium = addCylinder(scene, cylinderGeo, material(0x1a263d, 0.55, 0.45), [3.2, 0.18, 3.2], [0, -0.17, 1.1]);
podium.rotation.x = 0;
const podiumRing = addCylinder(scene, cylinderGeo, material(0x7cff6b, 0.34, 0.22, { emissive: 0x2d9b4e, emissiveIntensity: 0.72 }), [3.24, 0.035, 3.24], [0, -0.065, 1.1]);

function applyOutfit() {
  const top = SHOP.top.find((item) => item.id === saveData.selected.top) || SHOP.top[0];
  const shoes = SHOP.shoes.find((item) => item.id === saveData.selected.shoes) || SHOP.shoes[0];
  mats.hoodie.color.set(top.color);
  mats.shoes.color.set(shoes.color);
}
applyOutfit();

// -----------------------------------------------------------------------------
// Procedural officer NPC: used in the opening scene, chase and arrest sequence.
// -----------------------------------------------------------------------------
const officerRoot = new THREE.Group();
officerRoot.name = 'police-officer-npc';
scene.add(officerRoot);
const officerBody = new THREE.Group();
officerRoot.add(officerBody);
const officerArmPivots = [];
const officerLegPivots = [];
const officerFadeMaterials = new Set();

const officerTorso = new THREE.Mesh(torsoGeo, mats.officerUniform);
officerTorso.scale.set(1.12, 0.98, 0.78);
officerTorso.position.set(0, 1.12, 0);
officerBody.add(officerTorso);
const officerVest = addBox(officerBody, 'officer-vest-front', [0.57, 0.68, 0.055], [0, 1.12, -0.292], mats.officerDark);
addBox(officerBody, 'officer-belt', [0.79, 0.13, 0.48], [0, 0.76, 0], mats.officerDark);
addBox(officerBody, 'officer-belt-buckle', [0.15, 0.14, 0.045], [0, 0.76, -0.257], mats.officerBadge);
addBox(officerBody, 'officer-radio', [0.16, 0.25, 0.11], [-0.33, 1.38, -0.13], mats.officerDark);
addBox(officerBody, 'officer-shoulder-mark-left', [0.22, 0.12, 0.27], [-0.43, 1.54, 0], mats.officerDark);
addBox(officerBody, 'officer-shoulder-mark-right', [0.22, 0.12, 0.27], [0.43, 1.54, 0], mats.officerDark);
const officerHead = new THREE.Mesh(sphereGeo, mats.officerSkin);
officerHead.scale.set(0.29, 0.33, 0.27);
officerHead.position.set(0, 1.94, 0);
officerBody.add(officerHead);
const officerCap = addBox(officerBody, 'officer-cap-crown', [0.56, 0.19, 0.48], [0, 2.2, 0.005], mats.officerCap);
addBox(officerBody, 'officer-cap-visor', [0.58, 0.055, 0.26], [0, 2.13, -0.19], mats.officerDark);
addBox(officerBody, 'officer-cap-badge', [0.12, 0.1, 0.025], [0, 2.2, -0.246], mats.officerBadge);
for (const eyeX of [-0.105, 0.105]) addBox(officerBody, 'officer-eye', [0.055, 0.035, 0.025], [eyeX, 1.99, -0.255], mats.officerDark);
addBox(officerBody, 'officer-nose', [0.07, 0.085, 0.075], [0, 1.91, -0.285], mats.officerSkin);
addBox(officerBody, 'officer-badge', [0.14, 0.19, 0.035], [0.22, 1.35, -0.34], mats.officerBadge);
addBox(officerBody, 'officer-badge-mark', [0.045, 0.12, 0.018], [0.22, 1.35, -0.365], mats.officerBadge);

const officerArmGeo = new THREE.CapsuleGeometry(0.13, 0.28, 4, 8);
const officerLegGeo = new THREE.CapsuleGeometry(0.15, 0.34, 4, 8);
for (const side of [-1, 1]) {
  const shoulder = new THREE.Group();
  shoulder.position.set(side * 0.47, 1.51, 0);
  officerBody.add(shoulder);
  const upper = new THREE.Mesh(officerArmGeo, mats.officerUniform);
  upper.position.y = -0.22;
  shoulder.add(upper);
  const elbow = new THREE.Group();
  elbow.position.y = -0.43;
  shoulder.add(elbow);
  const fore = new THREE.Mesh(officerArmGeo, mats.officerUniform);
  fore.scale.set(0.88, 0.92, 0.88);
  fore.position.y = -0.19;
  elbow.add(fore);
  const hand = new THREE.Mesh(sphereGeo, mats.officerSkin);
  hand.scale.set(0.105, 0.12, 0.105);
  hand.position.y = -0.39;
  elbow.add(hand);
  officerArmPivots.push({ side, shoulder, elbow });

  const hip = new THREE.Group();
  hip.position.set(side * 0.22, 0.69, 0);
  officerBody.add(hip);
  const thigh = new THREE.Mesh(officerLegGeo, mats.officerUniform);
  thigh.position.y = -0.21;
  hip.add(thigh);
  const knee = new THREE.Group();
  knee.position.y = -0.42;
  hip.add(knee);
  const shin = new THREE.Mesh(officerLegGeo, mats.officerDark);
  shin.scale.set(0.92, 0.9, 0.92);
  shin.position.y = -0.2;
  knee.add(shin);
  addBox(knee, 'officer-boot', [0.31, 0.14, 0.45], [0, -0.42, -0.07], mats.officerDark);
  officerLegPivots.push({ side, hip, knee });
}

const officerBackCanvas = document.createElement('canvas');
officerBackCanvas.width = 256;
officerBackCanvas.height = 96;
const officerBackCtx = officerBackCanvas.getContext('2d');
officerBackCtx.fillStyle = '#172941';
officerBackCtx.fillRect(0, 0, 256, 96);
officerBackCtx.strokeStyle = '#79a9d4';
officerBackCtx.lineWidth = 5;
officerBackCtx.strokeRect(5, 5, 246, 86);
officerBackCtx.fillStyle = '#eef4fb';
officerBackCtx.textAlign = 'center';
officerBackCtx.textBaseline = 'middle';
officerBackCtx.font = '900 39px Arial';
officerBackCtx.fillText('ПОЛИЦИЯ', 128, 49);
const officerBackTexture = new THREE.CanvasTexture(officerBackCanvas);
officerBackTexture.colorSpace = THREE.SRGBColorSpace;
const officerBackPrint = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.27), new THREE.MeshBasicMaterial({ map: officerBackTexture, transparent: true, side: THREE.DoubleSide, toneMapped: false }));
officerBackPrint.position.set(0, 1.24, 0.305);
officerBody.add(officerBackPrint);
officerRoot.visible = false;
officerRoot.traverse((node) => {
  if (!node.isMesh || !node.material) return;
  const materials = Array.isArray(node.material) ? node.material : [node.material];
  for (const mat of materials) {
    mat.transparent = true;
    mat.opacity = 1;
    officerFadeMaterials.add(mat);
  }
});

function setOfficerOpacity(value) {
  const alpha = Math.max(0, Math.min(1, value));
  officerRoot.visible = alpha > 0.025;
  for (const mat of officerFadeMaterials) {
    mat.opacity = alpha;
    mat.depthWrite = alpha > 0.96;
  }
}

function updateOfficerPose(dt, mode = 'run') {
  const swing = Math.sin(elapsedGame * 11.5);
  for (const arm of officerArmPivots) {
    if (mode === 'talk') {
      arm.shoulder.rotation.x = arm.side < 0 ? -0.78 : 0.12;
      arm.shoulder.rotation.z = arm.side < 0 ? -0.12 : 0.08;
      arm.elbow.rotation.x = arm.side < 0 ? -0.55 : -0.18;
    } else if (mode === 'arrest') {
      arm.shoulder.rotation.x = -1.02;
      arm.shoulder.rotation.z = arm.side * -0.12;
      arm.elbow.rotation.x = -0.78;
    } else if (mode === 'idle') {
      arm.shoulder.rotation.x = 0.04 * arm.side;
      arm.shoulder.rotation.z = arm.side * 0.025;
      arm.elbow.rotation.x = -0.12;
    } else {
      arm.shoulder.rotation.x = swing * 0.62 * arm.side;
      arm.shoulder.rotation.z = arm.side * 0.04;
      arm.elbow.rotation.x = -0.12 + Math.max(0, Math.sin(elapsedGame * 11.5 + arm.side)) * 0.24;
    }
  }
  for (const leg of officerLegPivots) {
    leg.hip.rotation.x = mode === 'run' ? swing * 0.68 * leg.side : mode === 'arrest' ? 0.12 * leg.side : 0;
    leg.knee.rotation.x = mode === 'run' ? Math.max(0, -swing * leg.side) * 0.7 : mode === 'arrest' ? 0.18 : 0;
  }
  officerBody.rotation.x = mode === 'run' ? -0.08 : mode === 'arrest' ? 0.16 : 0;
}

// Handcuffs are hidden until the arrest animation reaches its final beat.
const arrestCuffs = new THREE.Group();
arrestCuffs.add(new THREE.Mesh(handcuffGeo, mats.handcuff));
const cuffRight = new THREE.Mesh(handcuffGeo, mats.handcuff);
cuffRight.position.x = 0.31;
arrestCuffs.add(cuffRight);
addBox(arrestCuffs, 'handcuff-connector', [0.24, 0.045, 0.045], [0.155, 0, 0], mats.handcuff);
arrestCuffs.position.set(-0.155, 1.02, 0.39);
arrestCuffs.visible = false;
playerRoot.add(arrestCuffs);

// Twin air jets are purely fictional flight equipment, activated by the AIR-JET pickup.
const jetpackRig = new THREE.Group();
jetpackRig.position.set(0, 1.18, 0.4);
bodyCore.add(jetpackRig);
const jetpackFlames = [];
for (const side of [-1, 1]) {
  addBox(jetpackRig, 'air-jet-tank', [0.19, 0.58, 0.2], [side * 0.2, 0.02, 0.02], mats.jetBody);
  addBox(jetpackRig, 'air-jet-tank-band', [0.205, 0.075, 0.22], [side * 0.2, 0.02, -0.005], mats.jetAccent);
  addCylinder(jetpackRig, cylinderGeo, mats.jetDark, [0.14, 0.16, 0.14], [side * 0.2, -0.34, 0.02]);
  const outerFlame = new THREE.Mesh(jetFlameGeo, mats.jetFlameOuter);
  outerFlame.rotation.x = Math.PI;
  outerFlame.position.set(side * 0.2, -0.69, 0.02);
  jetpackRig.add(outerFlame);
  const innerFlame = new THREE.Mesh(jetFlameGeo, mats.jetFlameInner);
  innerFlame.scale.set(0.58, 0.72, 0.58);
  innerFlame.rotation.x = Math.PI;
  innerFlame.position.set(side * 0.2, -0.68, 0.015);
  jetpackRig.add(innerFlame);
  jetpackFlames.push({ outerFlame, innerFlame });
}
jetpackRig.visible = false;

// -----------------------------------------------------------------------------
// Police vans and barriers. Geometry is created once and reused from pools.
// -----------------------------------------------------------------------------
const policeLabelCanvas = document.createElement('canvas');
policeLabelCanvas.width = 320;
policeLabelCanvas.height = 72;
const policeLabelContext = policeLabelCanvas.getContext('2d');
policeLabelContext.fillStyle = '#24568f';
policeLabelContext.fillRect(0, 0, 320, 72);
policeLabelContext.fillStyle = '#eef4fb';
policeLabelContext.font = '800 37px Arial';
policeLabelContext.textAlign = 'center';
policeLabelContext.textBaseline = 'middle';
policeLabelContext.fillText('ПОЛИЦИЯ', 160, 37);
const policeLabelTexture = new THREE.CanvasTexture(policeLabelCanvas);
policeLabelTexture.colorSpace = THREE.SRGBColorSpace;
const policeLabelMaterial = new THREE.MeshBasicMaterial({ map: policeLabelTexture, side: THREE.DoubleSide, toneMapped: false });
const policeLabelGeometry = new THREE.PlaneGeometry(1.48, 0.3);

const windshieldCanvas = document.createElement('canvas');
windshieldCanvas.width = 384; windshieldCanvas.height = 160;
const windshieldCtx = windshieldCanvas.getContext('2d');
const windshieldGradient = windshieldCtx.createLinearGradient(0, 0, 384, 160);
windshieldGradient.addColorStop(0, '#203b59'); windshieldGradient.addColorStop(0.48, '#14263e'); windshieldGradient.addColorStop(1, '#314d67');
windshieldCtx.fillStyle = windshieldGradient; windshieldCtx.fillRect(0, 0, 384, 160);
windshieldCtx.fillStyle = 'rgba(5,11,20,0.7)'; windshieldCtx.fillRect(0, 112, 384, 48);
windshieldCtx.fillStyle = 'rgba(120,158,187,0.22)'; windshieldCtx.beginPath(); windshieldCtx.moveTo(12, 0); windshieldCtx.lineTo(114, 0); windshieldCtx.lineTo(246, 160); windshieldCtx.lineTo(181, 160); windshieldCtx.closePath(); windshieldCtx.fill();
windshieldCtx.fillStyle = 'rgba(210,231,241,0.16)'; windshieldCtx.beginPath(); windshieldCtx.moveTo(260, 0); windshieldCtx.lineTo(316, 0); windshieldCtx.lineTo(374, 80); windshieldCtx.lineTo(353, 94); windshieldCtx.closePath(); windshieldCtx.fill();
windshieldCtx.fillStyle = '#0b1422'; windshieldCtx.fillRect(45, 64, 75, 78); windshieldCtx.fillRect(265, 64, 75, 78);
windshieldCtx.fillStyle = '#394d60'; windshieldCtx.fillRect(56, 74, 53, 65); windshieldCtx.fillRect(276, 74, 53, 65);
windshieldCtx.fillStyle = 'rgba(225,237,244,0.28)'; windshieldCtx.fillRect(0, 8, 384, 4);
const windshieldTexture = new THREE.CanvasTexture(windshieldCanvas);
windshieldTexture.colorSpace = THREE.SRGBColorSpace;
const windshieldFrontMaterial = new THREE.MeshStandardMaterial({ map: windshieldTexture, color: 0xc5d9e7, roughness: 0.26, metalness: 0.34, side: THREE.DoubleSide });
const windshieldFrontGeometry = new THREE.PlaneGeometry(1.94, 0.65);

function createPoliceVan() {
  const root = new THREE.Group();
  // Lower body and raised cabin, with the front facing the approaching runner.
  addBox(root, 'van-lower-body', [2.48, 1.18, 4.55], [0, 0.91, 0.08], mats.policeWhite);
  addBox(root, 'van-cabin', [2.35, 1.18, 2.58], [0, 1.93, -0.58], mats.policeCabin);
  addBox(root, 'van-bonnet', [2.37, 0.44, 1.1], [0, 1.23, -1.7], mats.policeBonnet);
  addBox(root, 'front-windshield', [2.05, 0.73, 0.045], [0, 2.0, -1.885], mats.policeGlass);
  const windshieldFace = new THREE.Mesh(windshieldFrontGeometry, windshieldFrontMaterial);
  windshieldFace.name = 'front-windshield-texture';
  windshieldFace.position.set(0, 2.0, -1.913);
  root.add(windshieldFace);
  addBox(root, 'front-windshield-reflect', [1.8, 0.045, 0.025], [0, 2.29, -1.93], mats.policeReflect);
  // Wipers, side mirrors and a framed front end make the approaching face readable.
  for (const side of [-1, 1]) {
    const wiper = addBox(root, 'front-windshield-wiper', [0.82, 0.025, 0.025], [side * 0.43, 1.7, -1.93], mats.darkMetal);
    wiper.rotation.z = side * -0.19;
    addBox(root, 'front-mirror-arm', [0.06, 0.06, 0.42], [side * 1.16, 2.12, -1.55], mats.metal, [0, side * 0.12, side * 0.16]);
    addBox(root, 'front-mirror-housing', [0.22, 0.25, 0.18], [side * 1.27, 2.18, -1.48], mats.policeWhite);
    addBox(root, 'front-mirror-glass', [0.19, 0.19, 0.018], [side * 1.27, 2.18, -1.58], mats.policeGlassSide);
  }
  addBox(root, 'front-grille', [1.16, 0.32, 0.06], [0, 0.83, -2.22], mats.darkMetal);
  for (let i = 0; i < 7; i += 1) addBox(root, 'grille-slat', [1.08, 0.022, 0.025], [0, 0.69 + i * 0.048, -2.26], mats.metal);
  addBox(root, 'front-grille-emblem', [0.18, 0.18, 0.04], [0, 0.85, -2.285], mats.policeCrest);
  addBox(root, 'front-bumper', [2.45, 0.2, 0.22], [0, 0.42, -2.22], mats.darkMetal);
  addBox(root, 'front-license-frame', [0.68, 0.19, 0.045], [0, 0.46, -2.345], mats.metal);
  addBox(root, 'front-license-plate', [0.6, 0.125, 0.022], [0, 0.46, -2.372], mats.policeWhite);
  addBox(root, 'front-license-mark', [0.32, 0.025, 0.012], [0, 0.46, -2.388], mats.policeStripe);
  addBox(root, 'front-lower-intake', [0.74, 0.1, 0.04], [0, 0.29, -2.28], mats.darkMetal);
  for (const x of [-0.91, 0.91]) {
    addBox(root, 'headlamp-housing', [0.48, 0.25, 0.08], [x, 1.12, -2.22], mats.darkMetal);
    addBox(root, 'headlamp', [0.36, 0.14, 0.04], [x, 1.13, -2.275], mats.headlight);
    addBox(root, 'fog-lamp', [0.17, 0.1, 0.04], [x, 0.62, -2.28], mats.headlight);
    addBox(root, 'blue-front-marker', [0.18, 0.06, 0.035], [x, 1.43, -2.245], mats.policeStripe);
  }
  addBox(root, 'bonnet-police-stripe-left', [0.1, 0.025, 0.78], [-0.19, 1.47, -1.74], mats.policeStripe);
  addBox(root, 'bonnet-police-stripe-right', [0.1, 0.025, 0.78], [0.19, 1.47, -1.74], mats.policeStripe);
  // Side glazing and dark protective grilles.
  for (const side of [-1, 1]) {
    for (const z of [-1.18, -0.35, 0.55]) {
      addBox(root, 'side-window', [0.045, 0.57, 0.65], [side * 1.19, 1.97, z], mats.policeGlassSide);
      for (let k = 0; k < 4; k += 1) addBox(root, 'window-bar', [0.06, 0.025, 0.69], [side * 1.225, 1.74 + k * 0.15, z], mats.darkMetal);
    }
    addBox(root, 'police-blue-stripe', [0.035, 0.22, 4.4], [side * 1.252, 1.0, 0.05], mats.policeStripe);
    const policeLabel = new THREE.Mesh(policeLabelGeometry, policeLabelMaterial);
    policeLabel.position.set(side * 1.279, 1.0, 0.02);
    policeLabel.rotation.y = side * Math.PI / 2;
    root.add(policeLabel);
    addBox(root, 'sliding-door-seam', [0.035, 0.95, 0.035], [side * 1.255, 1.48, 1.25], mats.metal);
    addBox(root, 'door-handle', [0.045, 0.065, 0.34], [side * 1.282, 1.48, 1.28], mats.darkMetal);
    addBox(root, 'lower-side-protection', [0.045, 0.075, 3.95], [side * 1.276, 0.57, 0.02], mats.metal);
    for (let rivet = 0; rivet < 5; rivet += 1) {
      addBox(root, 'body-rivet', [0.035, 0.055, 0.055], [side * 1.278, 1.56, -1.72 + rivet * 0.68], mats.metal);
    }
    for (const z of [-1.94, 1.95]) {
      addBox(root, 'side-reflector', [0.035, 0.09, 0.25], [side * 1.28, 0.79, z], mats.warning);
    }
    // Thin yellow police crest, represented by clean geometric marks rather than a copied logo.
    addBox(root, 'door-crest-main', [0.045, 0.36, 0.2], [side * 1.275, 1.34, -0.05], mats.policeCrest);
    addBox(root, 'door-crest-cross', [0.045, 0.08, 0.34], [side * 1.28, 1.34, -0.05], mats.policeCrest);
  }
  // Front roof bar and two alternating LED beacons.
  addBox(root, 'lightbar-base', [1.48, 0.12, 0.38], [0, 2.58, -0.54], mats.darkMetal);
  const blueBeacon = addBox(root, 'blue-beacon', [0.58, 0.19, 0.31], [-0.43, 2.73, -0.54], mats.blueLamp);
  const redBeacon = addBox(root, 'red-beacon', [0.58, 0.19, 0.31], [0.43, 2.73, -0.54], mats.redLamp);
  const wheels = [];
  for (const side of [-1, 1]) {
    for (const z of [-1.42, 1.52]) {
      const wheel = addCylinder(root, wheelGeo, mats.darkMetal, [1, 1, 1], [side * 1.22, 0.34, z], [0, 0, Math.PI / 2]);
      wheels.push(wheel);
      addCylinder(root, wheelHubGeo, mats.metal, [1, 1, 1], [side * 1.235, 0.34, z], [0, 0, Math.PI / 2]);
    }
  }
  // Vehicles travel toward the runner, so the textured cab face points down-road (+Z).
  root.rotation.y = Math.PI;
  return { root, blueBeacon, redBeacon, wheels };
}

function createBarrier(high) {
  const root = new THREE.Group();
  const height = high ? 2.55 : 0.82;
  addBox(root, 'barrier-body', [2.42, height, 0.62], [0, height / 2, 0], mats.barrier);
  addBox(root, 'barrier-top', [2.5, 0.12, 0.7], [0, height, 0], mats.barrierTop);
  const stripeCount = high ? 5 : 2;
  for (let i = 0; i < stripeCount; i += 1) {
    const y = high ? 0.32 + i * 0.42 : 0.18 + i * 0.27;
    const stripe = addBox(root, 'amber-warning-stripe', [0.32, 0.14, 0.035], [-0.78 + i * 0.39, y, -0.33], mats.warning);
    stripe.rotation.z = -0.42;
  }
  root.position.y = -0.08;
  if (!high) {
    for (const x of [-0.88, 0.88]) addBox(root, 'barrier-foot', [0.38, 0.17, 0.88], [x, 0.08, 0], mats.darkMetal);
  }
  return root;
}

const obstaclePool = [];
for (let i = 0; i < 10; i += 1) {
  const van = createPoliceVan();
  const low = createBarrier(false);
  const high = createBarrier(true);
  const root = new THREE.Group();
  root.add(van.root, low, high);
  van.root.visible = false;
  low.visible = false;
  high.visible = false;
  root.visible = false;
  scene.add(root);
  obstaclePool.push({ root, van, low, high, active: false, type: 'van', lane: 1, z: -80, phase: i * 0.7 });
}

// -----------------------------------------------------------------------------
// Tea sachet pickup and small particle pool
// -----------------------------------------------------------------------------
function makeTeaLabelTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 192;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 160, 192);
  gradient.addColorStop(0, '#285c43');
  gradient.addColorStop(0.5, '#174d34');
  gradient.addColorStop(1, '#0c3529');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 160, 192);
  ctx.fillStyle = '#7cff6b';
  ctx.fillRect(7, 7, 146, 178);
  ctx.fillStyle = '#123d2d';
  ctx.fillRect(12, 12, 136, 168);
  ctx.strokeStyle = 'rgba(215,255,201,0.8)';
  ctx.lineWidth = 2;
  ctx.strokeRect(17, 17, 126, 158);
  ctx.fillStyle = '#9dff8b';
  ctx.font = '800 13px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('NIGHT BLEND', 80, 39);
  ctx.fillStyle = '#f0f6e7';
  ctx.font = '900 34px Arial';
  ctx.fillText('SAF', 80, 78);
  ctx.font = '800 22px Arial';
  ctx.fillText('TEA', 80, 101);
  ctx.strokeStyle = '#7cff6b';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(80, 119); ctx.bezierCurveTo(48, 100, 37, 138, 80, 150);
  ctx.bezierCurveTo(122, 137, 109, 103, 80, 119);
  ctx.stroke();
  ctx.beginPath(); ctx.moveTo(80, 119); ctx.quadraticCurveTo(78, 138, 97, 144); ctx.stroke();
  ctx.fillStyle = 'rgba(240,246,231,0.76)';
  ctx.font = '700 8px Arial';
  ctx.fillText('DRY GREEN TEA  /  02', 80, 165);
  ctx.fillStyle = 'rgba(255,255,255,0.11)';
  ctx.fillRect(20, 22, 8, 145);
  ctx.fillStyle = 'rgba(255,255,255,0.17)';
  ctx.fillRect(24, 20, 2, 150);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeBoostLabelTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 192;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 160, 192);
  gradient.addColorStop(0, '#fbfcfc');
  gradient.addColorStop(1, '#cbd9df');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 160, 192);
  ctx.fillStyle = '#18324a';
  ctx.fillRect(8, 8, 144, 176);
  ctx.fillStyle = '#f4f7f7';
  ctx.fillRect(13, 13, 134, 166);
  ctx.fillStyle = '#68dfff';
  ctx.fillRect(13, 13, 14, 166);
  ctx.fillStyle = '#18324a';
  ctx.textAlign = 'center';
  ctx.font = '900 33px Arial';
  ctx.fillText('SAF', 87, 70);
  ctx.font = '900 18px Arial';
  ctx.fillText('BOOST', 87, 96);
  ctx.strokeStyle = '#38b9df';
  ctx.lineWidth = 5;
  for (let i = 0; i < 3; i += 1) {
    ctx.beginPath(); ctx.moveTo(46, 117 + i * 13); ctx.lineTo(117, 117 + i * 13); ctx.stroke();
  }
  ctx.fillStyle = '#526c7e';
  ctx.font = '700 8px Arial';
  ctx.fillText('SPEED INFUSION  /  01', 87, 165);
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillRect(31, 18, 4, 152);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
const teaTexture = makeTeaLabelTexture();
const teaLabelMat = new THREE.MeshStandardMaterial({ map: teaTexture, roughness: 0.6, metalness: 0.08, emissive: 0x12391f, emissiveIntensity: 0.3 });
const boostTexture = makeBoostLabelTexture();
const boostLabelMat = new THREE.MeshStandardMaterial({ map: boostTexture, roughness: 0.68, metalness: 0.04, emissive: 0x17394a, emissiveIntensity: 0.18 });
const teaPool = [];
for (let i = 0; i < 64; i += 1) {
  const root = new THREE.Group();
  addBox(root, 'sachet-body', [0.42, 0.58, 0.1], [0, 0, 0], mats.tea);
  addBox(root, 'sachet-label', [0.34, 0.46, 0.018], [0, 0, -0.061], teaLabelMat);
  addBox(root, 'sachet-seal-top', [0.45, 0.08, 0.115], [0, 0.33, 0], mats.teaFoil);
  addBox(root, 'sachet-seal-bottom', [0.45, 0.07, 0.115], [0, -0.33, 0], mats.teaFoil);
  addBox(root, 'sachet-side-fold-left', [0.035, 0.55, 0.11], [-0.205, 0, 0], mats.teaDark);
  addBox(root, 'sachet-side-fold-right', [0.035, 0.55, 0.11], [0.205, 0, 0], mats.teaDark);
  const glint = addBox(root, 'sachet-glint', [0.025, 0.35, 0.02], [-0.13, 0.01, -0.074], material(0xc5ffb7, 0.3, 0.1, { emissive: 0x6dbf64, emissiveIntensity: 0.6 }));
  glint.rotation.z = 0.12;
  root.visible = false;
  scene.add(root);
  teaPool.push({ root, active: false, lane: 1, z: -70, phase: i * 0.37, baseY: 1.0 });
}

// White SAF BOOST sachets are a separate pickup: they add temporary speed, never tea or score.
const boostPool = [];
for (let i = 0; i < 24; i += 1) {
  const root = new THREE.Group();
  addBox(root, 'boost-sachet-body', [0.44, 0.6, 0.105], [0, 0, 0], mats.boostBody);
  addBox(root, 'boost-sachet-label', [0.36, 0.48, 0.018], [0, 0, -0.061], boostLabelMat);
  addBox(root, 'boost-sachet-top-seal', [0.47, 0.075, 0.12], [0, 0.345, 0], mats.boostFoil);
  addBox(root, 'boost-sachet-bottom-seal', [0.47, 0.07, 0.12], [0, -0.345, 0], mats.boostFoil);
  addBox(root, 'boost-sachet-left-fold', [0.035, 0.55, 0.11], [-0.215, 0, 0], mats.boostAccent);
  addBox(root, 'boost-sachet-right-fold', [0.035, 0.55, 0.11], [0.215, 0, 0], mats.boostFoil);
  const shine = addBox(root, 'boost-sachet-highlight', [0.025, 0.35, 0.018], [-0.135, 0.02, -0.074], mats.boostHighlight);
  shine.rotation.z = 0.1;
  root.visible = false;
  scene.add(root);
  boostPool.push({ root, active: false, lane: 1, z: -78, phase: i * 0.51, baseY: 1.05 });
}

// Rare non-alcoholic MATCHA TONIC: grants a temporary high jump.
function makeMatchaLabelTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 160; canvas.height = 192;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#e8f0dc'; ctx.fillRect(0, 0, 160, 192);
  ctx.fillStyle = '#214b38'; ctx.fillRect(8, 8, 144, 176);
  ctx.strokeStyle = '#a9e17e'; ctx.lineWidth = 3; ctx.strokeRect(15, 15, 130, 162);
  ctx.textAlign = 'center'; ctx.fillStyle = '#c8f29a'; ctx.font = '900 14px Arial'; ctx.fillText('SAF NIGHT', 80, 41);
  ctx.fillStyle = '#f4f8ec'; ctx.font = '900 28px Arial'; ctx.fillText('MATCHA', 80, 82);
  ctx.fillStyle = '#9ee178'; ctx.font = '900 17px Arial'; ctx.fillText('TONIC', 80, 108);
  ctx.strokeStyle = '#9ee178'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(80, 140, 17, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#c8f29a'; ctx.font = '700 8px Arial'; ctx.fillText('HIGH JUMP / 08', 80, 166);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
}
function makeAirJetLabelTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 160; canvas.height = 192;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#e9f1f6'; ctx.fillRect(0, 0, 160, 192);
  ctx.fillStyle = '#1c3348'; ctx.fillRect(8, 8, 144, 176);
  ctx.strokeStyle = '#70dfff'; ctx.lineWidth = 3; ctx.strokeRect(15, 15, 130, 162);
  ctx.textAlign = 'center'; ctx.fillStyle = '#f5fbff'; ctx.font = '900 25px Arial'; ctx.fillText('SAF', 80, 61);
  ctx.fillStyle = '#70dfff'; ctx.font = '900 22px Arial'; ctx.fillText('AIR-JET', 80, 91);
  ctx.strokeStyle = '#70dfff'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(80, 111); ctx.lineTo(80, 146); ctx.moveTo(65, 132); ctx.lineTo(80, 149); ctx.lineTo(95, 132); ctx.stroke();
  ctx.fillStyle = '#e9f1f6'; ctx.font = '700 9px Arial'; ctx.fillText('FLIGHT / 05 SEC', 80, 166);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
}
const matchaLabelMat = new THREE.MeshStandardMaterial({ map: makeMatchaLabelTexture(), roughness: 0.58, metalness: 0.04 });
const airJetLabelMat = new THREE.MeshStandardMaterial({ map: makeAirJetLabelTexture(), roughness: 0.45, metalness: 0.3 });
const matchaPool = [];
for (let i = 0; i < 8; i += 1) {
  const root = new THREE.Group();
  addCylinder(root, cylinderGeo, mats.matchaBottle, [0.38, 0.62, 0.38], [0, 0, 0]);
  addCylinder(root, cylinderGeo, mats.matchaLiquid, [0.345, 0.48, 0.345], [0, -0.015, 0]);
  addCylinder(root, cylinderGeo, mats.matchaCap, [0.19, 0.13, 0.19], [0, 0.365, 0]);
  addBox(root, 'matcha-front-label', [0.29, 0.38, 0.025], [0, 0.015, -0.197], matchaLabelMat);
  addBox(root, 'matcha-back-label', [0.29, 0.38, 0.025], [0, 0.015, 0.197], matchaLabelMat);
  addBox(root, 'matcha-neck-band', [0.2, 0.055, 0.2], [0, 0.28, 0], mats.matchaGlow);
  root.visible = false; scene.add(root);
  matchaPool.push({ root, active: false, lane: 1, z: -90, phase: i * 0.7, baseY: 0.95 });
}

// AIR-JET capsule: a non-smoking, fictional twin-thruster flight pickup.
const airJetPool = [];
for (let i = 0; i < 6; i += 1) {
  const root = new THREE.Group();
  addBox(root, 'air-jet-core', [0.5, 0.58, 0.28], [0, 0, 0], mats.jetBody);
  addBox(root, 'air-jet-front-label', [0.38, 0.46, 0.025], [0, 0, -0.153], airJetLabelMat);
  addBox(root, 'air-jet-back-label', [0.38, 0.46, 0.025], [0, 0, 0.153], airJetLabelMat);
  for (const side of [-1, 1]) {
    addCylinder(root, cylinderGeo, mats.jetDark, [0.12, 0.52, 0.12], [side * 0.19, 0, 0.08]);
    addCylinder(root, cylinderGeo, mats.jetAccent, [0.14, 0.08, 0.14], [side * 0.19, -0.22, 0.08]);
  }
  addBox(root, 'air-jet-handle', [0.16, 0.2, 0.14], [0, 0.36, 0], mats.jetDark);
  root.visible = false; scene.add(root);
  airJetPool.push({ root, active: false, lane: 1, z: -100, phase: i * 0.89, baseY: 1.15 });
}

const particlePool = [];
const particleMat = material(0x9dff83, 0.4, 0.1, { emissive: 0x56d75f, emissiveIntensity: 1.35 });
for (let i = 0; i < 42; i += 1) {
  const mesh = new THREE.Mesh(smallSphereGeo, particleMat);
  mesh.scale.setScalar(0.055 + (i % 3) * 0.014);
  mesh.visible = false;
  scene.add(mesh);
  particlePool.push({ mesh, active: false, vx: 0, vy: 0, vz: 0, life: 0 });
}
const boostParticlePool = [];
const boostParticleMat = material(0xb9f0ff, 0.32, 0.12, { emissive: 0x58c9eb, emissiveIntensity: 1.05 });
for (let i = 0; i < 24; i += 1) {
  const mesh = new THREE.Mesh(smallSphereGeo, boostParticleMat);
  mesh.scale.setScalar(0.045 + (i % 3) * 0.012);
  mesh.visible = false;
  scene.add(mesh);
  boostParticlePool.push({ mesh, active: false, vx: 0, vy: 0, vz: 0, life: 0 });
}
const allParticlePool = [...particlePool, ...boostParticlePool];

// -----------------------------------------------------------------------------
// Game state, UI and shop
// -----------------------------------------------------------------------------
let gameState = 'menu';
let shopCategory = 'top';
let score = 0;
let distance = 0;
let runTea = 0;
let speed = 0;
let startElapsed = 0;
let elapsedGame = 0;
let obstacleTimer = 0.9;
let teaTimer = 1.6;
let boostSpawnTimer = 5.8;
let matchaSpawnTimer = 18.0;
let airJetSpawnTimer = 30.0;
let boostActiveTimer = 0;
let boostStrength = 0;
let matchaActiveTimer = 0;
let airJetActiveTimer = 0;
let airJetElapsed = 0;
let airJetLift = 0;
let jetTrailTimer = 0;
let introLineIndex = 0;
let introLineTimer = 0;
let introElapsed = 0;
let arrestStarted = false;
let arrestLineShown = false;
let laneIndex = 1;
let targetX = 0;
let jumpHeight = 0;
let jumpVelocity = 0;
let slideTimer = 0;
let playerAnimTime = 0;
let crashTimer = 0;
let screenShake = 0;
let hintTimer = 0;
let toastTimer = 0;
let lastToast = '';
let lastHudScore = -1;
let lastHudTea = -1;

function showScreen(screenId) {
  for (const id of ['menu-screen', 'shop-screen', 'pause-screen', 'result-screen', 'cutscene-screen']) {
    $(id).classList.toggle('screen-visible', id === screenId);
  }
}

function showHud(visible) {
  $('game-hud').classList.toggle('hud-visible', visible);
}

function showHint() {
  if (saveData.hintSeen) return;
  $('control-hint').classList.add('hint-visible');
  hintTimer = 4.8;
}

function hideHint() {
  $('control-hint').classList.remove('hint-visible');
  if (!saveData.hintSeen) {
    saveData.hintSeen = true;
    persist();
  }
}

function toast(message) {
  lastToast = message;
  $('toast').textContent = message;
  $('toast').classList.add('toast-visible');
  toastTimer = 1.65;
}

function refreshMenuStats() {
  $('menu-tea').textContent = saveData.tea.toLocaleString('ru-RU');
  $('menu-best').textContent = saveData.best.toLocaleString('ru-RU');
  $('shop-tea').textContent = saveData.tea.toLocaleString('ru-RU');
}
refreshMenuStats();

function renderShop() {
  const container = $('shop-items');
  const items = SHOP[shopCategory];
  container.innerHTML = '';
  for (const item of items) {
    const unlocked = saveData.unlocked[shopCategory].includes(item.id);
    const selected = saveData.selected[shopCategory] === item.id;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `color-item${selected ? ' selected' : ''}`;
    button.dataset.item = item.id;
    button.innerHTML = `<span class="color-swatch" style="background:${item.color}"></span><strong>${item.name}</strong><small>${selected ? 'ВЫБРАНО' : unlocked ? 'ОТКРЫТО' : `${item.price} ЧАЯ`}</small>`;
    container.appendChild(button);
  }
  for (const tab of document.querySelectorAll('.shop-tab')) tab.classList.toggle('tab-active', tab.dataset.category === shopCategory);
}

function openShop() {
  gameState = 'shop';
  showHud(false);
  showScreen('shop-screen');
  shopCategory = 'top';
  applyOutfit();
  renderShop();
  $('shop-message').textContent = 'Выбери цвет или открой новый за чай.';
  setMenuCamera();
  podium.visible = true;
  podiumRing.visible = true;
  playerRoot.position.set(0, 0, 1.1);
}

function chooseShopItem(id) {
  const item = SHOP[shopCategory].find((entry) => entry.id === id);
  if (!item) return;
  const unlocked = saveData.unlocked[shopCategory].includes(id);
  if (!unlocked) {
    if (saveData.tea < item.price) {
      $('shop-message').textContent = `Не хватает ${item.price - saveData.tea} чая.`;
      return;
    }
    saveData.tea -= item.price;
    saveData.unlocked[shopCategory].push(id);
    $('shop-message').textContent = `${item.name}: теперь твой.`;
    toast('ЦВЕТ ОТКРЫТ');
  }
  saveData.selected[shopCategory] = id;
  persist();
  applyOutfit();
  refreshMenuStats();
  renderShop();
}

$('shop-items').addEventListener('click', (event) => {
  const button = event.target.closest('[data-item]');
  if (button) chooseShopItem(button.dataset.item);
});
for (const tab of document.querySelectorAll('.shop-tab')) {
  tab.addEventListener('click', () => {
    shopCategory = tab.dataset.category;
    renderShop();
    $('shop-message').textContent = shopCategory === 'top' ? 'Цвет твоей кофты.' : 'Цвет твоих кроссовок.';
  });
}

// -----------------------------------------------------------------------------
// Camera modes and run lifecycle
// -----------------------------------------------------------------------------
function setMenuCamera() {
  camera.position.set(0, 3.8, 7.8);
  camera.lookAt(0, 1.18, 0.2);
  camera.fov = 46;
  camera.updateProjectionMatrix();
}

function setGameCamera() {
  camera.position.set(0, 5.65, 9.2);
  camera.lookAt(0, 1.15, -8.5);
  cameraLook.set(0, 1.15, -8.5);
  camera.fov = 62;
  camera.updateProjectionMatrix();
}

function setIntroCamera() {
  camera.position.set(0.15, 5.15, 11.8);
  camera.lookAt(0, 1.22, 0.45);
  camera.fov = 54;
  camera.updateProjectionMatrix();
}

function resetPools() {
  for (const obstacle of obstaclePool) {
    obstacle.active = false;
    obstacle.root.visible = false;
    obstacle.van.root.visible = false;
    obstacle.low.visible = false;
    obstacle.high.visible = false;
  }
  for (const item of teaPool) {
    item.active = false;
    item.root.visible = false;
  }
  for (const item of boostPool) {
    item.active = false;
    item.root.visible = false;
  }
  for (const item of matchaPool) {
    item.active = false;
    item.root.visible = false;
  }
  for (const item of airJetPool) {
    item.active = false;
    item.root.visible = false;
  }
  for (const particle of allParticlePool) {
    particle.active = false;
    particle.mesh.visible = false;
  }
}

const INTRO_DIALOGUE = [
  { speaker: 'ПОЛИЦЕЙСКИЙ', text: 'А чё ты ночью гуляешь?', duration: 1.85, side: 'officer' },
  { speaker: 'ГЕРОЙ', text: 'Ну GTA же вышла, к другу домой иду.', duration: 2.15, side: 'hero' },
  { speaker: 'ПОЛИЦЕЙСКИЙ', text: 'Не, сейчас ты с нами в отделение поедешь, сынок.', duration: 2.25, side: 'officer' },
  { speaker: 'ГЕРОЙ', text: 'Пошёл в жопу!', duration: 1.45, side: 'hero' }
];

function setDialogueLine(speaker, text, side = 'officer') {
  $('dialogue-speaker').textContent = speaker;
  $('dialogue-line').textContent = text;
  $('dialogue-card').classList.toggle('speaker-hero', side === 'hero');
  $('dialogue-card').classList.toggle('speaker-officer', side === 'officer');
}

function startGame() {
  beginIntroCutscene();
}

function beginIntroCutscene() {
  resetPools();
  gameState = 'cutscene';
  speed = 0;
  elapsedGame = 0;
  introElapsed = 0;
  introLineIndex = 0;
  introLineTimer = 0;
  arrestStarted = false;
  arrestLineShown = false;
  podium.visible = false;
  podiumRing.visible = false;
  playerRoot.position.set(-1.05, 0, 3.35);
  playerRoot.rotation.set(0, -0.12, 0);
  playerBody.position.set(0, 0.35, 0);
  playerBody.scale.set(PLAYER_BODY_X, PLAYER_BODY_Y, PLAYER_BODY_Z);
  bodyCore.rotation.set(0, 0, 0);
  jetpackRig.visible = false;
  arrestCuffs.visible = false;
  jumpHeight = 0; jumpVelocity = 0; slideTimer = 0;
  officerRoot.position.set(1.15, 0, 0.35);
  officerRoot.rotation.set(0, Math.PI, 0);
  setOfficerOpacity(1);
  updateOfficerPose(0, 'talk');
  setIntroCamera();
  showHud(false);
  showScreen('cutscene-screen');
  $('cutscene-skip').hidden = false;
  $('cutscene-next').hidden = false;
  setDialogueLine(INTRO_DIALOGUE[0].speaker, INTRO_DIALOGUE[0].text, INTRO_DIALOGUE[0].side);
  unlockAudio();
  playBackgroundMusic();
}

function advanceIntroCutscene() {
  if (gameState !== 'cutscene') return;
  introLineIndex += 1;
  if (introLineIndex >= INTRO_DIALOGUE.length) {
    startRunAfterCutscene();
    return;
  }
  introLineTimer = 0;
  const line = INTRO_DIALOGUE[introLineIndex];
  setDialogueLine(line.speaker, line.text, line.side);
  updateOfficerPose(0, line.side === 'officer' ? 'talk' : 'idle');
}

function skipIntroCutscene() {
  if (gameState === 'cutscene') startRunAfterCutscene();
}

function startRunAfterCutscene() {
  resetPools();
  gameState = 'playing';
  score = 0;
  distance = 0;
  runTea = 0;
  speed = 0;
  startElapsed = 0;
  elapsedGame = 0;
  obstacleTimer = 0.85;
  teaTimer = 1.15;
  boostSpawnTimer = 5.2;
  matchaSpawnTimer = 17.5;
  airJetSpawnTimer = 29.0;
  boostActiveTimer = 0;
  boostStrength = 0;
  matchaActiveTimer = 0;
  airJetActiveTimer = 0;
  airJetElapsed = 0;
  airJetLift = 0;
  jetTrailTimer = 0;
  laneIndex = 1;
  targetX = 0;
  jumpHeight = 0;
  jumpVelocity = 0;
  slideTimer = 0;
  playerAnimTime = 0;
  crashTimer = 0;
  screenShake = 0;
  arrestCuffs.visible = false;
  arrestStarted = false;
  arrestLineShown = false;
  jetpackRig.visible = false;
  playerRoot.position.set(0, 0, CONFIG.playerZ);
  playerRoot.rotation.set(0, 0, 0);
  playerBody.position.set(0, 0.35, 0);
  playerBody.scale.set(PLAYER_BODY_X, PLAYER_BODY_Y, PLAYER_BODY_Z);
  bodyCore.rotation.set(0, 0, 0);
  applyOutfit();
  podium.visible = false;
  podiumRing.visible = false;
  officerRoot.position.set(0.82, 0, CONFIG.playerZ + 1.7);
  officerRoot.rotation.set(0, 0, 0);
  setOfficerOpacity(1);
  updateOfficerPose(0, 'run');
  setGameCamera();
  showScreen(null);
  showHud(true);
  $('score-value').textContent = '000000';
  $('run-tea-value').textContent = '0';
  lastHudScore = 0;
  lastHudTea = 0;
  updatePowerStatus();
  showHint();
  $('pause-button').focus({ preventScroll: true });
  unlockAudio();
  playBackgroundMusic();
}

function returnToMenu() {
  gameState = 'menu';
  if (backgroundMusicStarted) playBackgroundMusic();
  resetPools();
  showHud(false);
  showScreen('menu-screen');
  podium.visible = true;
  podiumRing.visible = true;
  playerRoot.position.set(0, 0, 1.1);
  playerRoot.rotation.set(0, 0, 0);
  playerBody.position.set(0, 0.35, 0);
  playerBody.scale.set(PLAYER_BODY_X, PLAYER_BODY_Y, PLAYER_BODY_Z);
  bodyCore.rotation.set(0, 0, 0);
  jetpackRig.visible = false;
  arrestCuffs.visible = false;
  officerRoot.visible = false;
  arrestStarted = false;
  arrestLineShown = false;
  jumpHeight = 0;
  jumpVelocity = 0;
  slideTimer = 0;
  boostActiveTimer = 0; boostStrength = 0; matchaActiveTimer = 0; airJetActiveTimer = 0; airJetLift = 0;
  updatePowerStatus();
  refreshMenuStats();
  setMenuCamera();
}

function finishRun() {
  pauseBackgroundMusic();
  score = Math.floor(distance * 10);
  if (score > saveData.best) saveData.best = score;
  persist();
  refreshMenuStats();
  $('result-score').textContent = score.toLocaleString('ru-RU');
  $('result-tea').textContent = runTea.toLocaleString('ru-RU');
  $('result-best').textContent = saveData.best.toLocaleString('ru-RU');
  $('result-police-line').textContent = 'ПОЛИЦЕЙСКИЙ: «Молодец, 5 звёзд собрал.»';
  jetpackRig.visible = false;
  arrestCuffs.visible = false;
  officerRoot.visible = false;
  gameState = 'gameover';
  showHud(false);
  showScreen('result-screen');
  podium.visible = false;
  podiumRing.visible = false;
  setMenuCamera();
}

function pauseGame() {
  if (gameState !== 'playing') return;
  pauseBackgroundMusic();
  gameState = 'paused';
  showScreen('pause-screen');
  showHud(false);
}

function resumeGame() {
  if (gameState !== 'paused') return;
  playBackgroundMusic();
  gameState = 'playing';
  showScreen(null);
  showHud(true);
}

// -----------------------------------------------------------------------------
// Pool helpers and procedural spawn patterns
// -----------------------------------------------------------------------------
function freeObstacle() {
  for (const item of obstaclePool) if (!item.active) return item;
  return null;
}

function spawnObstacle(lane, z, type) {
  const item = freeObstacle();
  if (!item) return null;
  item.active = true;
  item.type = type;
  item.lane = lane;
  item.z = z;
  item.phase = Math.random() * Math.PI * 2;
  item.root.position.set(CONFIG.lanes[lane], 0, z);
  item.root.visible = true;
  item.van.root.visible = type === 'van';
  item.low.visible = type === 'low';
  item.high.visible = type === 'high';
  return item;
}

function spawnObstacleRow() {
  const lanes = [0, 1, 2];
  for (let i = lanes.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [lanes[i], lanes[j]] = [lanes[j], lanes[i]];
  }
  const count = Math.random() < 0.62 ? 1 : 2;
  const z = -70;
  for (let i = 0; i < count; i += 1) {
    const roll = Math.random();
    const type = roll < 0.61 ? 'van' : roll < 0.82 ? 'low' : 'high';
    spawnObstacle(lanes[i], z - (i % 2) * 0.2, type);
  }
}

function laneIsBlocked(lane, z, radius = 7) {
  for (const obstacle of obstaclePool) {
    if (obstacle.active && obstacle.lane === lane && Math.abs(obstacle.z - z) < radius) return true;
  }
  return false;
}

function freeTeaLane(z) {
  const options = [0, 1, 2].filter((lane) => !laneIsBlocked(lane, z, 12));
  if (options.length === 0) return Math.floor(Math.random() * 3);
  return options[Math.floor(Math.random() * options.length)];
}

function freeTeaItem() {
  for (const item of teaPool) if (!item.active) return item;
  return null;
}

function spawnTeaGroup() {
  const lane = freeTeaLane(-71);
  const count = 3 + Math.floor(Math.random() * 5);
  const arc = Math.random() < 0.48;
  for (let i = 0; i < count; i += 1) {
    const item = freeTeaItem();
    if (!item) break;
    item.active = true;
    item.lane = lane;
    item.z = -68 - i * 1.55;
    item.phase = Math.random() * Math.PI * 2;
    item.baseY = arc ? 0.98 + Math.sin((i / Math.max(1, count - 1)) * Math.PI) * 0.5 : 0.98;
    item.root.position.set(CONFIG.lanes[lane] + (arc ? Math.sin(i * 0.7) * 0.08 : 0), item.baseY, item.z);
    item.root.rotation.set(0, 0, 0);
    item.root.visible = true;
  }
}

function freeBoostItem() {
  for (const item of boostPool) if (!item.active) return item;
  return null;
}

function spawnBoostGroup() {
  const z = -76;
  const laneOptions = [0, 1, 2].filter((lane) => !laneIsBlocked(lane, z, 14));
  if (laneOptions.length === 0) return;
  const lane = laneOptions[Math.floor(Math.random() * laneOptions.length)];
  const count = Math.random() < 0.72 ? 1 : 2;
  for (let i = 0; i < count; i += 1) {
    const item = freeBoostItem();
    if (!item) break;
    item.active = true;
    item.lane = lane;
    item.z = z - i * 2.2;
    item.phase = Math.random() * Math.PI * 2;
    item.baseY = 1.08 + (count === 2 ? Math.sin(i * 0.8) * 0.08 : 0);
    item.root.position.set(CONFIG.lanes[lane], item.baseY, item.z);
    item.root.rotation.set(0, 0, 0);
    item.root.visible = true;
  }
}

function spawnRarePickup(pool, z, baseY) {
  const item = pool.find((entry) => !entry.active);
  if (!item) return;
  const lanes = [0, 1, 2].filter((lane) => !laneIsBlocked(lane, z, 15));
  if (!lanes.length) return;
  const lane = lanes[Math.floor(Math.random() * lanes.length)];
  item.active = true;
  item.lane = lane;
  item.z = z;
  item.phase = Math.random() * Math.PI * 2;
  item.baseY = baseY;
  item.root.position.set(CONFIG.lanes[lane], baseY, z);
  item.root.rotation.set(0, 0, 0);
  item.root.visible = true;
}

function spawnParticles(x, y, z) {
  let spawned = 0;
  for (const particle of particlePool) {
    if (particle.active) continue;
    particle.active = true;
    particle.life = 0.42 + Math.random() * 0.22;
    particle.mesh.visible = true;
    particle.mesh.position.set(x, y, z);
    particle.vx = (Math.random() - 0.5) * 3.2;
    particle.vy = 1.1 + Math.random() * 2.5;
    particle.vz = (Math.random() - 0.5) * 2.6;
    spawned += 1;
    if (spawned >= 8) break;
  }
}

function spawnBoostParticles(x, y, z) {
  let spawned = 0;
  for (const particle of boostParticlePool) {
    if (particle.active) continue;
    particle.active = true;
    particle.life = 0.36 + Math.random() * 0.2;
    particle.mesh.visible = true;
    particle.mesh.position.set(x, y, z);
    particle.vx = (Math.random() - 0.5) * 3.0;
    particle.vy = 1.0 + Math.random() * 2.2;
    particle.vz = (Math.random() - 0.5) * 2.4;
    spawned += 1;
    if (spawned >= 7) break;
  }
}

function spawnJetExhaust() {
  let spawned = 0;
  for (const particle of boostParticlePool) {
    if (particle.active) continue;
    particle.active = true;
    particle.life = 0.24 + Math.random() * 0.12;
    particle.mesh.visible = true;
    const side = spawned % 2 === 0 ? -0.2 : 0.2;
    particle.mesh.position.set(playerRoot.position.x + side, playerBody.position.y + 0.2, CONFIG.playerZ + 0.38);
    particle.vx = (Math.random() - 0.5) * 0.8;
    particle.vy = -1.35 - Math.random() * 1.1;
    particle.vz = 1.0 + Math.random() * 0.6;
    spawned += 1;
    if (spawned >= 2) break;
  }
}

// -----------------------------------------------------------------------------
// Background soundtrack and lightweight synthesized sound
// The supplied MP3 loops continuously and starts after the Play button gesture.
// -----------------------------------------------------------------------------
const backgroundMusic = new Audio('./music.mp3');
backgroundMusic.loop = true;
backgroundMusic.volume = 0.34;
backgroundMusic.preload = 'auto';
let backgroundMusicStarted = false;

function playBackgroundMusic() {
  backgroundMusicStarted = true;
  const playback = backgroundMusic.play();
  if (playback && typeof playback.catch === 'function') playback.catch(() => {
    // Browsers may defer playback until the next user gesture; gameplay remains unaffected.
  });
}

function pauseBackgroundMusic() {
  backgroundMusic.pause();
}

let audioContext = null;
function unlockAudio() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  try {
    if (!audioContext) audioContext = new AudioContextClass();
    if (audioContext.state === 'suspended') audioContext.resume();
  } catch (error) { /* Audio is optional; the game stays playable without it. */ }
}
function beep(frequency, duration = 0.08, waveform = 'sine', volume = 0.035) {
  if (!audioContext || audioContext.state !== 'running') return;
  try {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const now = audioContext.currentTime;
    oscillator.type = waveform;
    oscillator.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + duration);
  } catch (error) { /* Audio failure must not interrupt gameplay. */ }
}

// -----------------------------------------------------------------------------
// Input: swipe, tap, keyboard. Threshold avoids accidental direction changes.
// -----------------------------------------------------------------------------
let pointerStartX = 0;
let pointerStartY = 0;
let pointerStartTime = 0;
let pointerActive = false;
const SWIPE_THRESHOLD = 30;

function moveLane(direction) {
  if (gameState !== 'playing') return;
  laneIndex = Math.max(0, Math.min(2, laneIndex + direction));
  targetX = CONFIG.lanes[laneIndex];
  hideHint();
}
function jump() {
  if (gameState !== 'playing' || airJetActiveTimer > 0) return;
  hideHint();
  if (jumpHeight > 0.02 || slideTimer > 0.08) return;
  jumpVelocity = matchaActiveTimer > 0 ? 14.6 : 9.2;
  beep(matchaActiveTimer > 0 ? 520 : 360, 0.07, 'triangle', matchaActiveTimer > 0 ? 0.026 : 0.018);
}
function slide() {
  if (gameState !== 'playing' || airJetActiveTimer > 0) return;
  hideHint();
  if (jumpHeight > 0.42) return;
  slideTimer = 0.78;
}

renderer.domElement.addEventListener('pointerdown', (event) => {
  if (gameState !== 'playing') return;
  pointerActive = true;
  pointerStartX = event.clientX;
  pointerStartY = event.clientY;
  pointerStartTime = performance.now();
  unlockAudio();
  try { renderer.domElement.setPointerCapture(event.pointerId); } catch (error) { /* Capture is not required. */ }
});
renderer.domElement.addEventListener('pointerup', (event) => {
  if (!pointerActive || gameState !== 'playing') return;
  pointerActive = false;
  const dx = event.clientX - pointerStartX;
  const dy = event.clientY - pointerStartY;
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (Math.max(ax, ay) < SWIPE_THRESHOLD) {
    if (performance.now() - pointerStartTime < 550) jump();
    return;
  }
  if (ax > ay) moveLane(dx > 0 ? 1 : -1);
  else if (dy < 0) jump();
  else slide();
});
renderer.domElement.addEventListener('pointercancel', () => { pointerActive = false; });

window.addEventListener('keydown', (event) => {
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'a', 'd', 'w', 's'].includes(event.key)) event.preventDefault();
  if (gameState !== 'playing') {
    if (event.key === 'Escape' && gameState === 'paused') resumeGame();
    else if (gameState === 'cutscene' && (event.key === 'Enter' || event.key === ' ')) advanceIntroCutscene();
    return;
  }
  if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'a') moveLane(-1);
  else if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'd') moveLane(1);
  else if (event.key === 'ArrowUp' || event.key.toLowerCase() === 'w' || event.key === ' ') jump();
  else if (event.key === 'ArrowDown' || event.key.toLowerCase() === 's') slide();
  else if (event.key === 'Escape') pauseGame();
});

// -----------------------------------------------------------------------------
// UI event wiring
// -----------------------------------------------------------------------------
$('play-button').addEventListener('click', startGame);
$('cutscene-next').addEventListener('click', advanceIntroCutscene);
$('cutscene-skip').addEventListener('click', skipIntroCutscene);
$('shop-button').addEventListener('click', openShop);
$('shop-back').addEventListener('click', returnToMenu);
$('pause-button').addEventListener('click', pauseGame);
$('resume-button').addEventListener('click', resumeGame);
$('pause-menu-button').addEventListener('click', returnToMenu);
$('restart-button').addEventListener('click', startRunAfterCutscene);
$('result-menu-button').addEventListener('click', returnToMenu);

// -----------------------------------------------------------------------------
// Fixed-step simulation and collision checks
// -----------------------------------------------------------------------------
function checkCollisions() {
  if (airJetActiveTimer > 0) return;
  const playerX = playerRoot.position.x;
  for (const obstacle of obstaclePool) {
    if (!obstacle.active) continue;
    if (Math.abs(obstacle.root.position.z - CONFIG.playerZ) > (obstacle.type === 'van' ? 2.25 : 1.0)) continue;
    if (Math.abs(obstacle.root.position.x - playerX) > 1.32) continue;
    const highJumpClearsVehicle = matchaActiveTimer > 0 && jumpHeight > 2.35 && (obstacle.type === 'van' || obstacle.type === 'high');
    if (highJumpClearsVehicle) continue;
    if (obstacle.type === 'low' && jumpHeight > 0.72) continue;
    triggerCrash();
    return;
  }
}

function triggerCrash() {
  if (gameState !== 'playing') return;
  gameState = 'crashing';
  crashTimer = 2.45;
  screenShake = 0.5;
  beep(105, 0.28, 'sawtooth', 0.035);
  bodyCore.rotation.x = -0.38;
  playerBody.position.y = 0.16;
  jetpackRig.visible = false;
  airJetActiveTimer = 0;
  arrestStarted = true;
  arrestLineShown = false;
  arrestCuffs.visible = false;
  const arrestSide = playerRoot.position.x > 1.25 ? -0.62 : 0.62;
  officerRoot.position.set(playerRoot.position.x + arrestSide, 0, CONFIG.playerZ + 6.3);
  officerRoot.rotation.set(0, 0, 0);
  setOfficerOpacity(1);
  $('cutscene-skip').hidden = true;
  $('cutscene-next').hidden = true;
}

function collectTea(item) {
  item.active = false;
  item.root.visible = false;
  runTea += 1;
  saveData.tea += 1;
  persist();
  spawnParticles(item.root.position.x, item.root.position.y, item.root.position.z);
  beep(640 + (runTea % 4) * 75, 0.07, 'sine', 0.025);
}

function collectBoost(item) {
  item.active = false;
  item.root.visible = false;
  boostStrength = Math.min(6.0, boostStrength + 1.65);
  boostActiveTimer = Math.min(16.0, boostActiveTimer + 6.2);
  spawnBoostParticles(item.root.position.x, item.root.position.y, item.root.position.z);
  toast('SAF BOOST  ·  СКОРОСТЬ +');
  beep(880 + boostStrength * 80, 0.13, 'triangle', 0.032);
}

function collectMatcha(item) {
  item.active = false;
  item.root.visible = false;
  matchaActiveTimer = Math.max(matchaActiveTimer, 8.5);
  spawnParticles(item.root.position.x, item.root.position.y, item.root.position.z);
  toast('MATCHA TONIC  ·  ВЫСОКИЙ ПРЫЖОК');
  beep(720, 0.13, 'sine', 0.03);
  updatePowerStatus();
}

function collectAirJet(item) {
  item.active = false;
  item.root.visible = false;
  airJetActiveTimer = 5.0;
  airJetElapsed = 0;
  airJetLift = 0;
  jetTrailTimer = 0;
  jumpHeight = 0;
  jumpVelocity = 0;
  slideTimer = 0;
  jetpackRig.visible = true;
  spawnBoostParticles(item.root.position.x, item.root.position.y, item.root.position.z);
  toast('AIR-JET  ·  ПОЛЁТ 5 СЕК');
  beep(1040, 0.2, 'triangle', 0.035);
  updatePowerStatus();
}

function updatePowerStatus() {
  const matcha = $('matcha-status');
  const jet = $('jet-status');
  if (!matcha || !jet) return;
  matcha.textContent = matchaActiveTimer > 0 ? `MATCHA ${matchaActiveTimer.toFixed(1)}s` : '';
  jet.textContent = airJetActiveTimer > 0 ? `AIR-JET ${airJetActiveTimer.toFixed(1)}s` : '';
  matcha.classList.toggle('power-active', matchaActiveTimer > 0);
  jet.classList.toggle('power-active', airJetActiveTimer > 0);
}

function updatePlayer(dt) {
  playerAnimTime += dt;
  const laneBlend = 1 - Math.exp(-dt * 12);
  playerRoot.position.x += (targetX - playerRoot.position.x) * laneBlend;
  playerRoot.rotation.z += ((targetX - playerRoot.position.x) * -0.075 - playerRoot.rotation.z) * (1 - Math.exp(-dt * 9));

  if (jumpHeight > 0 || jumpVelocity > 0) {
    jumpHeight += jumpVelocity * dt;
    jumpVelocity -= 23.5 * dt;
    if (jumpHeight <= 0) {
      jumpHeight = 0;
      jumpVelocity = 0;
    }
  }
  if (slideTimer > 0) slideTimer = Math.max(0, slideTimer - dt);

  airJetElapsed = airJetActiveTimer > 0 ? 5.0 - airJetActiveTimer : 0;
  const takeoff = Math.max(0, Math.min(1, airJetElapsed / 0.48));
  const landing = Math.max(0, Math.min(1, airJetActiveTimer / 0.58));
  const smoothTakeoff = takeoff * takeoff * (3 - 2 * takeoff);
  const smoothLanding = landing * landing * (3 - 2 * landing);
  airJetLift = airJetActiveTimer > 0 ? 3.45 * smoothTakeoff * smoothLanding : 0;
  jetpackRig.visible = airJetActiveTimer > 0;
  const flamePulse = 0.82 + Math.sin(playerAnimTime * 28) * 0.12 + Math.sin(playerAnimTime * 13) * 0.06;
  for (const flame of jetpackFlames) {
    flame.outerFlame.scale.set(1, flamePulse, 1);
    flame.innerFlame.scale.set(0.58, flamePulse * 0.72, 0.58);
  }

  const swing = Math.sin(playerAnimTime * 12.2);
  const crouch = slideTimer > 0 && airJetActiveTimer <= 0;
  const bob = crouch ? 0 : Math.abs(Math.sin(playerAnimTime * 12.2)) * 0.055;
  playerBody.position.y = 0.35 + jumpHeight + airJetLift + bob - (crouch ? 0.2 : 0);
  playerBody.scale.y += ((crouch ? 0.64 : PLAYER_BODY_Y) - playerBody.scale.y) * (1 - Math.exp(-dt * 18));
  const flying = airJetActiveTimer > 0;
  bodyCore.rotation.x += ((flying ? -0.16 : crouch ? 0.46 : -0.035) - bodyCore.rotation.x) * (1 - Math.exp(-dt * 12));
  for (const arm of armPivots) {
    arm.shoulder.rotation.x = flying ? -0.35 + arm.side * 0.12 : crouch ? -0.92 : swing * 0.58 * arm.side;
    arm.shoulder.rotation.z = arm.side * (flying ? -0.28 : crouch ? -0.18 : 0.06);
  }
  for (const forearm of forearmPivots) forearm.elbow.rotation.x = flying ? -0.52 : crouch ? -0.35 : -0.16 + Math.max(0, Math.sin(playerAnimTime * 12.2 + forearm.side)) * 0.25;
  for (const leg of legPivots) {
    leg.hip.rotation.x = flying ? 0.38 + leg.side * 0.08 : crouch ? -0.82 + leg.side * 0.08 : swing * 0.68 * leg.side;
    leg.knee.rotation.x = flying ? 0.52 : crouch ? 1.12 : Math.max(0, -swing * leg.side) * 0.72;
  }
}

function updateWorld(dt) {
  const travel = speed * dt;
  for (const segment of roadSegments) {
    segment.position.z += travel;
    if (segment.position.z > CONFIG.playerZ + CONFIG.segmentLength * 0.5) segment.position.z -= CONFIG.segmentLength * CONFIG.segmentCount;
  }
  for (const lamp of streetLamps) {
    lamp.group.position.z += travel * 0.94;
    if (lamp.group.position.z > 17) lamp.group.position.z -= 186;
  }
  for (const building of cityBuildings) {
    building.group.position.z += travel * 0.22;
    if (building.group.position.z > 18) building.group.position.z -= 225;
  }
  // Alternating emergency beacons, deliberately bright but limited in count.
  for (const obstacle of obstaclePool) {
    if (!obstacle.active) continue;
    obstacle.root.position.z += travel;
    obstacle.z = obstacle.root.position.z;
    if (obstacle.type === 'van') {
      const pulse = Math.sin(elapsedGame * 13.5 + obstacle.phase);
      obstacle.van.blueBeacon.material.emissiveIntensity = pulse > 0 ? 2.5 : 0.25;
      obstacle.van.redBeacon.material.emissiveIntensity = pulse > 0 ? 0.25 : 2.5;
      if (obstacle.root.position.z > CONFIG.playerZ + 5) {
        obstacle.active = false;
        obstacle.root.visible = false;
      }
    } else if (obstacle.root.position.z > CONFIG.playerZ + 3) {
      obstacle.active = false;
      obstacle.root.visible = false;
    }
  }

  for (const item of teaPool) {
    if (!item.active || gameState !== 'playing') continue;
    item.z += travel;
    item.root.position.z = item.z;
    item.root.position.y = item.baseY + Math.sin(elapsedGame * 4.5 + item.phase) * 0.09;
    item.root.rotation.y = Math.sin(elapsedGame * 2.2 + item.phase) * 0.17;
    item.root.rotation.z = Math.sin(elapsedGame * 3.1 + item.phase) * 0.055;
    if (item.z > CONFIG.playerZ + 2.0) {
      item.active = false;
      item.root.visible = false;
      continue;
    }
    if (Math.abs(item.z - CONFIG.playerZ) < 1.05 && Math.abs(item.root.position.x - playerRoot.position.x) < 1.05) collectTea(item);
  }

  for (const item of boostPool) {
    if (!item.active || gameState !== 'playing') continue;
    item.z += travel;
    item.root.position.z = item.z;
    item.root.position.y = item.baseY + Math.sin(elapsedGame * 4.1 + item.phase) * 0.11;
    item.root.rotation.y = Math.sin(elapsedGame * 2.0 + item.phase) * 0.22;
    item.root.rotation.z = Math.sin(elapsedGame * 3.0 + item.phase) * 0.06;
    if (item.z > CONFIG.playerZ + 2.0) {
      item.active = false;
      item.root.visible = false;
      continue;
    }
    if (Math.abs(item.z - CONFIG.playerZ) < 1.05 && Math.abs(item.root.position.x - playerRoot.position.x) < 1.05) collectBoost(item);
  }

  for (const item of matchaPool) {
    if (!item.active || gameState !== 'playing') continue;
    item.z += travel;
    item.root.position.z = item.z;
    item.root.position.y = item.baseY + Math.sin(elapsedGame * 3.8 + item.phase) * 0.1;
    item.root.rotation.y = Math.sin(elapsedGame * 1.8 + item.phase) * 0.24;
    item.root.rotation.z = Math.sin(elapsedGame * 2.7 + item.phase) * 0.04;
    if (item.z > CONFIG.playerZ + 2.0) { item.active = false; item.root.visible = false; continue; }
    if (Math.abs(item.z - CONFIG.playerZ) < 1.05 && Math.abs(item.root.position.x - playerRoot.position.x) < 1.05) collectMatcha(item);
  }

  for (const item of airJetPool) {
    if (!item.active || gameState !== 'playing') continue;
    item.z += travel;
    item.root.position.z = item.z;
    item.root.position.y = item.baseY + Math.sin(elapsedGame * 3.2 + item.phase) * 0.13;
    item.root.rotation.y = Math.sin(elapsedGame * 1.65 + item.phase) * 0.2;
    item.root.rotation.z = Math.sin(elapsedGame * 2.4 + item.phase) * 0.05;
    if (item.z > CONFIG.playerZ + 2.0) { item.active = false; item.root.visible = false; continue; }
    if (Math.abs(item.z - CONFIG.playerZ) < 1.05 && Math.abs(item.root.position.x - playerRoot.position.x) < 1.05) collectAirJet(item);
  }

  for (const particle of allParticlePool) {
    if (!particle.active) continue;
    particle.life -= dt;
    particle.mesh.position.x += particle.vx * dt;
    particle.mesh.position.y += particle.vy * dt;
    particle.mesh.position.z += particle.vz * dt;
    particle.vy -= 5.5 * dt;
    particle.mesh.scale.multiplyScalar(0.985);
    if (particle.life <= 0) {
      particle.active = false;
      particle.mesh.visible = false;
      particle.mesh.scale.setScalar(0.07);
    }
  }
}

function updateHud() {
  const nextScore = Math.floor(distance * 10);
  if (nextScore !== lastHudScore) {
    $('score-value').textContent = String(nextScore).padStart(6, '0');
    lastHudScore = nextScore;
  }
  if (runTea !== lastHudTea) {
    $('run-tea-value').textContent = String(runTea);
    lastHudTea = runTea;
  }
}

function simulate(dt) {
  if (gameState === 'playing' || gameState === 'crashing') {
    elapsedGame += dt;
    startElapsed += dt;
    const ramp = Math.min(1, startElapsed / 1.3);
    const progressionSpeed = Math.min(CONFIG.maxSpeed, CONFIG.initialSpeed + (CONFIG.maxSpeed - CONFIG.initialSpeed) * Math.min(1, Math.max(0, (elapsedGame - 18) / 115)));
    const boostFade = boostActiveTimer > 0 ? Math.min(1, boostActiveTimer / 1.35) : 0;
    speed = Math.min(CONFIG.maxSpeed + 7.0, progressionSpeed * ramp + boostStrength * boostFade);
    if (gameState === 'playing') {
      distance += speed * dt;
      updatePlayer(dt);
      obstacleTimer -= dt;
      teaTimer -= dt;
      boostSpawnTimer -= dt;
      matchaSpawnTimer -= dt;
      airJetSpawnTimer -= dt;
      if (obstacleTimer <= 0) {
        spawnObstacleRow();
        obstacleTimer = Math.max(1.05, 1.72 - (speed - CONFIG.initialSpeed) * 0.035) + Math.random() * 0.26;
      }
      if (teaTimer <= 0) {
        spawnTeaGroup();
        teaTimer = 2.45 + Math.random() * 1.0;
      }
      if (boostSpawnTimer <= 0) {
        spawnBoostGroup();
        boostSpawnTimer = 7.8 + Math.random() * 3.8;
      }
      if (matchaSpawnTimer <= 0) {
        spawnRarePickup(matchaPool, -86, 1.0);
        matchaSpawnTimer = 22 + Math.random() * 12;
      }
      if (airJetSpawnTimer <= 0) {
        spawnRarePickup(airJetPool, -98, 1.18);
        airJetSpawnTimer = 34 + Math.random() * 16;
      }
      if (boostActiveTimer > 0) boostActiveTimer = Math.max(0, boostActiveTimer - dt);
      if (boostActiveTimer <= 0) boostStrength = 0;
      if (matchaActiveTimer > 0) matchaActiveTimer = Math.max(0, matchaActiveTimer - dt);
      if (airJetActiveTimer > 0) {
        airJetActiveTimer = Math.max(0, airJetActiveTimer - dt);
        jetTrailTimer -= dt;
        if (jetTrailTimer <= 0) {
          spawnJetExhaust();
          jetTrailTimer = 0.075;
        }
      }
      if (airJetActiveTimer <= 0) airJetLift = 0;
      updatePowerStatus();
      updateWorld(dt);
      checkCollisions();
      updateHud();
      const chaseFade = Math.max(0, Math.min(1, (speed - 17.4) / 5.2));
      if (gameState === 'playing' && officerRoot.visible && !arrestStarted) {
        const chaseSide = playerRoot.position.x > 1.25 ? -0.78 : 0.78;
        const chaseTargetX = Math.max(-3.55, Math.min(3.55, playerRoot.position.x + chaseSide));
        officerRoot.position.x += (chaseTargetX - officerRoot.position.x) * (1 - Math.exp(-dt * 1.4));
        officerRoot.position.z = CONFIG.playerZ + 1.7 + chaseFade * 2.2;
        setOfficerOpacity(1 - chaseFade);
        updateOfficerPose(dt, 'run');
      }
    } else {
      updateWorld(dt);
      crashTimer -= dt;
      const arrestProgress = 2.45 - crashTimer;
      if (arrestStarted) {
        const approach = Math.min(1, arrestProgress / 1.55);
        officerRoot.position.z = CONFIG.playerZ + 6.3 - approach * 4.85;
        const arrestSide = playerRoot.position.x > 1.25 ? -0.62 : 0.62;
        officerRoot.position.x += ((playerRoot.position.x + arrestSide) - officerRoot.position.x) * (1 - Math.exp(-dt * 3.8));
        updateOfficerPose(dt, arrestProgress > 1.55 ? 'arrest' : 'run');
        if (crashTimer < 0.68) {
          arrestCuffs.visible = true;
          if (!arrestLineShown) {
            arrestLineShown = true;
            setDialogueLine('ПОЛИЦЕЙСКИЙ', 'Молодец, 5 звёзд собрал.', 'officer');
            $('cutscene-skip').hidden = true;
            $('cutscene-next').hidden = true;
            showScreen('cutscene-screen');
          }
        }
      }
      if (crashTimer <= 0) finishRun();
    }
  } else if (gameState === 'cutscene') {
    introElapsed += dt;
    introLineTimer += dt;
    playerAnimTime += dt;
    playerBody.position.y = 0.35 + Math.sin(introElapsed * 2.0) * 0.018;
    updateOfficerPose(dt, INTRO_DIALOGUE[introLineIndex]?.side === 'officer' ? 'talk' : 'idle');
    if (introLineTimer >= (INTRO_DIALOGUE[introLineIndex]?.duration || 1.4)) advanceIntroCutscene();
  } else if (gameState === 'menu' || gameState === 'shop' || gameState === 'gameover') {
    playerAnimTime += dt;
    playerRoot.rotation.y = Math.sin(playerAnimTime * 0.48) * 0.16;
    playerBody.position.y = 0.35 + Math.abs(Math.sin(playerAnimTime * 2.1)) * 0.025;
    for (const arm of armPivots) arm.shoulder.rotation.x = Math.sin(playerAnimTime * 2.1 + arm.side) * 0.06;
    for (const leg of legPivots) leg.hip.rotation.x = 0;
  }

  if (hintTimer > 0) {
    hintTimer -= dt;
    if (hintTimer <= 0) $('control-hint').classList.remove('hint-visible');
  }
  if (toastTimer > 0) {
    toastTimer -= dt;
    if (toastTimer <= 0) $('toast').classList.remove('toast-visible');
  }
  if (screenShake > 0) screenShake = Math.max(0, screenShake - dt);
}

// -----------------------------------------------------------------------------
// Camera follow, resize and render loop
// -----------------------------------------------------------------------------
const cameraLook = new THREE.Vector3(0, 1.1, -8.5);
let accumulator = 0;
let previousTime = performance.now();
function frame(now) {
  const frameDelta = Math.min(0.1, Math.max(0, (now - previousTime) / 1000));
  previousTime = now;
  accumulator += frameDelta;
  while (accumulator >= CONFIG.fixedStep) {
    simulate(CONFIG.fixedStep);
    accumulator -= CONFIG.fixedStep;
  }

  if (gameState === 'playing' || gameState === 'crashing' || gameState === 'paused') {
    const lightFollow = 1 - Math.exp(-frameDelta * 3.2);
    const playerX = playerRoot.position.x;
    warmLampLight.position.x += ((playerX - 4.2) - warmLampLight.position.x) * lightFollow;
    warmLampLight.position.z += ((CONFIG.playerZ - 7.5) - warmLampLight.position.z) * lightFollow;
    coolLampLight.position.x += ((playerX + 3.8) - coolLampLight.position.x) * lightFollow;
    coolLampLight.position.z += ((CONFIG.playerZ + 2.4) - coolLampLight.position.z) * lightFollow;
    const follow = 1 - Math.exp(-frameDelta * 4.2);
    camera.position.x += (playerRoot.position.x * 0.16 - camera.position.x) * follow;
    cameraLook.x += (playerRoot.position.x * 0.14 - cameraLook.x) * follow;
    cameraLook.y += (1.05 + jumpHeight * 0.08 + airJetLift * 0.24 - cameraLook.y) * follow;
    const desiredCameraY = 5.65 + airJetLift * 0.16;
    camera.position.y += (desiredCameraY - camera.position.y) * follow;
    camera.lookAt(cameraLook);
    const targetFov = Math.min(68, 62 + Math.max(0, speed - CONFIG.initialSpeed) * 0.18 + airJetLift * 0.35);
    const nextFov = camera.fov + (targetFov - camera.fov) * (1 - Math.exp(-frameDelta * 2.8));
    if (Math.abs(nextFov - camera.fov) > 0.015) {
      camera.fov = nextFov;
      camera.updateProjectionMatrix();
    }
    if (screenShake > 0) {
      camera.position.x += (Math.random() - 0.5) * screenShake * 0.34;
      camera.position.y += (Math.random() - 0.5) * screenShake * 0.2;
    }
  }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width, height);
}
window.addEventListener('resize', resize, { passive: true });
window.addEventListener('orientationchange', resize, { passive: true });

// Initial composition and start.
setMenuCamera();
playerRoot.position.set(0, 0, 1.1);
playerBody.position.set(0, 0.35, 0);
podium.visible = true;
podiumRing.visible = true;
requestAnimationFrame(frame);
