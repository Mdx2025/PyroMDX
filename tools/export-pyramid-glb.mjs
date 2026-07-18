/**
 * PYRA — pyramid geometry exporter (Phase 2a)
 * Builds the exact same block pyramid as the runtime (same constants, same PRNG),
 * lays out per-block UV atlas tiles (13x13 grid, 6 faces per tile in 3x2),
 * and writes a GLB with one named mesh per block (block_000 ... block_168).
 *
 * Atlas convention (must match runtime shader):
 *   tile index i -> col = i % 13, row = floor(i / 13)
 *   tile origin (u0,v0) = (col/13, row/13)
 *   tile-local uv in [0,1]: face f (0..5) occupies:
 *     f 0 (+x): rect (0/3, 0/2) .. (1/3, 1/2)
 *     f 1 (-x): rect (1/3, 0/2) .. (2/3, 1/2)
 *     f 2 (+y): rect (2/3, 0/2) .. (3/3, 1/2)
 *     f 3 (-y): rect (0/3, 1/2) .. (1/3, 2/2)
 *     f 4 (+z): rect (1/3, 1/2) .. (2/3, 2/2)
 *     f 5 (-z): rect (2/3, 1/2) .. (3/3, 2/2)
 *   final atlas uv = (tileLocal / vec2(3,2) + faceRectOrigin)/13 + tileOrigin
 *   -> we precompute FINAL uvs per vertex here; runtime uses tile-local + aUvTile offset.
 */

import * as fs from 'node:fs';

/* ---- runtime constants (keep in sync with pyra-desierto-v13.html) ---- */
const CELL_XZ = 2.3, CELL_Y = 2.05, COUNT0 = 13;
const LAYERS = (COUNT0 + 1) / 2;
const BS_XZ = CELL_XZ * 0.998, BS_Y = CELL_Y * 0.998;
const ATLAS_COLS = 13, ATLAS_ROWS = 13;

