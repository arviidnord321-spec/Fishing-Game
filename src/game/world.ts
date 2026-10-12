import * as THREE from 'three';
import { LANDMARKS, POOLS } from '../data/balance';
import type { PoolId } from '../data/types';
import { createRng } from '../logic/rng';
import { blobShadow, flat, PALETTE, signTexture } from './materials';
import { bakeStatic } from './bake';
import { createSkyMaterial, createWaterMaterial, type WaterMaterial } from './water';

export type Collider =
  | { kind: 'circle'; x: number; z: number; r: number; h: number; tag?: string; active?: boolean }
  | { kind: 'box'; minX: number; maxX: number; minZ: number; maxZ: number; h: number; tag?: string };

export interface PoolView {
  id: PoolId;
  x: number;
  z: number;
  radius: number;
  group: THREE.Group;
  water: THREE.Mesh;
  wall: THREE.Mesh;
  rim: THREE.Mesh;
  mat: WaterMaterial;
  collider: Extract<Collider, { kind: 'circle' }>;
  /** Water surface height. */
  surfaceY: number;
}

export interface Anchor {
  id: string;
  pos: THREE.Vector3;
}

/** Walkable ellipse half-axes; the visual island edge sits a little outside this. */
export const WALK_A = 29.5;
export const WALK_B = 23.5;

const PATHS: [number, number][][] = [
  [[0, 15], [0, 9.5], [-4, 8.5], [-8, 6.2]],
  [[0, 9.5], [4, 8.5], [8, 6.2]],
  [[0, 9.5], [6, 12.5]],
  [[-8, 6.2], [-11, 2], [-14, -2]],
  [[8, 6.2], [11, 1], [14, -3]],
  [[-4, 0.5], [0, -2.5], [4, 0.5]],
  [[0, -2.5], [0, -4.5]],
];

export class World {
  readonly scene = new THREE.Scene();
  readonly colliders: Collider[] = [];
  readonly pools = new Map<PoolId, PoolView>();
  readonly anchors: Anchor[] = [];
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  private skyMat = createSkyMaterial();
  private island!: THREE.Mesh;
  private stars!: THREE.Points;
  private bulbMat = new THREE.MeshBasicMaterial({ color: '#fff6dc' });
  /** Static props collected here and merged into a few meshes after building. */
  private staticRoot = new THREE.Group();
  private lampGlowMat = new THREE.MeshBasicMaterial({ color: PALETTE.lamp, transparent: true, opacity: 0, depthWrite: false });
  private riftRocks: THREE.Mesh[] = [];
  private riftRockBase: THREE.Vector3[] = [];
  private riftStones: THREE.InstancedMesh | null = null;
  private riftRockCollider!: Extract<Collider, { kind: 'circle' }>;
  private riftBeacon!: THREE.Mesh;
  readonly plinthDisplay = new THREE.Group();
  readonly beacon: THREE.Group;
  private sea!: THREE.Mesh;
  private seaMat!: THREE.MeshLambertMaterial;
  private meadowRadius = 3.2;
  private time = 0;

