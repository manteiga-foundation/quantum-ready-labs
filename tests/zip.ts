// Reads a zip written with stored (uncompressed) entries: enough to prove the .xlsx export is a
// real Office Open XML package, and to pull its parts back out in a test. No dependency needed.

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

const view = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

/** Parses a stored-entry zip through its central directory. Throws with the reason when it is not one. */
export function parseStoredZip(bytes: Uint8Array): Map<string, Uint8Array> {
  const dv = view(bytes);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0; i--) {
    if (dv.getUint32(i, true) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('no end of central directory record');
  const count = dv.getUint16(eocd + 10, true);
  const cdOffset = dv.getUint32(eocd + 16, true);
  if (dv.getUint32(cdOffset, true) !== CENTRAL) throw new Error('central directory does not start where the EOCD says');

  const entries = new Map<string, Uint8Array>();
  const decoder = new TextDecoder();
  let p = cdOffset;
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(p, true) !== CENTRAL) throw new Error(`central entry ${i} has the wrong signature`);
    const method = dv.getUint16(p + 10, true);
    if (method !== 0) throw new Error(`central entry ${i} is compressed (method ${method}); this reader handles stored entries only`);
    const crc = dv.getUint32(p + 16, true);
    const size = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const localOffset = dv.getUint32(p + 42, true);
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen));

    if (dv.getUint32(localOffset, true) !== LOCAL) throw new Error(`${name}: local header has the wrong signature`);
    const localNameLen = dv.getUint16(localOffset + 26, true);
    const localExtraLen = dv.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const data = bytes.subarray(dataStart, dataStart + size);
    if (data.length !== size) throw new Error(`${name}: local data is truncated`);
    if (crc32(data) !== crc) throw new Error(`${name}: CRC does not match the central directory`);
    entries.set(name, data);
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c ^= bytes[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

export function text(entries: Map<string, Uint8Array>, name: string): string {
  const data = entries.get(name);
  if (!data) throw new Error(`the package has no ${name}: has ${[...entries.keys()].join(', ')}`);
  return new TextDecoder().decode(data);
}