/* ---- same PRNG as runtime ---- */
const PYRA_SEED = 20260717;
let _rngState = PYRA_SEED;
function pyraRnd() {
  _rngState |= 0; _rngState = (_rngState + 0x6D2B79F5) | 0;
  let t = Math.imul(_rngState ^ (_rngState >>> 15), 1 | _rngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/* ---- block generation (identical order to runtime) ---- */
const blocks = [];
for (let j = 0; j < LAYERS; j++) {
  const count = COUNT0 - j * 2;
  const half = (count * CELL_XZ) / 2;
  const y = j * CELL_Y + CELL_Y / 2;
  for (let a = 0; a < count; a++) {
    for (let b = 0; b < count; b++) {
      const interior = a > 0 && a < count - 1 && b > 0 && b < count - 1 && j < LAYERS - 1;
      if (interior) continue;
      const x = -half + CELL_XZ / 2 + a * CELL_XZ;
      const z = -half + CELL_XZ / 2 + b * CELL_XZ;
      // consume the same 5 randoms as runtime (amp, floatPhase, floatSpeed, spinX, spinZ)
      pyraRnd(); pyraRnd(); pyraRnd(); pyraRnd(); pyraRnd();
      // note: runtime also consumes 7 more in tint/aVar loop AFTER all blocks — not here
      blocks.push({ x, y, z, j, a, b, count });
    }
  }
}

/* ---- weathering pass (must mirror runtime EXACTLY) ---- */
{
  let _s2 = (PYRA_SEED ^ 0x9E3779B9) | 0;
  const rnd2 = () => {
    _s2 |= 0; _s2 = (_s2 + 0x6D2B79F5) | 0;
    let t = Math.imul(_s2 ^ (_s2 >>> 15), 1 | _s2);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const layerDX = [], layerDZ = [];
  for (let j = 0; j < LAYERS; j++) {
    layerDX.push((rnd2() - 0.5) * 0.22);
    layerDZ.push((rnd2() - 0.5) * 0.22);
  }
  for (let bi = 0; bi < blocks.length; bi++) {
    const B = blocks[bi];
    const j = B.j, count = B.count, a = B.a, b = B.b;
    B.jx = B.x + layerDX[j] + (rnd2() - 0.5) * 0.08;
    B.jz = B.z + layerDZ[j] + (rnd2() - 0.5) * 0.08;
    B.jy = B.y + (rnd2() - 0.5) * 0.05;
    B.yaw = (rnd2() - 0.5) * 0.045;
    B.tiltX = (rnd2() - 0.5) * 0.03;
    B.tiltZ = (rnd2() - 0.5) * 0.03;
    const su = 0.965 + rnd2() * 0.05;
    const sy = 0.97 + rnd2() * 0.05;
    B.jsx = su; B.jsy = sy; B.jsz = su;
    B.seed = rnd2();
    const isCorner = (a === 0 || a === count - 1) && (b === 0 || b === count - 1);
    const isEdge = !isCorner && (a === 0 || a === count - 1 || b === 0 || b === count - 1);
    const r = rnd2();
    B.eroded = false; B.shrinkF = 1;
    if (j >= 1 && isCorner) {
      if (r < 0.10) B.eroded = true;
      else if (r < 0.35) B.shrinkF = 0.84 + rnd2() * 0.10;
    } else if (j >= 2 && isEdge) {
      if (r < 0.03) B.eroded = true;
      else if (r < 0.12) B.shrinkF = 0.88 + rnd2() * 0.08;
    }
  }
  for (let bi = blocks.length - 1; bi >= 0; bi--) if (blocks[bi].eroded) blocks.splice(bi, 1);
}
console.log('blocks (after erosion):', blocks.length);
if (blocks.length > ATLAS_COLS * ATLAS_ROWS) throw new Error('atlas too small');

/* ---- subdivided box template: SUB x SUB per face, matching runtime geometry ---- */
const SUB = 9;      /* Phase A: matches runtime (9x9 verts/face) */
const BEVEL = 0.11; /* Phase A: unit-space rounded-box bevel radius */
const FACE_RECTS = [
  [0 / 3, 0 / 2], [1 / 3, 0 / 2], [2 / 3, 0 / 2],   // +x -x +y
  [0 / 3, 1 / 2], [1 / 3, 1 / 2], [2 / 3, 1 / 2],   // -y +z -z
];
const hx = 0.5, hy = 0.5, hz = 0.5;
const FACES = [
  { n: [1, 0, 0],  c: [[hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz], [hx, -hy, hz]] },
  { n: [-1, 0, 0], c: [[-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz], [-hx, -hy, -hz]] },
  { n: [0, 1, 0],  c: [[-hx, hy, -hz], [-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz]] },
  { n: [0, -1, 0], c: [[-hx, -hy, hz], [-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz]] },
  { n: [0, 0, 1],  c: [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]] },
  { n: [0, 0, -1], c: [[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]] },
];

/* erosion displacement — same formula as runtime vertex shader */
function displace(lx, ly, lz, seed) {
  const len = Math.hypot(lx, ly, lz) || 1;
  const dx = lx / len, dy = ly / len, dz = lz / len;
  const px = lx * 2.6 + seed * 17.31, py = ly * 2.6 + seed * 9.17, pz = lz * 2.6 + seed * 13.77;
  const h1 = fract(Math.sin(px * 127.1 + py * 311.7 + pz * 74.7) * 43758.5453);
  const h2 = fract(Math.sin((px + 0.5) * 269.5 + (py + 0.5) * 183.3 + (pz + 0.5) * 246.1) * 28001.8384);
  const n = (h1 + h2) * 0.5;
  const d = (n - 0.45) * 0.04;
  return [dx * d, dy * d, dz * d];
}
function fract(x) { return x - Math.floor(x); }

/* quaternion (YXZ euler) rotate — matches THREE.Quaternion.setFromEuler('YXZ') applied to vector */
function rotYXZ(vx, vy, vz, tx, yaw, tz) {
  // Y (yaw)
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  let x = vx * cy + vz * sy, y = vy, z = -vx * sy + vz * cy;
  // X (tiltX)
  const cx = Math.cos(tx), sx = Math.sin(tx);
  let y2 = y * cx - z * sx, z2 = y * sx + z * cx, x2 = x;
  // Z (tiltZ)
  const cz = Math.cos(tz), sz = Math.sin(tz);
  return [x2 * cz - y2 * sz, x2 * sz + y2 * cz, z2];
}

const VPB = 6 * SUB * SUB;             /* verts per block */
const IPB = 6 * (SUB - 1) * (SUB - 1) * 6; /* indices per block */
const NB = blocks.length;
const posArr = new Float32Array(NB * VPB * 3);
const nrmArr = new Float32Array(NB * VPB * 3);
const uvArr  = new Float32Array(NB * VPB * 2);
const idxArr = new Uint32Array(NB * IPB);

for (let i = 0; i < NB; i++) {
  const b = blocks[i];
  const col = i % ATLAS_COLS, row = Math.floor(i / ATLAS_COLS);
  const tu0 = col / ATLAS_COLS, tv0 = row / ATLAS_ROWS;
  const sx = BS_XZ * b.jsx * b.shrinkF, sy2 = BS_Y * b.jsy * b.shrinkF, sz = BS_XZ * b.jsz * b.shrinkF;
  let vo = 0;
  for (let f = 0; f < 6; f++) {
    const face = FACES[f];
    const [ru, rv] = FACE_RECTS[f];
    const faceBase = i * VPB + f * SUB * SUB;
    for (let gy = 0; gy < SUB; gy++) {
      for (let gx = 0; gx < SUB; gx++) {
        const u0 = gx / (SUB - 1), v0 = gy / (SUB - 1);
        /* edge-biased grid remap — matches runtime pyramidGeo */
        const u = 0.5 + 0.5 * Math.sin(Math.PI * (u0 - 0.5));
        const v = 0.5 + 0.5 * Math.sin(Math.PI * (v0 - 0.5));
        const c0 = face.c[0], c1 = face.c[1], c2 = face.c[2], c3 = face.c[3];
        /* local unit-box position (bilinear) */
        let lx = 0, ly = 0, lz = 0;
        for (let k = 0; k < 3; k++) {
          const val = c0[k] * (1 - u) * (1 - v) + c1[k] * u * (1 - v) + c2[k] * u * v + c3[k] * (1 - u) * v;
          if (k === 0) lx = val; else if (k === 1) ly = val; else lz = val;
        }
        /* rounded-box projection — matches runtime pyramidGeo */
        const inner = 0.5 - BEVEL;
        const qx = Math.max(-inner, Math.min(inner, lx));
        const qy = Math.max(-inner, Math.min(inner, ly));
        const qz = Math.max(-inner, Math.min(inner, lz));
        const bx = lx - qx, by = ly - qy, bz = lz - qz;
        const bl = Math.hypot(bx, by, bz);
        let lnx = face.n[0], lny = face.n[1], lnz = face.n[2];
        if (bl > 1e-6) {
          lx = qx + bx / bl * BEVEL; ly = qy + by / bl * BEVEL; lz = qz + bz / bl * BEVEL;
          lnx = bx / bl; lny = by / bl; lnz = bz / bl;
        }
        /* erosion displacement in unit space (dir from rounded position, like shader) */
        const [ddx, ddy, ddz] = displace(lx, ly, lz, b.seed);
        /* scale + rotate + translate */
        const wx = (lx + ddx) * sx, wy = (ly + ddy) * sy2, wz = (lz + ddz) * sz;
        const [rx, ry, rz] = rotYXZ(wx, wy, wz, b.tiltX, b.yaw, b.tiltZ);
        const vi = faceBase + gy * SUB + gx;
        posArr[vi * 3 + 0] = b.jx + rx;
        posArr[vi * 3 + 1] = b.jy + ry;
        posArr[vi * 3 + 2] = b.jz + rz;
        const [nx, ny, nz] = rotYXZ(lnx, lny, lnz, b.tiltX, b.yaw, b.tiltZ);
        nrmArr[vi * 3 + 0] = nx; nrmArr[vi * 3 + 1] = ny; nrmArr[vi * 3 + 2] = nz;
        uvArr[vi * 2 + 0] = tu0 + (ru + u / 3) / ATLAS_COLS;
        uvArr[vi * 2 + 1] = tv0 + (rv + v / 2) / ATLAS_ROWS;
      }
    }
    for (let gy = 0; gy < SUB - 1; gy++) {
      for (let gx = 0; gx < SUB - 1; gx++) {
        const i0 = faceBase + gy * SUB + gx, i1 = i0 + 1;
        const i2 = faceBase + (gy + 1) * SUB + gx, i3 = i2 + 1;
        const ii = i * IPB + f * (SUB - 1) * (SUB - 1) * 6 + (gy * (SUB - 1) + gx) * 6;
        idxArr[ii + 0] = i0; idxArr[ii + 1] = i1; idxArr[ii + 2] = i2;
        idxArr[ii + 3] = i1; idxArr[ii + 4] = i3; idxArr[ii + 5] = i2;
      }
    }
  }
}

/* ---- GLB writer (minimal) ---- */
function align4(n) { return (n + 3) & ~3; }
const binParts = [];
let binLen = 0;
function addBuf(arr) {
  const bytes = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
  const off = binLen;
  binParts.push(bytes);
  binLen += bytes.length;
  const pad = align4(binLen) - binLen;
  if (pad) { binParts.push(Buffer.alloc(pad)); binLen += pad; }
  return { offset: off, length: bytes.length };
}
const bvPos = addBuf(posArr), bvNrm = addBuf(nrmArr), bvUv = addBuf(uvArr), bvIdx = addBuf(idxArr);

// compute min/max for POSITION accessor
let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
for (let i = 0; i < posArr.length; i += 3)
  for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], posArr[i + k]); mx[k] = Math.max(mx[k], posArr[i + k]); }

