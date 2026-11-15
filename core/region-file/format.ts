// Spike format for a region file: one variable, one box, every step of one
// run, in a single binary. Layout: "TMPR" magic, u32 version, u32 header
// length, UTF-8 JSON header, padding to 4 bytes, then Float32 values step after
// step. A format version is carried from the first file (architecture rule 7).

export const REGION_FILE_VERSION = 1;

export interface RegionHeader {
  version: number;
  source: string;
  model: string;
  run: string;
  variable: string;
  unit: string;
  bbox: [number, number, number, number];
  validTimes: string[];
  valuesPerStep: number;
  savedAt: string;
}

export interface RegionFile {
  header: RegionHeader;
  steps: Float32Array[];
}

const MAGIC = 0x524d5054; // "TMPR" little-endian

export function encodeRegionFile(file: RegionFile): ArrayBuffer {
  const { header, steps } = file;
  if (steps.length !== header.validTimes.length) throw new Error('one step per valid time');
  for (const s of steps) if (s.length !== header.valuesPerStep) throw new Error('step size mismatch');
  const json = new TextEncoder().encode(JSON.stringify(header));
  const pad = (4 - (json.length % 4)) % 4;
  const dataOffset = 12 + json.length + pad;
  const buf = new ArrayBuffer(dataOffset + steps.length * header.valuesPerStep * 4);
  const view = new DataView(buf);
  view.setUint32(0, MAGIC, true);
  view.setUint32(4, header.version, true);
  view.setUint32(8, json.length, true);
  new Uint8Array(buf, 12, json.length).set(json);
  const values = new Float32Array(buf, dataOffset);
  steps.forEach((s, i) => values.set(s, i * header.valuesPerStep));
  return buf;
}

export function decodeRegionFile(buf: ArrayBuffer): RegionFile {
  const view = new DataView(buf);
  if (view.getUint32(0, true) !== MAGIC) throw new Error('not a region file');
  const version = view.getUint32(4, true);
  if (version > REGION_FILE_VERSION) throw new Error(`region file version ${version} is newer than this app`);
  const len = view.getUint32(8, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 12, len))) as RegionHeader;
  const dataOffset = 12 + len + ((4 - (len % 4)) % 4);
  const steps = header.validTimes.map((_, i) => new Float32Array(buf, dataOffset + i * header.valuesPerStep * 4, header.valuesPerStep));
  return { header, steps };
}
