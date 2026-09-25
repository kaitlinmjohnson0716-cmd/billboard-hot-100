// "Chart Skyline" — the top 10 artists as towers standing on a spinning
// record, like a turntable. Colors mirror css/style.css's --series-1 (blue),
// --series-2 (orange) and --ink-navy tokens; kept as plain hex here since
// Three.js materials don't read CSS custom properties.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const COLOR_TOWER = 0x2a78d6;
const COLOR_HOVER = 0xeb6834;
const COLOR_BG = 0x101a2b;
const COLOR_PLINTH = 0x1b2436;
const COLOR_LABEL = 0xeb6834;
const COLOR_METAL = 0xd2d6dd;
const COLOR_TONEARM = 0x6b7690;

const DISC_RADIUS = 8.6;
const DISC_Y = 0.06;
const PLATTER_SPEED = 0.12; // rad/sec — one slow rotation roughly every 52s

const DATASETS = {
  no1: { key: "most_no1_by_artist", valueKey: "count", unit: "#1 hit", unitPlural: "#1 hits" },
  weeks: { key: "most_cumulative_weeks_by_artist", valueKey: "weeks", unit: "chart-week", unitPlural: "chart-weeks" },
};

const container = document.getElementById("skyline-canvas-wrap");
const canvas = document.getElementById("skyline-canvas");
const leaderboardEl = document.getElementById("skyline-leaderboard");
const resetBtn = document.getElementById("skyline-reset");
const toggleBtns = Array.from(document.querySelectorAll(".skyline-toggle__btn"));

let stats = null;
let currentMetric = "no1";
let towers = [];
let hoveredIndex = null;
let pinnedIndex = null;

const scene = new THREE.Scene();
scene.background = new THREE.Color(COLOR_BG);
scene.fog = new THREE.Fog(COLOR_BG, 22, 40);

const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
const DEFAULT_CAM_POS = new THREE.Vector3(0, 11, 13.5);
camera.position.copy(DEFAULT_CAM_POS);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.shadowMap.enabled = true;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.minDistance = 8;
controls.maxDistance = 26;
controls.maxPolarAngle = Math.PI / 2 - 0.05;
controls.target.set(0, 1, 0);

scene.add(new THREE.HemisphereLight(0xaab4d6, 0x0a0f1a, 0.85));
const dirLight = new THREE.DirectionalLight(0xffffff, 1.3);
dirLight.position.set(6, 12, 6);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(1024, 1024);
dirLight.shadow.camera.left = -12;
dirLight.shadow.camera.right = 12;
dirLight.shadow.camera.top = 12;
dirLight.shadow.camera.bottom = -12;
scene.add(dirLight);

const stageLight = new THREE.SpotLight(0xffffff, 1.6, 24, Math.PI / 5, 0.45, 1.1);
stageLight.position.set(0, 15, 3);
stageLight.target.position.set(0, 0, 0);
scene.add(stageLight);
scene.add(stageLight.target);

const labelGlow = new THREE.PointLight(COLOR_LABEL, 0.9, 9, 2);
labelGlow.position.set(0, 2.2, 0);
scene.add(labelGlow);

// ---- Turntable: static plinth + tonearm, spinning platter ----

const plinth = new THREE.Mesh(
  new THREE.CylinderGeometry(9.6, 9.8, 0.5, 64),
  new THREE.MeshStandardMaterial({ color: COLOR_PLINTH, roughness: 0.6, metalness: 0.25 })
);
plinth.position.y = -0.25;
plinth.receiveShadow = true;
scene.add(plinth);