const gltf = {
  asset: { version: '2.0', generator: 'pyra-export-pyramid-glb' },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ mesh: 0, name: 'pyramid_merged' }],
  meshes: [{
    name: 'pyramid_merged',
    primitives: [{
      attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 },
      indices: 3,
      material: 0
    }]
  }],
  materials: [{
    name: 'pyra_stone',
    pbrMetallicRoughness: { baseColorFactor: [0.96, 0.91, 0.81, 1], metallicFactor: 0.02, roughnessFactor: 0.95 }
  }],
  bufferViews: [
    { buffer: 0, byteOffset: bvPos.offset, byteLength: bvPos.length, target: 34962 },
    { buffer: 0, byteOffset: bvNrm.offset, byteLength: bvNrm.length, target: 34962 },
    { buffer: 0, byteOffset: bvUv.offset, byteLength: bvUv.length, target: 34962 },
    { buffer: 0, byteOffset: bvIdx.offset, byteLength: bvIdx.length, target: 34963 },
  ],
  accessors: [
    { bufferView: 0, componentType: 5126, count: NB * VPB, type: 'VEC3', min: mn, max: mx },
    { bufferView: 1, componentType: 5126, count: NB * VPB, type: 'VEC3' },
    { bufferView: 2, componentType: 5126, count: NB * VPB, type: 'VEC2' },
    { bufferView: 3, componentType: 5125, count: NB * IPB, type: 'SCALAR' },
  ],
  buffers: [{ byteLength: binLen }]
};

