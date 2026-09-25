// "Chart Skyline" — a 3D bar chart of the top 10 artists, rendered as towers
// arranged in a circle. Colors mirror css/style.css's --series-1 (blue) and
// --series-2 (orange) tokens; kept as plain hex here since Three.js materials
// don't read CSS custom properties.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const COLOR_TOWER = 0x2a78d6;
const COLOR_HOVER = 0xeb6834;
const COLOR_BG = 0xf9f9f7;
const COLOR_FLOOR = 0xf3f2ec;
const COLOR_GRID = 0xd9d8cd;

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

const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
const DEFAULT_CAM_POS = new THREE.Vector3(0, 9, 15);
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
controls.autoRotate = true;
controls.autoRotateSpeed = 1.1;
controls.target.set(0, 1, 0);
controls.addEventListener("start", () => {
  controls.autoRotate = false;
});

scene.add(new THREE.HemisphereLight(0xffffff, 0x445066, 0.9));
const dirLight = new THREE.DirectionalLight(0xffffff, 1.1);
dirLight.position.set(6, 12, 6);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(1024, 1024);
dirLight.shadow.camera.left = -12;
dirLight.shadow.camera.right = 12;
dirLight.shadow.camera.top = 12;
dirLight.shadow.camera.bottom = -12;
scene.add(dirLight);

const floor = new THREE.Mesh(
  new THREE.CircleGeometry(9, 64),
  new THREE.MeshStandardMaterial({ color: COLOR_FLOOR, roughness: 1 })
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

scene.add(new THREE.PolarGridHelper(9, 10, 8, 64, COLOR_GRID, COLOR_GRID));

const towerGroup = new THREE.Group();
scene.add(towerGroup);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let pointerInside = false;

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
    const material = new THREE.MeshStandardMaterial({ color: COLOR_TOWER, roughness: 0.55, metalness: 0.05 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, height / 2, z);
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
  controls.autoRotate = true;
});

(async function init() {
  const res = await fetch("data/report_stats.json");
  stats = await res.json();
  buildTowers(currentMetric);
  renderLeaderboard();
  resize();
  animate();
})();
