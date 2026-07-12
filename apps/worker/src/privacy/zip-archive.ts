const LOCAL_FILE_HEADER = 0x04034b50;
const DATA_DESCRIPTOR = 0x08074b50;
const CENTRAL_DIRECTORY_HEADER = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const UTF8_WITH_DESCRIPTOR = 0x0808;
const MAX_UINT16 = 0xffff;
const MAX_UINT32 = 0xffffffff;

export interface ZipArchiveEntry {
  readonly path: string;
  readonly body: string | Buffer | AsyncIterable<Uint8Array>;
  readonly modifiedAt?: Date;
}

interface CentralEntry {
  readonly name: Buffer;
  readonly crc32: number;
  readonly size: number;
  readonly offset: number;
  readonly dosDate: number;
  readonly dosTime: number;
}

export async function* createZipArchive(
  entries: AsyncIterable<ZipArchiveEntry> | Iterable<ZipArchiveEntry>,
  maxBytes: number,
): AsyncGenerator<Buffer> {
  const centralEntries: CentralEntry[] = [];
  let offset = 0;
  for await (const entry of entries) {
    if (centralEntries.length >= MAX_UINT16) throw new Error('ZIP_ENTRY_LIMIT_EXCEEDED');
    const name = Buffer.from(safeZipPath(entry.path), 'utf8');
    if (name.length === 0 || name.length > MAX_UINT16) throw new Error('ZIP_ENTRY_NAME_INVALID');
    const { date, time } = dosTimestamp(entry.modifiedAt ?? new Date('1980-01-01T00:00:00Z'));
    const localOffset = offset;
    const header = Buffer.alloc(30 + name.length);
    header.writeUInt32LE(LOCAL_FILE_HEADER, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(UTF8_WITH_DESCRIPTOR, 6);
    header.writeUInt16LE(0, 8);
    header.writeUInt16LE(time, 10);
    header.writeUInt16LE(date, 12);
    header.writeUInt16LE(name.length, 26);
    name.copy(header, 30);
    offset = checkedOffset(offset, header.length, maxBytes);
    yield header;

    const crc = new Crc32();
    let size = 0;
    for await (const chunk of bodyChunks(entry.body)) {
      if (chunk.length === 0) continue;
      size = checkedOffset(size, chunk.length, MAX_UINT32);
      offset = checkedOffset(offset, chunk.length, maxBytes);
      crc.update(chunk);
      yield chunk;
    }
    const checksum = crc.digest();
    const descriptor = Buffer.alloc(16);
    descriptor.writeUInt32LE(DATA_DESCRIPTOR, 0);
    descriptor.writeUInt32LE(checksum, 4);
    descriptor.writeUInt32LE(size, 8);
    descriptor.writeUInt32LE(size, 12);
    offset = checkedOffset(offset, descriptor.length, maxBytes);
    yield descriptor;
    centralEntries.push({
      name,
      crc32: checksum,
      size,
      offset: localOffset,
      dosDate: date,
      dosTime: time,
    });
  }

  const centralOffset = offset;
  for (const entry of centralEntries) {
    const header = Buffer.alloc(46 + entry.name.length);
    header.writeUInt32LE(CENTRAL_DIRECTORY_HEADER, 0);
    header.writeUInt16LE(0x0314, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(UTF8_WITH_DESCRIPTOR, 8);
    header.writeUInt16LE(0, 10);
    header.writeUInt16LE(entry.dosTime, 12);
    header.writeUInt16LE(entry.dosDate, 14);
    header.writeUInt32LE(entry.crc32, 16);
    header.writeUInt32LE(entry.size, 20);
    header.writeUInt32LE(entry.size, 24);
    header.writeUInt16LE(entry.name.length, 28);
    header.writeUInt32LE((0o100600 << 16) >>> 0, 38);
    header.writeUInt32LE(entry.offset, 42);
    entry.name.copy(header, 46);
    offset = checkedOffset(offset, header.length, maxBytes);
    yield header;
  }
  const centralSize = offset - centralOffset;
  const footer = Buffer.alloc(22);
  footer.writeUInt32LE(END_OF_CENTRAL_DIRECTORY, 0);
  footer.writeUInt16LE(centralEntries.length, 8);
  footer.writeUInt16LE(centralEntries.length, 10);
  footer.writeUInt32LE(centralSize, 12);
  footer.writeUInt32LE(centralOffset, 16);
  checkedOffset(offset, footer.length, maxBytes);
  yield footer;
}

export function crc32(value: Uint8Array): number {
  return new Crc32().update(value).digest();
}

class Crc32 {
  private value = 0xffffffff;

  update(chunk: Uint8Array): this {
    for (const byte of chunk) {
      this.value = (CRC_TABLE[(this.value ^ byte) & 0xff] ?? 0) ^ (this.value >>> 8);
    }
    return this;
  }

  digest(): number {
    return (this.value ^ 0xffffffff) >>> 0;
  }
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

async function* bodyChunks(body: ZipArchiveEntry['body']): AsyncGenerator<Buffer> {
  if (typeof body === 'string' || Buffer.isBuffer(body)) {
    yield Buffer.from(body);
    return;
  }
  for await (const chunk of body) yield Buffer.from(chunk);
}

function safeZipPath(path: string): string {
  const normalized = path.replaceAll('\\', '/').normalize('NFC');
  if (
    normalized.startsWith('/') ||
    normalized.includes('\0') ||
    normalized.split('/').some((part) => part === '' || part === '.' || part === '..')
  ) {
    throw new Error('ZIP_ENTRY_PATH_UNSAFE');
  }
  return normalized;
}

function checkedOffset(current: number, increment: number, maximum: number): number {
  const next = current + increment;
  if (!Number.isSafeInteger(next) || next > maximum || next > MAX_UINT32) {
    throw new Error('ZIP_SIZE_LIMIT_EXCEEDED');
  }
  return next;
}

function dosTimestamp(value: Date): { readonly date: number; readonly time: number } {
  const year = Math.min(2107, Math.max(1980, value.getUTCFullYear()));
  return {
    date: ((year - 1980) << 9) | ((value.getUTCMonth() + 1) << 5) | value.getUTCDate(),
    time: (value.getUTCHours() << 11) | (value.getUTCMinutes() << 5) | (value.getUTCSeconds() >> 1),
  };
}