  constructor() {
    this.scene.background = null;
    const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 24, 12), this.skyMat);
    sky.renderOrder = -10;
    this.scene.add(sky);

    this.hemi = new THREE.HemisphereLight('#e8fbff', '#5d8a4f', 1.6);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff3dc', 2.2);
    this.sun.position.set(-20, 40, 18);
    this.scene.add(this.sun);
    this.scene.fog = new THREE.Fog('#bfeef8', 70, 190);

    this.buildSea();
    this.buildIsland();
    for (const p of POOLS) this.buildPool(p.id, p.x, p.z, p.radius);
    this.buildPaths();
    this.buildStand();
    this.buildWorkshop();
    this.buildPlinth();
    this.buildRiftClearing();
    this.buildDecor();
    this.buildLamps();
    this.buildStars();
    this.beacon = this.buildBeacon();
    bakeStatic(this.staticRoot, this.scene);
  }

  // ---------------------------------------------------------------- terrain
  private islandShape(): THREE.Shape {
    const shape = new THREE.Shape();
    const n = 72;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const wob = 1.06 + 0.035 * Math.sin(a * 5 + 0.7) + 0.025 * Math.sin(a * 9 + 2.1);
      const x = Math.cos(a) * WALK_A * wob;
      const z = Math.sin(a) * WALK_B * wob;
      if (i === 0) shape.moveTo(x, -z);
      else shape.lineTo(x, -z);
    }
    for (const p of POOLS) {
      if (p.id === 'rift') continue;
      const r = p.id === 'meadow' ? this.meadowRadius : p.radius;
      const hole = new THREE.Path();
      hole.absarc(p.x, -p.z, r, 0, Math.PI * 2, true);
      shape.holes.push(hole);
    }
    return shape;
  }

  private buildIsland(): void {
    if (this.island) {
      this.island.geometry.dispose();
      this.scene.remove(this.island);
    }
    const geo = new THREE.ExtrudeGeometry(this.islandShape(), {
      depth: 3,
      bevelEnabled: true,
      bevelThickness: 0.35,
      bevelSize: 0.5,
      bevelSegments: 1,
      curveSegments: 40,
    });
    geo.rotateX(-Math.PI / 2);
    geo.computeBoundingBox();
    geo.translate(0, -geo.boundingBox!.max.y, 0);
    this.island = new THREE.Mesh(geo, [flat(PALETTE.grass), flat(PALETTE.sand)]);
    this.scene.add(this.island);
  }

  private buildSea(): void {
    this.seaMat = new THREE.MeshLambertMaterial({ color: '#2fb5d6' });
    this.sea = new THREE.Mesh(new THREE.CircleGeometry(380, 48).rotateX(-Math.PI / 2), this.seaMat);
    this.sea.position.y = -1.6;
    this.scene.add(this.sea);
  }

  private buildPaths(): void {
    const mat = new THREE.MeshLambertMaterial({ color: PALETTE.sand, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1 });
    const width = 2.8;
    for (const path of PATHS) {
      const pts = path.map(([x, z]) => new THREE.Vector3(x, 0, z));
      const curve = new THREE.CatmullRomCurve3(pts);
      const samples = curve.getSpacedPoints(Math.max(8, Math.round(curve.getLength() * 1.5)));
      const pos: number[] = [];
      const idx: number[] = [];
      for (let i = 0; i < samples.length; i++) {
        const a = samples[Math.max(0, i - 1)];
        const b = samples[Math.min(samples.length - 1, i + 1)];
        const dir = new THREE.Vector3().subVectors(b, a).normalize();
        const side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(width / 2);
        const p = samples[i];
        pos.push(p.x + side.x, 0.015, p.z + side.z, p.x - side.x, 0.015, p.z - side.z);
        if (i > 0) {
          const k = i * 2;
          idx.push(k - 2, k - 1, k, k - 1, k + 1, k);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, mat);
      m.renderOrder = 0;
      this.scene.add(m);
      // round caps
      for (const end of [samples[0], samples[samples.length - 1]]) {
        const cap = new THREE.Mesh(new THREE.CircleGeometry(width / 2, 16).rotateX(-Math.PI / 2), mat);
        cap.position.set(end.x, 0.014, end.z);
        this.scene.add(cap);
      }
    }
  }

  // ---------------------------------------------------------------- pools
  private buildPool(id: PoolId, x: number, z: number, radius: number): void {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    const isRift = id === 'rift';
    const mat = createWaterMaterial();
    if (isRift) mat.uniforms.uGlow.value = 1;
    const water = new THREE.Mesh(new THREE.CircleGeometry(1, 56).rotateX(-Math.PI / 2), mat);
    const surfaceY = isRift ? 0.06 : -0.22;
    water.position.y = surfaceY;
    group.add(water);
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1.4, 48, 1, true), flat('#1b6f8c'));
    (wall.material as THREE.Material).side = THREE.BackSide;
    wall.position.y = -0.7;
    wall.visible = !isRift;
    group.add(wall);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.2, 5, 56), flat(isRift ? '#8d7bb5' : PALETTE.stone));
    rim.rotation.x = Math.PI / 2;
    rim.scale.z = 0.7;
    rim.position.y = 0.04;
    group.add(rim);
    this.scene.add(group);
    const collider: PoolView['collider'] = { kind: 'circle', x, z, r: radius + 0.3, h: 0.3, tag: `pool:${id}`, active: !isRift };
    this.colliders.push(collider);
    const view: PoolView = { id, x, z, radius, group, water, wall, rim, mat, collider, surfaceY };
    this.pools.set(id, view);
    this.applyPoolRadius(view, radius);
    this.anchors.push({ id: `pool:${id}`, pos: new THREE.Vector3(x, 2.4, z - radius - 0.6) });
    if (!isRift) this.buildPoolSign(id, x, z, radius);
  }

  private applyPoolRadius(v: PoolView, r: number): void {
    v.radius = r;
    v.water.scale.set(r, 1, r);
    v.wall.scale.set(r, 1, r);
    // Torus tube scales with xy; compensate so the rim stays the same thickness.
    v.rim.scale.set(r + 0.12, r + 0.12, 0.7);
    v.rim.geometry.dispose();
    v.rim.geometry = new THREE.TorusGeometry(1, 0.2 / (r + 0.12), 5, 56);
    v.collider.r = r + 0.3;
  }

  private buildPoolSign(id: PoolId, x: number, z: number, r: number): void {
    // A sign post on the side facing the island center.
    const dir = new THREE.Vector2(-x, 12 - z).normalize();
    const angle = id === 'meadow' ? Math.PI * 0.82 : Math.atan2(dir.y, dir.x) + 0.6;
    const sx = x + Math.cos(angle) * (r + 2.4);
    const sz = z + Math.sin(angle) * (r + 2.4);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.6, 6), flat(PALETTE.woodDark));
    post.position.set(sx, 0.8, sz);
    this.staticRoot.add(post);
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.55, 0.1), flat(PALETTE.wood));
    board.position.set(sx, 1.55, sz);
    board.lookAt(x, 1.55, z);
    board.rotateY(Math.PI);
    this.staticRoot.add(board);
    this.colliders.push({ kind: 'circle', x: sx, z: sz, r: 0.2, h: 1.8 });
    this.anchors.push({ id: `sign:${id}`, pos: new THREE.Vector3(sx, 2.2, sz) });
  }

  setMeadowRadius(r: number): void {
    if (Math.abs(r - this.meadowRadius) < 1e-4) return;
    this.meadowRadius = r;
    const v = this.pools.get('meadow')!;
    this.applyPoolRadius(v, r);
    this.buildIsland();
    const a = this.anchors.find((x) => x.id === 'pool:meadow');
    if (a) a.pos.set(v.x, 2.4, v.z - r - 0.6);
  }

  setPoolLocked(id: PoolId, locked: boolean): void {
    const v = this.pools.get(id);
    if (v) v.mat.uniforms.uDim.value = locked ? 1 : 0;
  }

  // ---------------------------------------------------------------- buildings
  private addBox(w: number, h: number, d: number, color: string, x: number, y: number, z: number, parent: THREE.Object3D = this.scene): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), flat(color));
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }

  private sign(text: string, bg: string, fg: string, w: number, h: number): THREE.Mesh {
    const tex = signTexture(text, bg, fg);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
    return m;
  }

  private buildStand(): void {
    const { x, z } = LANDMARKS.stand;
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = Math.PI * 0.18;
    this.addBox(3.2, 1.1, 1.3, '#3f8fd1', 0, 0.55, 0, g);
    this.addBox(3.4, 0.12, 1.5, '#f6f1e3', 0, 1.16, 0, g);
    for (const px of [-1.5, 1.5]) this.addBox(0.15, 2.6, 0.15, PALETTE.woodDark, px, 1.3, -0.55, g);
    // striped awning
    for (let i = 0; i < 6; i++) {
      const s = this.addBox(0.58, 0.08, 1.9, i % 2 ? '#ffffff' : '#ff6b6b', -1.45 + i * 0.58, 2.65, 0.1, g);
      s.rotation.x = -0.25;
    }
    // crate of fish
    this.addBox(0.9, 0.5, 0.7, PALETTE.wood, 1.0, 1.45, 0.05, g);
    for (let i = 0; i < 3; i++) {
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 4), flat(['#7f9bb0', '#f2b54a', '#ff8fab'][i]));
      f.scale.set(1.6, 0.8, 0.8);
      f.position.set(0.75 + i * 0.25, 1.75, 0.05);
      g.add(f);
    }
    const sign = this.sign('FISH STAND', '#152B43', '#ffe9a8', 2.4, 0.6);
    sign.position.set(0, 3.25, 0.15);
    g.add(sign);
    const back = sign.clone();
    back.rotation.y = Math.PI;
    back.position.z = 0.13;
    g.add(back);
    g.add(blobShadow(4.4));
    this.staticRoot.add(g);
    this.colliders.push({ kind: 'circle', x, z, r: 1.7, h: 3.2, tag: 'stand' });
    this.anchors.push({ id: 'stand', pos: new THREE.Vector3(x, 3.9, z) });
  }

  private buildWorkshop(): void {
    const { x, z } = LANDMARKS.workshop;
    const g = new THREE.Group();
    g.position.set(x + 0.6, 0, z + 0.4);
    g.rotation.y = -Math.PI * 0.2;
    this.addBox(3.2, 2.2, 2.6, '#f3e3c3', 0, 1.1, 0, g);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.6, 1.5, 4), flat('#d9644a'));
    roof.rotation.y = Math.PI / 4;
    roof.scale.set(1.25, 1, 1);
    roof.position.y = 2.95;
    g.add(roof);
    this.addBox(0.9, 1.5, 0.08, PALETTE.woodDark, 0, 0.75, 1.32, g);
    this.addBox(0.7, 0.6, 0.08, '#8fe3f2', -1.0, 1.35, 1.32, g);
    // rod rack
    for (let i = 0; i < 4; i++) {
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 2.1, 5), flat(['#8a5a33', '#4fc6d8', '#c87b3e', '#5160c9'][i]));
      rod.position.set(1.0 + i * 0.18, 1.05, 1.45);
      rod.rotation.z = 0.12;
      g.add(rod);
    }
    const sign = this.sign('WORKSHOP', '#152B43', '#8ff3ff', 2.2, 0.55);
    sign.position.set(0, 2.45, 1.34);
    g.add(sign);
    g.add(blobShadow(4.6));
    this.staticRoot.add(g);
    this.colliders.push({ kind: 'circle', x: x + 0.6, z: z + 0.4, r: 1.95, h: 3.6, tag: 'workshop' });
    this.anchors.push({ id: 'workshop', pos: new THREE.Vector3(x + 0.6, 4.3, z + 0.4) });
  }

  private buildPlinth(): void {
    const { x, z } = LANDMARKS.plinth;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 0.9, 8), flat(PALETTE.stone));
    base.position.set(x, 0.45, z);
    this.staticRoot.add(base);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 0.9, 0.15, 8), flat('#ffd76e'));
    top.position.set(x, 0.97, z);
    this.staticRoot.add(top);
    this.plinthDisplay.position.set(x, 1.9, z);
    this.scene.add(this.plinthDisplay);
    this.colliders.push({ kind: 'circle', x, z, r: 1.15, h: 1.2, tag: 'plinth' });
    this.anchors.push({ id: 'plinth', pos: new THREE.Vector3(x, 3.4, z) });
  }

  private buildRiftClearing(): void {
    const p = POOLS.find((q) => q.id === 'rift')!;
    // ring of standing stones
    const stoneGeo = new THREE.DodecahedronGeometry(0.55, 0);
    const n = 14;
    this.riftStones = new THREE.InstancedMesh(stoneGeo, flat('#a59bc2'), n);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = p.radius + 2.6;
      if (Math.abs(Math.sin(a) - 1) < 0.15) continue; // keep the north approach open
      m4.compose(
        new THREE.Vector3(p.x + Math.cos(a) * r, 0.45, p.z + Math.sin(a) * r),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0.2 * i, a, 0.1)),
        new THREE.Vector3(1, 1.6 + (i % 3) * 0.3, 1),
      );
      this.riftStones.setMatrixAt(i, m4);
      this.colliders.push({ kind: 'circle', x: p.x + Math.cos(a) * r, z: p.z + Math.sin(a) * r, r: 0.6, h: 1.5 });
    }
    this.scene.add(this.riftStones);
    // central rocks that levitate when the bloom opens
    const rng = createRng(77);
    for (let i = 0; i < 7; i++) {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.6 + rng.next() * 0.7, 0), flat(i % 2 ? PALETTE.stone : PALETTE.stoneDark));
      const a = rng.next() * Math.PI * 2;
      const d = rng.next() * 1.6;
      rock.position.set(p.x + Math.cos(a) * d, 0.4, p.z + Math.sin(a) * d);
      rock.rotation.set(rng.next() * 3, rng.next() * 3, 0);
      this.riftRocks.push(rock);
      this.riftRockBase.push(rock.position.clone());
      this.scene.add(rock);
    }
    this.riftRockCollider = { kind: 'circle', x: p.x, z: p.z, r: 2.2, h: 1.4, active: true };
    this.colliders.push(this.riftRockCollider);
    this.riftBeacon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.6, 1.4, 30, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: '#ff8be0', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.riftBeacon.position.set(p.x, 15, p.z);
    this.scene.add(this.riftBeacon);
  }

  private buildBeacon(): THREE.Group {
    const g = new THREE.Group();
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.7, 4), new THREE.MeshBasicMaterial({ color: '#ffc94d' }));
    arrow.rotation.x = Math.PI;
    g.add(arrow);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.95, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffc94d', transparent: true, opacity: 0.7, depthWrite: false }));
    ring.name = 'ring';
    g.add(ring);
    g.visible = false;
    this.scene.add(g);
    return g;
  }

  private nearReserved(x: number, z: number, pad: number): boolean {
    for (const p of POOLS) {
      const r = p.id === 'meadow' ? 4.6 : p.radius;
      if (Math.hypot(x - p.x, z - p.z) < r + (p.id === 'rift' ? 4 : 2.6) + pad) return true;
    }
    for (const l of Object.values(LANDMARKS)) if (Math.hypot(x - l.x, z - l.z) < 3.6 + pad) return true;
    if (Math.hypot(x, z - 13) < 4 + pad) return true;
    for (const path of PATHS) {
      for (let i = 0; i < path.length - 1; i++) {
        if (distToSeg(x, z, path[i][0], path[i][1], path[i + 1][0], path[i + 1][1]) < 2.2 + pad) return true;
      }
    }
    return false;
  }

  private buildDecor(): void {
    const rng = createRng(1234);
    const trunkGeo = new THREE.CylinderGeometry(0.16, 0.24, 1.2, 6);
    const canopyGeo = new THREE.IcosahedronGeometry(1, 0);
    const coneGeo = new THREE.ConeGeometry(1, 2.2, 6);
    const rockGeo = new THREE.DodecahedronGeometry(0.6, 0);
    const bushGeo = new THREE.IcosahedronGeometry(0.6, 0);
    const flowerGeo = new THREE.OctahedronGeometry(0.12, 0);
    const trees: THREE.Matrix4[] = [];
    const pines: THREE.Matrix4[] = [];
    const trunks: THREE.Matrix4[] = [];
    const rocks: THREE.Matrix4[] = [];
    const bushes: THREE.Matrix4[] = [];
    const flowers: { m: THREE.Matrix4; c: THREE.Color }[] = [];
    const shadows: [number, number, number][] = [];
    const tmp = new THREE.Object3D();
    const place = (tries: number, pad: number, edgeBias: boolean, fn: (x: number, z: number) => void) => {
      for (let i = 0; i < tries; i++) {
        const a = rng.next() * Math.PI * 2;
        const rr = edgeBias ? 0.78 + rng.next() * 0.2 : Math.sqrt(rng.next()) * 0.95;
        const x = Math.cos(a) * WALK_A * rr;
        const z = Math.sin(a) * WALK_B * rr;
        if (this.nearReserved(x, z, pad)) continue;
        fn(x, z);
      }
    };
    place(70, 0.8, true, (x, z) => {
      const s = 0.9 + rng.next() * 0.7;
      const pine = rng.next() < 0.4;
      tmp.position.set(x, 0.6 * s, z);
      tmp.rotation.set(0, rng.next() * 6, 0);
      tmp.scale.setScalar(s);
      tmp.updateMatrix();
      trunks.push(tmp.matrix.clone());
      tmp.position.y = pine ? 2.2 * s : 2.0 * s;
      tmp.scale.set(s * 1.2, s * (pine ? 1 : 1.1), s * 1.2);
      tmp.updateMatrix();
      (pine ? pines : trees).push(tmp.matrix.clone());
      shadows.push([x, z, 2.6 * s]);
      this.colliders.push({ kind: 'circle', x, z, r: 0.45 * s, h: 3.5 });
    });
    place(28, 0.4, false, (x, z) => {
      const s = 0.6 + rng.next() * 0.9;
      tmp.position.set(x, 0.25 * s, z);
      tmp.rotation.set(rng.next() * 3, rng.next() * 3, rng.next() * 3);
      tmp.scale.set(s * 1.2, s * 0.8, s);
      tmp.updateMatrix();
      rocks.push(tmp.matrix.clone());
      if (s > 0.9) this.colliders.push({ kind: 'circle', x, z, r: 0.6 * s, h: 0.8 });
    });
    place(40, 0.2, false, (x, z) => {
      const s = 0.6 + rng.next() * 0.6;
      tmp.position.set(x, 0.35 * s, z);
      tmp.rotation.set(0, rng.next() * 3, 0);
      tmp.scale.set(s * 1.3, s, s * 1.3);
      tmp.updateMatrix();
      bushes.push(tmp.matrix.clone());
    });
    const flowerColors = ['#ffffff', '#ffd1e8', '#fff08a', '#c9b8ff', '#ff9e7a'];
    place(160, -1.2, false, (x, z) => {
      tmp.position.set(x, 0.12, z);
      tmp.rotation.set(0, rng.next() * 3, 0);
      tmp.scale.setScalar(0.8 + rng.next() * 0.6);
      tmp.updateMatrix();
      flowers.push({ m: tmp.matrix.clone(), c: new THREE.Color(flowerColors[rng.int(flowerColors.length)]) });
    });
    const inst = (geo: THREE.BufferGeometry, mat: THREE.Material, list: THREE.Matrix4[]) => {
      const im = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
      list.forEach((m, i) => im.setMatrixAt(i, m));
      im.count = list.length;
      this.scene.add(im);
      return im;
    };
    inst(trunkGeo, flat(PALETTE.wood), trunks);
    inst(canopyGeo, flat('#3fae5b'), trees);
    inst(coneGeo, flat('#2f8f58'), pines);
    inst(rockGeo, flat(PALETTE.stone), rocks);
    inst(bushGeo, flat('#4fbf5f'), bushes);
    const fl = new THREE.InstancedMesh(flowerGeo, new THREE.MeshLambertMaterial({ flatShading: true }), flowers.length);
    flowers.forEach((f, i) => {
      fl.setMatrixAt(i, f.m);
      fl.setColorAt(i, f.c);
    });
    this.scene.add(fl);
    // tree contact shadows, instanced
    const sh = blobShadow(1);
    const shadowInst = new THREE.InstancedMesh(sh.geometry, sh.material, shadows.length);
    shadows.forEach(([x, z, s], i) => {
      tmp.position.set(x, 0.02, z);
      tmp.rotation.set(0, 0, 0);
      tmp.scale.set(s, 1, s);
      tmp.updateMatrix();
      shadowInst.setMatrixAt(i, tmp.matrix);
    });
    shadowInst.renderOrder = 1;
    this.scene.add(shadowInst);

    // fences along the north edge behind the start area and beside the stand/workshop
    const fenceRuns: [number, number, number, number][] = [
      [-13, 17.5, 13, 17.5],
      [-13, 17.5, -13, 12],
      [13, 17.5, 13, 12],
    ];
    const posts: THREE.Matrix4[] = [];
    const rails: THREE.Matrix4[] = [];
    for (const [x1, z1, x2, z2] of fenceRuns) {
      const len = Math.hypot(x2 - x1, z2 - z1);
      const n = Math.round(len / 1.6);
      const ang = Math.atan2(z2 - z1, x2 - x1);
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        tmp.position.set(x1 + (x2 - x1) * t, 0.45, z1 + (z2 - z1) * t);
        tmp.rotation.set(0, -ang, 0);
        tmp.scale.set(1, 1, 1);
        tmp.updateMatrix();
        posts.push(tmp.matrix.clone());
        if (i < n) {
          for (const y of [0.35, 0.7]) {
            tmp.position.set(x1 + (x2 - x1) * (t + 0.5 / n), y, z1 + (z2 - z1) * (t + 0.5 / n));
            tmp.scale.set(len / n, 1, 1);
            tmp.updateMatrix();
            rails.push(tmp.matrix.clone());
          }
        }
      }
      // fence collider as thin boxes
      this.colliders.push({ kind: 'box', minX: Math.min(x1, x2) - 0.12, maxX: Math.max(x1, x2) + 0.12, minZ: Math.min(z1, z2) - 0.12, maxZ: Math.max(z1, z2) + 0.12, h: 0.9 });
    }
    inst(new THREE.BoxGeometry(0.16, 0.9, 0.16), flat(PALETTE.woodDark), posts);
    inst(new THREE.BoxGeometry(1, 0.1, 0.08), flat(PALETTE.wood), rails);
  }

  private buildLamps(): void {
    const spots: [number, number][] = [
      [-5.5, 1.5], [5.5, 1.5], [-11.5, 4.5], [11.5, 3.5], [-3.2, -3.6], [3.2, -3.6], [-13, -1], [14.5, -2], [-2.6, 16], [2.6, 16],
    ];
    const postGeo = new THREE.CylinderGeometry(0.07, 0.09, 2.4, 6);
    const bulbGeo = new THREE.SphereGeometry(0.22, 8, 6);
    const glowGeo = new THREE.SphereGeometry(0.6, 10, 8);
    for (const [x, z] of spots) {
      const post = new THREE.Mesh(postGeo, flat('#3b3f55'));
      post.position.set(x, 1.2, z);
      this.staticRoot.add(post);
      const bulb = new THREE.Mesh(bulbGeo, this.bulbMat);
      bulb.position.set(x, 2.5, z);
      this.staticRoot.add(bulb);
      const glow = new THREE.Mesh(glowGeo, this.lampGlowMat);
      glow.position.copy(bulb.position);
      this.staticRoot.add(glow);
      this.colliders.push({ kind: 'circle', x, z, r: 0.15, h: 2.5 });
    }
  }

  private buildStars(): void {
    const rng = createRng(9);
    const pos: number[] = [];
    for (let i = 0; i < 500; i++) {
      const a = rng.next() * Math.PI * 2;
      const y = 0.15 + rng.next() * 0.85;
      const r = Math.sqrt(1 - y * y);
      pos.push(Math.cos(a) * r * 350, y * 350, Math.sin(a) * r * 350);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.stars = new THREE.Points(g, new THREE.PointsMaterial({ color: '#ffffff', size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    this.scene.add(this.stars);
  }

  // ---------------------------------------------------------------- per-frame
  update(dt: number, nightBlend: number, riftOpenness: number, riftNotice: boolean): void {
    this.time += dt;
    const n = nightBlend;
    const u = this.skyMat.uniforms;
    (u.uTop.value as THREE.Color).copy(PALETTE.daySky).lerp(PALETTE.nightSky, n);
    (u.uHorizon.value as THREE.Color).copy(PALETTE.dayHorizon).lerp(PALETTE.nightHorizon, n);
    (this.scene.fog as THREE.Fog).color.copy(PALETTE.dayHorizon).lerp(PALETTE.nightHorizon, n);
    // keep night navigable: soft moonlight rather than darkness
    this.sun.intensity = 2.2 - 1.45 * n;
    this.sun.color.set('#fff3dc').lerp(new THREE.Color('#9fb4ff'), n);
    this.hemi.intensity = 1.6 - 0.55 * n;
    this.hemi.color.set('#e8fbff').lerp(new THREE.Color('#8a92e6'), n);
    this.hemi.groundColor.set('#5d8a4f').lerp(new THREE.Color('#3b3d75'), n);
    this.seaMat.color.set('#2fb5d6').lerp(new THREE.Color('#1d3f80'), n);
    (this.stars.material as THREE.PointsMaterial).opacity = n * 0.9;
    this.lampGlowMat.opacity = 0.05 + 0.3 * n;
    this.bulbMat.color.set(n > 0.3 ? PALETTE.lamp : '#fff6dc');

    for (const p of this.pools.values()) {
      p.mat.uniforms.uTime.value = this.time;
      p.mat.uniforms.uNight.value = n;
      for (const r of [p.mat.uniforms.uRipple0.value, p.mat.uniforms.uRipple1.value]) {
        if (r.w > 0) {
          r.z += dt;
          if (r.z > 1.5) r.w = 0;
        }
      }
    }

    // Rift: rocks lift and fade, portal grows.
    const rift = this.pools.get('rift')!;
    const o = riftOpenness;
    rift.group.visible = o > 0.001;
    const s = Math.max(0.001, o);
    rift.group.scale.set(s, 1, s);
    rift.mat.uniforms.uGlow.value = 0.6 + 0.4 * Math.sin(this.time * 2);
    this.riftRocks.forEach((rock, i) => {
      const base = this.riftRockBase[i];
      rock.position.set(base.x, base.y + o * (3 + i * 0.5) + Math.sin(this.time * 2 + i) * 0.15 * o, base.z);
      rock.rotation.y += dt * o * (0.5 + i * 0.1);
      rock.visible = o < 0.999;
      rock.scale.setScalar(1 - o * 0.6);
    });
    this.riftRockCollider.active = o < 0.05;
    (this.riftBeacon.material as THREE.MeshBasicMaterial).opacity = riftNotice ? 0.18 + 0.1 * Math.sin(this.time * 4) : o > 0 ? 0.1 * o : 0;

    if (this.beacon.visible) {
      const arrow = this.beacon.children[0];
      arrow.position.y = 2.6 + Math.sin(this.time * 4) * 0.2;
      this.beacon.children[1].scale.setScalar(1 + 0.15 * Math.sin(this.time * 3));
    }
    this.plinthDisplay.rotation.y += dt * 0.6;
  }

  /** Splash rings on a pool's water surface at a world point. */
  ripple(pool: PoolId, wx: number, wz: number, strength = 1): void {
    const p = this.pools.get(pool);
    if (!p) return;
    const scale = pool === 'rift' ? p.radius * Math.max(0.001, p.group.scale.x) : p.radius;
    // CircleGeometry UVs map [-r, r] to [0, 1]; the disc was rotated so world -z maps to +v.
    const u = 0.5 + (wx - p.x) / (2 * scale);
    const v = 0.5 - (wz - p.z) / (2 * scale);
    const a = p.mat.uniforms.uRipple0.value;
    const b = p.mat.uniforms.uRipple1.value;
    const slot = a.w <= 0 || (b.w > 0 && a.z > b.z) ? a : b;
    slot.set(u, v, 0, strength);
  }

  // ---------------------------------------------------------------- collision
  activeColliders(): Collider[] {
    return this.colliders.filter((c) => c.kind === 'box' || c.active !== false);
  }

  /** Pushes a circle at (x, z) out of all colliders and keeps it on the island. */
  resolve(pos: THREE.Vector3, radius: number): void {
    for (let iter = 0; iter < 3; iter++) {
      for (const c of this.colliders) {
        if (c.kind === 'circle') {
          if (c.active === false) continue;
          const dx = pos.x - c.x;
          const dz = pos.z - c.z;
          const d = Math.hypot(dx, dz);
          const min = c.r + radius;
          if (d < min) {
            const k = d > 1e-5 ? (min - d) / d : 0;
            if (d <= 1e-5) pos.x += min;
            else {
              pos.x += dx * k;
              pos.z += dz * k;
            }
          }
        } else {
          const cx = Math.max(c.minX, Math.min(pos.x, c.maxX));
          const cz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
          const dx = pos.x - cx;
          const dz = pos.z - cz;
          const d = Math.hypot(dx, dz);
          if (d < radius) {
            if (d > 1e-5) {
              pos.x += (dx / d) * (radius - d);
              pos.z += (dz / d) * (radius - d);
            } else {
              pos.z += radius;
            }
          }
        }
      }
      const e = (pos.x / WALK_A) ** 2 + (pos.z / WALK_B) ** 2;
      if (e > 1) {
        const k = 1 / Math.sqrt(e);
        pos.x *= k;
        pos.z *= k;
      }
    }
  }

  /** Fraction (0..1) along target→cam where tall scenery blocks the camera, or 1 if clear. */
  cameraClearance(from: THREE.Vector3, to: THREE.Vector3, pad: number): number {
    let best = 1;
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const len2 = dx * dx + dz * dz;
    if (len2 < 1e-6) return 1;
    for (const c of this.colliders) {
      if (c.kind !== 'circle' || c.h < 1.4 || c.active === false) continue;
      const fx = from.x - c.x;
      const fz = from.z - c.z;
      const r = c.r + pad;
      const b = 2 * (fx * dx + fz * dz);
      const cc = fx * fx + fz * fz - r * r;
      const disc = b * b - 4 * len2 * cc;
      if (disc < 0) continue;
      const t = (-b - Math.sqrt(disc)) / (2 * len2);
      if (t > 0 && t < best) {
        // ignore if the camera ray passes above the object at that point
        const y = from.y + (to.y - from.y) * t;
        if (y < c.h + 0.3) best = t;
      }
    }
    return best;
  }
}

export function distToSeg(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const vx = bx - ax;
  const vz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / (vx * vx + vz * vz)));
  return Math.hypot(px - (ax + vx * t), pz - (az + vz * t));
}
