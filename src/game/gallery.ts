import * as THREE from 'three';
import { PETS } from '../data/pets';
import { RARITY_COLOR } from '../data/balance';
import { animatePet, buildPet, disposeModel } from './petModels';
import { meshCount, triangleCount } from './petKit';

/**
 * QA/dev-only pet gallery (`?gallery` in dev or `--mode qa` builds). Not shipped in
 * production builds: main.ts only imports it behind the DEBUG constant.
 */
export function startGallery(): void {
  document.getElementById('boot')?.remove();
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#9ccfe6');
  scene.add(new THREE.HemisphereLight('#ffffff', '#5d8a4a', 1.6));
  const sun = new THREE.DirectionalLight('#fff4dd', 1.7);
  sun.position.set(4, 8, 6);
  scene.add(sun);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(40, 48), new THREE.MeshLambertMaterial({ color: '#7cc36a' }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const cols = 6;
  const gap = 1.25;
  const pets = PETS.map((def, i) => {
    const g = buildPet(def.id);
    g.userData.phase = i * 0.37;
    const x = ((i % cols) - (cols - 1) / 2) * gap;
    const z = (Math.floor(i / cols) - 1) * gap * 1.15;
    g.position.set(x, 0, z);
    scene.add(g);
    return { def, g, home: new THREE.Vector3(x, 0, z), tris: triangleCount(g), meshes: meshCount(g) };
  });

  const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 200);
  const view = { yaw: 0, pitch: 0.32, dist: 9.5, focus: -1, walk: false, paused: false, time: 0, solo: false, blink: true };
  const target = new THREE.Vector3();

  const ui = document.createElement('div');
  ui.style.cssText = 'position:fixed;inset:0;pointer-events:none;font:12px system-ui,sans-serif;color:#fff';
  document.body.appendChild(ui);
  const labels = pets.map((p) => {
    const d = document.createElement('div');
    d.style.cssText = `position:absolute;transform:translate(-50%,0);padding:2px 6px;border-radius:6px;background:rgba(10,20,40,.72);border:1px solid ${RARITY_COLOR[p.def.rarity]};white-space:nowrap;pointer-events:auto;cursor:pointer`;
    d.textContent = `${p.def.name} · ${p.tris}△`;
    d.onclick = () => focus(pets.indexOf(p));
    ui.appendChild(d);
    return d;
  });
  const bar = document.createElement('div');
  bar.style.cssText = 'position:fixed;left:8px;top:8px;display:flex;flex-wrap:wrap;gap:4px;pointer-events:auto;max-width:calc(100vw - 16px)';
  ui.appendChild(bar);
  const stats = document.createElement('div');
  stats.style.cssText = 'position:fixed;left:8px;bottom:8px;background:rgba(10,20,40,.72);padding:4px 8px;border-radius:6px';
  ui.appendChild(stats);
  const btn = (label: string, fn: () => void) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = 'font:12px system-ui;padding:4px 8px;border-radius:6px;border:0;background:#24456b;color:#fff;cursor:pointer';
    b.onclick = fn;
    bar.appendChild(b);
  };
  btn('All', () => focus(-1));
  btn('Front', () => (view.yaw = 0));
  btn('3/4', () => (view.yaw = 0.7));
  btn('Side', () => (view.yaw = Math.PI / 2));
  btn('Back', () => (view.yaw = Math.PI));
  btn('Top', () => (view.pitch = 1.2));
  btn('Gameplay dist', () => {
    view.pitch = 0.42;
    view.dist = 6.5;
  });
  btn('Solo', () => (view.solo = !view.solo));
  btn('Idle/Walk', () => (view.walk = !view.walk));
  btn('Pause', () => (view.paused = !view.paused));
  btn('◀', () => focus((view.focus + pets.length - 1) % pets.length));
  btn('▶', () => focus((view.focus + 1) % pets.length));

  function focus(i: number): void {
    view.focus = i;
    view.dist = i < 0 ? 9.5 : 1.9;
    view.pitch = i < 0 ? 0.32 : 0.15;
  }

  let drag: { x: number; y: number } | null = null;
  canvas.addEventListener('pointerdown', (e) => (drag = { x: e.clientX, y: e.clientY }));
  addEventListener('pointerup', () => (drag = null));
  addEventListener('pointermove', (e) => {
    if (!drag) return;
    view.yaw -= (e.clientX - drag.x) * 0.008;
    view.pitch = Math.max(-0.3, Math.min(1.45, view.pitch + (e.clientY - drag.y) * 0.006));
    drag = { x: e.clientX, y: e.clientY };
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    view.dist = Math.max(0.6, Math.min(30, view.dist * Math.exp(e.deltaY * 0.001)));
  }, { passive: false });

  // Scripting hook for screenshot automation.
  (window as unknown as { __gallery: unknown }).__gallery = {
    set: (o: Partial<typeof view>) => Object.assign(view, o),
    focus,
    stats: () => pets.map((p) => ({ id: p.def.id, tris: p.tris, meshes: p.meshes })),
    rebuild: () => {
      for (const p of pets) {
        scene.remove(p.g);
        disposeModel(p.g);
        p.g = buildPet(p.def.id);
        p.g.position.copy(p.home);
        scene.add(p.g);
      }
    },
  };

  const v = new THREE.Vector3();
  let last = performance.now();
  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!view.paused) view.time += dt;
    const w = innerWidth, h = innerHeight;
    if (canvas.width !== Math.floor(w * renderer.getPixelRatio())) renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    for (const [i, p] of pets.entries()) {
      p.g.visible = !view.solo || view.focus < 0 || view.focus === i;
      const flies = !!p.g.userData.flies;
      p.g.position.set(p.home.x, flies ? 0.55 : 0, p.home.z);
      p.g.userData.noBlink = !view.blink;
      animatePet(p.g, view.time, view.walk ? 0.7 : 0, false, dt);
    }
    if (view.focus >= 0) target.copy(pets[view.focus].g.position).add(v.set(0, 0.3, 0));
    else target.set(0, 0.3, 0);
    camera.position.set(
      target.x + Math.sin(view.yaw) * Math.cos(view.pitch) * view.dist,
      target.y + Math.sin(view.pitch) * view.dist,
      target.z + Math.cos(view.yaw) * Math.cos(view.pitch) * view.dist,
    );
    camera.lookAt(target);
    renderer.render(scene, camera);
    pets.forEach((p, i) => {
      v.copy(p.g.position);
      v.y -= 0.05;
      v.project(camera);
      const vis = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1 && (view.focus < 0 || view.focus === i);
      labels[i].style.display = vis ? '' : 'none';
      labels[i].style.left = `${((v.x + 1) / 2) * w}px`;
      labels[i].style.top = `${((1 - v.y) / 2) * h}px`;
    });
    const total = pets.reduce((a, p) => a + p.tris, 0);
    stats.textContent = `draw calls ${renderer.info.render.calls} · tris ${renderer.info.render.triangles} · pets total ${total}△ · avg ${Math.round(total / pets.length)}△/pet · ${view.walk ? 'walk' : 'idle'}`;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
