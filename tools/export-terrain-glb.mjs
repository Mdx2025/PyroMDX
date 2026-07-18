/**
 * PYRA Phase 3a — terrain geometry exporter
 * Replicates the exact duneH() from pyra-desierto-v13.html,
 * builds the displaced plane mesh with planar UVs (top-down),
 * and writes a GLB for Blender baking.
 *
 * UV convention: uv.x = (x/760 + 0.5), uv.y = (z/760 + 0.5)
 * (matches a top-down orthographic projection)
 */

import * as fs from 'node:fs';

/* ---- exact copies from runtime ---- */
const hash2 = (x, z) => { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); };
const vnoise = (x, z) => {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  return hash2(xi, zi) * (1 - u) * (1 - v) + hash2(xi + 1, zi) * u * (1 - v)
       + hash2(xi, zi + 1) * (1 - u) * v + hash2(xi + 1, zi + 1) * u * v;
};
const ridge = v => 1 - Math.abs(Math.sin(v));
// smoothstep matching THREE.MathUtils.smoothstep(x, min, max)
const smoothstep = (x, min, max) => {
  const t = Math.min(1, Math.max(0, (x - min) / (max - min)));
  return t * t * (3 - 2 * t);
};
const duneH = (x, z) => {
  const dist = Math.hypot(x, z);
  const nearMask = smoothstep(dist, 14, 38);
  const mounds = nearMask * (
    2.6 * (vnoise(x * 0.045, z * 0.045) - 0.5) * 2 +
    1.3 * (vnoise(x * 0.11 + 7.3, z * 0.11) - 0.5) * 2 +
    0.4 * (vnoise(x * 0.3, z * 0.3 + 3.1) - 0.5) * 2
  );
  const midMask = smoothstep(dist, 34, 80);
  const hills = midMask * (
    6.5 * (vnoise(x * 0.022 + 3.7, z * 0.022) - 0.5) * 2 +
    4.0 * ridge(x * 0.02 - z * 0.014 + 2.6) +
    2.2 * (vnoise(x * 0.06, z * 0.06 + 9.2) - 0.5) * 2
  );
  const far = smoothstep(dist, 52, 170);
  const soften = 1 - smoothstep(dist, 170, 340) * 0.45;
  const mountains = far * soften * (
    42 * ridge(x * 0.012 + z * 0.006 + 1.2) +
    26 * ridge(z * 0.016 - x * 0.008 + 4.0) +
    13 * Math.sin((x + z) * 0.02 + 2.0) +
    10 * (vnoise(x * 0.02, z * 0.02) - 0.5) * 2
  );
  return mounds + Math.max(0, mounds) * 0.4 + hills + mountains;
};

/* ---- build terrain mesh (same as runtime: 760x760, 240x240 segments) ---- */
const SIZE = 760, SEGS = 240;
const NV = (SEGS + 1) * (SEGS + 1);
const posArr = new Float32Array(NV * 3);
const nrmArr = new Float32Array(NV * 3);
const uvArr  = new Float32Array(NV * 2);
const idxArr = new Uint32Array(SEGS * SEGS * 6);

let vi = 0;
for (let iz = 0; iz <= SEGS; iz++) {
  for (let ix = 0; ix <= SEGS; ix++) {
    const x = -SIZE / 2 + (ix / SEGS) * SIZE;
    const z = -SIZE / 2 + (iz / SEGS) * SIZE;
    const y = duneH(x, z);
    posArr[vi * 3 + 0] = x;
    posArr[vi * 3 + 1] = y;
    posArr[vi * 3 + 2] = z;
    uvArr[vi * 2 + 0] = x / SIZE + 0.5;
    uvArr[vi * 2 + 1] = z / SIZE + 0.5;
    vi++;
  }
}