const jsonBuf = Buffer.from(JSON.stringify(gltf), 'utf8');
const jsonPad = align4(jsonBuf.length) - jsonBuf.length;
const jsonChunk = Buffer.concat([jsonBuf, Buffer.from(' '.repeat(jsonPad))]);
const binChunk = Buffer.concat(binParts);
const totalLen = 12 + 8 + jsonChunk.length + 8 + binChunk.length;

const out = Buffer.alloc(totalLen);
let o = 0;
out.writeUInt32LE(0x46546C67, o); o += 4;         // 'glTF'
out.writeUInt32LE(2, o); o += 4;                  // version
out.writeUInt32LE(totalLen, o); o += 4;
out.writeUInt32LE(jsonChunk.length, o); o += 4;
out.writeUInt32LE(0x4E4F534A, o); o += 4;         // 'JSON'
jsonChunk.copy(out, o); o += jsonChunk.length;
out.writeUInt32LE(binChunk.length, o); o += 4;
out.writeUInt32LE(0x004E4942, o); o += 4;         // 'BIN'
binChunk.copy(out, o);

const outPath = process.argv[2] || '/tmp/pyra-pyramid.glb';
fs.writeFileSync(outPath, out);
console.log('GLB written:', outPath, out.length, 'bytes,', NB, 'blocks');
