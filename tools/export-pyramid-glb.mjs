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
      // consume the same 6 randoms as runtime (amp, floatPhase, floatSpeed, spinX, spinZ + spin normalize)
      pyraRnd(); pyraRnd(); pyraRnd(); pyraRnd(); pyraRnd();
      // note: runtime also consumes 5 more in tint/aVar loop AFTER all blocks — not here
      blocks.push({ x, y, z });
    }
  }
}
console.log('blocks:', blocks.length);
if (blocks.length > ATLAS_COLS * ATLAS_ROWS) throw new Error('atlas too small');

/* ---- box template: 24 verts (4 per face), 36 indices, face order +x,-x,+y,-y,+z,-z ---- */
const FACE_RECTS = [
  [0 / 3, 0 / 2], [1 / 3, 0 / 2], [2 / 3, 0 / 2],   // +x -x +y
  [0 / 3, 1 / 2], [1 / 3, 1 / 2], [2 / 3, 1 / 2],   // -y +z -z
];
const hx = 0.5, hy = 0.5, hz = 0.5;
// face definitions: 4 corner positions + normal, uv quad (0..1 within face rect)
const FACES = [
  { n: [1, 0, 0],  c: [[hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz], [hx, -hy, hz]] },
  { n: [-1, 0, 0], c: [[-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz], [-hx, -hy, -hz]] },
  { n: [0, 1, 0],  c: [[-hx, hy, -hz], [-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz]] },
  { n: [0, -1, 0], c: [[-hx, -hy, hz], [-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz]] },
  { n: [0, 0, 1],  c: [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]] },
  { n: [0, 0, -1], c: [[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]] },
];
const FACE_UV = [[0, 0], [1, 0], [1, 1], [0, 1]];

/* ---- build merged buffers: all blocks, each with its own 24 verts (unshared) ---- */
const NB = blocks.length;
const posArr = new Float32Array(NB * 24 * 3);
const nrmArr = new Float32Array(NB * 24 * 3);
const uvArr  = new Float32Array(NB * 24 * 2);
const idxArr = new Uint32Array(NB * 36);

for (let i = 0; i < NB; i++) {
  const b = blocks[i];
  const col = i % ATLAS_COLS, row = Math.floor(i / ATLAS_COLS);
  const tu0 = col / ATLAS_COLS, tv0 = row / ATLAS_ROWS;
  for (let f = 0; f < 6; f++) {
    const face = FACES[f];
    const [ru, rv] = FACE_RECTS[f];
    for (let v = 0; v < 4; v++) {
      const vi = i * 24 + f * 4 + v;
      // position: unit box scaled to block dims, translated to home
      posArr[vi * 3 + 0] = b.x + face.c[v][0] * BS_XZ;
      posArr[vi * 3 + 1] = b.y + face.c[v][1] * BS_Y;
      posArr[vi * 3 + 2] = b.z + face.c[v][2] * BS_XZ;
      nrmArr[vi * 3 + 0] = face.n[0];
      nrmArr[vi * 3 + 1] = face.n[1];
      nrmArr[vi * 3 + 2] = face.n[2];
      // uv: face-local (0..1) -> tile rect -> tile origin
      const fu = FACE_UV[v][0], fv = FACE_UV[v][1];
      uvArr[vi * 2 + 0] = tu0 + (ru + fu / 3) / ATLAS_COLS;
      uvArr[vi * 2 + 1] = tv0 + (rv + fv / 2) / ATLAS_ROWS;
    }
    const base = i * 24 + f * 4;
    const ii = (i * 36 + f * 6);
    idxArr[ii + 0] = base + 0; idxArr[ii + 1] = base + 1; idxArr[ii + 2] = base + 2;
    idxArr[ii + 3] = base + 0; idxArr[ii + 4] = base + 2; idxArr[ii + 5] = base + 3;
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
    { bufferView: 0, componentType: 5126, count: NB * 24, type: 'VEC3', min: mn, max: mx },
    { bufferView: 1, componentType: 5126, count: NB * 24, type: 'VEC3' },
    { bufferView: 2, componentType: 5126, count: NB * 24, type: 'VEC2' },
    { bufferView: 3, componentType: 5125, count: NB * 36, type: 'SCALAR' },
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