/* indices (two triangles per quad, same winding as PlaneGeometry after rotateX(-PI/2)) */
let ii = 0;
for (let iz = 0; iz < SEGS; iz++) {
  for (let ix = 0; ix < SEGS; ix++) {
    const a = iz * (SEGS + 1) + ix;
    const b = a + 1;
    const c = a + (SEGS + 1);
    const d = c + 1;
    // after rotateX(-PI/2): PlaneGeometry XY becomes XZ, normal +Y
    // winding: counter-clockwise when viewed from +Y
    idxArr[ii++] = a; idxArr[ii++] = c; idxArr[ii++] = b;
    idxArr[ii++] = b; idxArr[ii++] = c; idxArr[ii++] = d;
  }
}

/* compute smooth vertex normals (central differences) */
const step = SIZE / SEGS;
for (let iz = 0; iz <= SEGS; iz++) {
  for (let ix = 0; ix <= SEGS; ix++) {
    const i = iz * (SEGS + 1) + ix;
    const xl = ix > 0 ? posArr[(i - 1) * 3 + 1] : posArr[i * 3 + 1];
    const xr = ix < SEGS ? posArr[(i + 1) * 3 + 1] : posArr[i * 3 + 1];
    const zd = iz > 0 ? posArr[(i - SEGS - 1) * 3 + 1] : posArr[i * 3 + 1];
    const zu = iz < SEGS ? posArr[(i + SEGS + 1) * 3 + 1] : posArr[i * 3 + 1];
    // tangent X: (2*step, xr-xl, 0), tangent Z: (0, zu-zd, 2*step)
    // normal = cross(tangentZ, tangentX) normalized (Y-up)
    let nx = -(xr - xl) / (2 * step);
    let nz = -(zu - zd) / (2 * step);
    let ny = 1.0;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    nrmArr[i * 3 + 0] = nx / len;
    nrmArr[i * 3 + 1] = ny / len;
    nrmArr[i * 3 + 2] = nz / len;
  }
}

/* ---- GLB writer ---- */
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

let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
for (let i = 0; i < posArr.length; i += 3)
  for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], posArr[i + k]); mx[k] = Math.max(mx[k], posArr[i + k]); }

const gltf = {
  asset: { version: '2.0', generator: 'pyra-export-terrain-glb' },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ mesh: 0, name: 'terrain' }],
  meshes: [{
    name: 'terrain',
    primitives: [{
      attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 },
      indices: 3,
      material: 0
    }]
  }],
  materials: [{
    name: 'pyra_sand',
    pbrMetallicRoughness: { baseColorFactor: [0.83, 0.75, 0.63, 1], metallicFactor: 0.0, roughnessFactor: 1.0 }
  }],
  bufferViews: [
    { buffer: 0, byteOffset: bvPos.offset, byteLength: bvPos.length, target: 34962 },
    { buffer: 0, byteOffset: bvNrm.offset, byteLength: bvNrm.length, target: 34962 },
    { buffer: 0, byteOffset: bvUv.offset, byteLength: bvUv.length, target: 34962 },
    { buffer: 0, byteOffset: bvIdx.offset, byteLength: bvIdx.length, target: 34963 },
  ],
  accessors: [
    { bufferView: 0, componentType: 5126, count: NV, type: 'VEC3', min: mn, max: mx },
    { bufferView: 1, componentType: 5126, count: NV, type: 'VEC3' },
    { bufferView: 2, componentType: 5126, count: NV, type: 'VEC2' },
    { bufferView: 3, componentType: 5125, count: SEGS * SEGS * 6, type: 'SCALAR' },
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
out.writeUInt32LE(0x46546C67, o); o += 4;
out.writeUInt32LE(2, o); o += 4;
out.writeUInt32LE(totalLen, o); o += 4;
out.writeUInt32LE(jsonChunk.length, o); o += 4;
out.writeUInt32LE(0x4E4F534A, o); o += 4;
jsonChunk.copy(out, o); o += jsonChunk.length;
out.writeUInt32LE(binChunk.length, o); o += 4;
out.writeUInt32LE(0x004E4942, o); o += 4;
binChunk.copy(out, o);

const outPath = process.argv[2] || '/tmp/pyra-terrain.glb';
fs.writeFileSync(outPath, out);
console.log('terrain GLB:', outPath, out.length, 'bytes,', NV, 'verts,', SEGS * SEGS * 2, 'tris');
console.log('height range: %.2f .. %.2f', mn[1], mx[1]);