function createVinylTexture() {
  const size = 1024;
  const tex = document.createElement("canvas");
  tex.width = size;
  tex.height = size;
  const ctx = tex.getContext("2d");
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2;
  const labelRadius = r * 0.34;

  ctx.fillStyle = "#0d0d0f";
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  for (let radius = labelRadius + 16; radius < r - 6; radius += 4.5) {
    ctx.strokeStyle = `rgba(255,255,255,${0.1 + (radius % 27 < 1 ? 0.14 : 0)})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, r - 3, 0, Math.PI * 2);
  ctx.stroke();

  const labelGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, labelRadius);
  labelGrad.addColorStop(0, "#ff9c5c");
  labelGrad.addColorStop(1, "#eb6834");
  ctx.fillStyle = labelGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, labelRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(16,26,43,0.35)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, labelRadius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = "rgba(16,26,43,0.88)";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 44px system-ui, sans-serif";
  ctx.fillText("HOT 100", cx, cy - 16);
  ctx.font = "600 20px system-ui, sans-serif";
  ctx.fillText("33⅓ RPM", cx, cy + 22);

  ctx.fillStyle = "#05050a";
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.03, 0, Math.PI * 2);
  ctx.fill();

  const texture = new THREE.CanvasTexture(tex);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const platterGroup = new THREE.Group();
scene.add(platterGroup);

const vinylDisc = new THREE.Mesh(
  new THREE.CircleGeometry(DISC_RADIUS, 128),
  new THREE.MeshStandardMaterial({ map: createVinylTexture(), roughness: 0.3, metalness: 0.35 })
);
vinylDisc.rotation.x = -Math.PI / 2;
vinylDisc.position.y = DISC_Y;
vinylDisc.receiveShadow = true;
platterGroup.add(vinylDisc);

const spindle = new THREE.Mesh(
  new THREE.CylinderGeometry(0.16, 0.2, 0.5, 24),
  new THREE.MeshStandardMaterial({ color: COLOR_METAL, roughness: 0.25, metalness: 0.85 })
);
spindle.position.y = 0.25;
platterGroup.add(spindle);

const towerGroup = new THREE.Group();
platterGroup.add(towerGroup);

// Tonearm — fixed to the plinth (does not spin with the platter).
const tonearmPivot = new THREE.Vector3(8.05, 0, -4.4);
const armMat = new THREE.MeshStandardMaterial({ color: COLOR_TONEARM, roughness: 0.3, metalness: 0.65 });

const pivotPost = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.9, 20), armMat);
pivotPost.position.set(tonearmPivot.x, 0.45, tonearmPivot.z);
pivotPost.castShadow = true;
scene.add(pivotPost);

const pivotCap = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.12, 20), armMat);
pivotCap.position.set(tonearmPivot.x, 0.95, tonearmPivot.z);
scene.add(pivotCap);

const tonearmGroup = new THREE.Group();
tonearmGroup.position.set(tonearmPivot.x, 0.92, tonearmPivot.z);
tonearmGroup.rotation.y = 2.36; // aims the arm in over the outer third of the record
scene.add(tonearmGroup);

const ARM_LENGTH = 4.9;
const arm = new THREE.Mesh(new THREE.BoxGeometry(ARM_LENGTH, 0.16, 0.16), armMat);
arm.position.x = ARM_LENGTH / 2;
arm.castShadow = true;
tonearmGroup.add(arm);

const headshell = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.22, 0.4), armMat);
headshell.position.x = ARM_LENGTH;
headshell.castShadow = true;
tonearmGroup.add(headshell);

const stylus = new THREE.Mesh(
  new THREE.BoxGeometry(0.08, 0.16, 0.08),
  new THREE.MeshStandardMaterial({ color: COLOR_LABEL, roughness: 0.4, metalness: 0.2 })
);
stylus.position.set(ARM_LENGTH + 0.05, -0.18, 0);
tonearmGroup.add(stylus);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let pointerInside = false;
const clock = new THREE.Clock();

function buildTowers(metric) {
  towers.forEach((t) => {
    t.mesh.geometry.dispose();
    t.mesh.material.dispose();
  });
  towerGroup.clear();
  towers = [];

  const cfg = DATASETS[metric];
  const rows = stats[cfg.key].slice(0, 10);
  const maxVal = Math.max(...rows.map((r) => r[cfg.valueKey]));
  const radius = 6;
  const maxHeight = 6.5;

  rows.forEach((row, i) => {
    const value = row[cfg.valueKey];
    const height = Math.max((value / maxVal) * maxHeight, 0.3);
    const angle = (i / rows.length) * Math.PI * 2;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;

    const geometry = new THREE.BoxGeometry(1.1, height, 1.1);
    const material = new THREE.MeshStandardMaterial({ color: COLOR_TOWER, roughness: 0.5, metalness: 0.1 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, DISC_Y + height / 2, z);
    mesh.castShadow = true;
    towerGroup.add(mesh);

    towers.push({
      mesh,
      index: i,
      artist: row.artist,
      value,
      unitLabel: value === 1 ? cfg.unit : cfg.unitPlural,
    });
  });
}

function renderLeaderboard() {
  leaderboardEl.innerHTML = "";
  towers.forEach((t) => {
    const li = document.createElement("li");
    li.className = "skyline-leaderboard__row";
    li.dataset.index = String(t.index);
    li.tabIndex = 0;

    const rank = document.createElement("span");
    rank.className = "skyline-leaderboard__rank";
    rank.textContent = String(t.index + 1);

    const name = document.createElement("span");
    name.className = "skyline-leaderboard__name";
    name.textContent = t.artist;

    const value = document.createElement("span");
    value.className = "skyline-leaderboard__value";
    value.textContent = `${fmtNumber(t.value)} ${t.unitLabel}`;

    li.append(rank, name, value);
    li.addEventListener("mouseenter", () => setHovered(t.index));
    li.addEventListener("mouseleave", () => setHovered(null));
    li.addEventListener("click", () => setPinned(pinnedIndex === t.index ? null : t.index));
    leaderboardEl.appendChild(li);
  });
}

function setHovered(index) {
  hoveredIndex = index;
  updateHighlight();
}

function setPinned(index) {
  pinnedIndex = index;
  updateHighlight();
}

function updateHighlight() {
  const activeIndex = hoveredIndex ?? pinnedIndex;
  towers.forEach((t) => {
    t.mesh.material.color.setHex(t.index === activeIndex ? COLOR_HOVER : COLOR_TOWER);
  });
  Array.from(leaderboardEl.children).forEach((li) => {
    li.classList.toggle("is-active", Number(li.dataset.index) === activeIndex);
  });
}

function onPointerMove(event) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  pointerInside = true;
}

function onPointerLeave() {
  pointerInside = false;
  if (hoveredIndex !== null) setHovered(null);
}

function onClick() {
  if (hoveredIndex !== null) {
    setPinned(pinnedIndex === hoveredIndex ? null : hoveredIndex);
  }
}

canvas.addEventListener("pointermove", onPointerMove);
canvas.addEventListener("pointerleave", onPointerLeave);
canvas.addEventListener("click", onClick);

function pickTower() {
  if (!pointerInside || towers.length === 0) return;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(towers.map((t) => t.mesh));
  if (hits.length > 0) {
    const match = towers.find((t) => t.mesh === hits[0].object);
    if (hoveredIndex !== match.index) setHovered(match.index);
  } else if (hoveredIndex !== null) {
    setHovered(null);
  }
}

function resize() {
  const width = container.clientWidth;
  const height = container.clientHeight;
  if (width === 0 || height === 0) return;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}

new ResizeObserver(resize).observe(container);

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  platterGroup.rotation.y += delta * PLATTER_SPEED;
  platterGroup.updateMatrixWorld(true);
  pickTower();
  controls.update();
  renderer.render(scene, camera);
}

toggleBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    if (btn.dataset.metric === currentMetric) return;
    currentMetric = btn.dataset.metric;
    toggleBtns.forEach((b) => b.classList.toggle("is-active", b === btn));
    hoveredIndex = null;
    pinnedIndex = null;
    buildTowers(currentMetric);
    renderLeaderboard();
  });
});

resetBtn.addEventListener("click", () => {
  camera.position.copy(DEFAULT_CAM_POS);
  controls.target.set(0, 1, 0);
});

(async function init() {
  const res = await fetch("data/report_stats.json");
  stats = await res.json();
  buildTowers(currentMetric);
  renderLeaderboard();
  resize();
  animate();
})();
