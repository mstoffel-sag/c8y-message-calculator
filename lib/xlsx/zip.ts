/**
 * A minimal ZIP writer -- enough to build an .xlsx, and nothing more.
 *
 * An xlsx is a ZIP of XML parts, so writing one needs a ZIP writer. Rather than
 * pull in a library for it, this stores entries uncompressed: the deflate is
 * the only hard part of the format, and a spreadsheet of a few hundred rows is
 * a few tens of kilobytes either way. Excel reads stored entries perfectly
 * well.
 *
 * No DOM and no Node APIs, so it runs in the browser and under test alike.
 */

export interface ZipEntry {
  /** Path inside the archive, e.g. 'xl/worksheets/sheet1.xml'. */
  path: string;
  data: Uint8Array;
}

const CRC_TABLE = buildCrcTable();

function buildCrcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
}

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/**
 * DOS date and time. Fixed by default: a deterministic archive means the same
 * scenario produces byte-identical files, which is what makes the writer
 * testable at all.
 */
function dosDateTime(date?: Date): { time: number; date: number } {
  // 1 Jan 1980, midnight -- the DOS epoch, and the lowest date the format can
  // represent. Bit layout is yyyyyyym mmmddddd with the year relative to 1980,
  // so 1 January is (0 << 9) | (1 << 5) | 1. u16 writes it little-endian; the
  // constant itself must not be byte-swapped.
  if (!date) return { time: 0, date: 0x0021 };
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, date: day };
}

class Writer {
  private parts: Uint8Array[] = [];
  length = 0;

  push(bytes: Uint8Array): void {
    this.parts.push(bytes);
    this.length += bytes.length;
  }

  u16(value: number): void {
    this.push(new Uint8Array([value & 0xff, (value >>> 8) & 0xff]));
  }

  u32(value: number): void {
    this.push(
      new Uint8Array([value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff]),
    );
  }

  concat(): Uint8Array {
    const out = new Uint8Array(this.length);
    let at = 0;
    for (const part of this.parts) {
      out.set(part, at);
      at += part.length;
    }
    return out;
  }
}

export function makeZip(entries: ZipEntry[], modified?: Date): Uint8Array {
  const { time, date } = dosDateTime(modified);
  const body = new Writer();
  const central = new Writer();

  for (const entry of entries) {
    const name = utf8(entry.path);
    const crc = crc32(entry.data);
    const offset = body.length;

    // Local file header.
    body.u32(0x04034b50);
    body.u16(20); // version needed
    body.u16(0); // flags
    body.u16(0); // stored, not deflated
    body.u16(time);
    body.u16(date);
    body.u32(crc);
    body.u32(entry.data.length); // compressed size
    body.u32(entry.data.length); // uncompressed size
    body.u16(name.length);
    body.u16(0); // extra length
    body.push(name);
    body.push(entry.data);

    // Central directory record.
    central.u32(0x02014b50);
    central.u16(20); // version made by
    central.u16(20); // version needed
    central.u16(0);
    central.u16(0);
    central.u16(time);
    central.u16(date);
    central.u32(crc);
    central.u32(entry.data.length);
    central.u32(entry.data.length);
    central.u16(name.length);
    central.u16(0); // extra
    central.u16(0); // comment
    central.u16(0); // disk number
    central.u16(0); // internal attributes
    central.u32(0); // external attributes
    central.u32(offset);
    central.push(name);
  }

  const out = new Writer();
  out.push(body.concat());
  const centralOffset = out.length;
  out.push(central.concat());

  // End of central directory.
  out.u32(0x06054b50);
  out.u16(0); // this disk
  out.u16(0); // disk with the central directory
  out.u16(entries.length);
  out.u16(entries.length);
  out.u32(central.length);
  out.u32(centralOffset);
  out.u16(0); // comment length

  return out.concat();
}
