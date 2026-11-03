import { Unzip, UnzipInflate } from 'fflate';
export const CLASSROOM_LIMITS = Object.freeze({
  archives: 20,
  compressedBytes: 4 * 1024 * 1024,
  expandedBytes: 8 * 1024 * 1024,
  files: 200,
  depth: 32,
});
export function archivePath(name) {
  if (
    typeof name !== 'string' ||
    !name ||
    name.length > 512 ||
    /[\\:\u0000-\u001f\u007f]/u.test(name) ||
    name.startsWith('/')
  )
    throw Error('ZIP 包含无效或绝对路径。');
  const clean = name.endsWith('/') ? name.slice(0, -1) : name;
  const parts = clean.split('/');
  if (
    parts.some((part) => !part || part === '.' || part === '..') ||
    parts.length > CLASSROOM_LIMITS.depth + 1
  )
    throw Error('ZIP 路径穿越或目录过深。');
  return clean.normalize('NFC');
}
const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let i = 0; i < 8; i++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
const crc = (bytes) => {
  let value = 0xffffffff;
  for (const byte of bytes) value = crcTable[(value ^ byte) & 255] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
};
function directory(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset--)
    if (
      view.getUint32(offset, true) === 0x06054b50 &&
      offset + 22 + view.getUint16(offset + 20, true) === bytes.length
    ) {
      end = offset;
      break;
    }
  if (end < 0) throw Error('不是完整的普通 ZIP 文件。');
  const count = view.getUint16(end + 10, true),
    size = view.getUint32(end + 12, true),
    start = view.getUint32(end + 16, true);
  if (
    view.getUint16(end + 4, true) ||
    view.getUint16(end + 6, true) ||
    view.getUint16(end + 8, true) !== count ||
    count > CLASSROOM_LIMITS.files ||
    start + size !== end
  )
    throw Error('ZIP 文件过多，或使用了不支持的多卷/ZIP64格式。');
  const entries = new Map(),
    folded = new Set();
  let position = start,
    total = 0;
  for (let index = 0; index < count; index++) {
    if (position + 46 > end || view.getUint32(position, true) !== 0x02014b50) throw Error('ZIP 目录损坏。');
    const flags = view.getUint16(position + 8, true),
      method = view.getUint16(position + 10, true),
      checksum = view.getUint32(position + 16, true),
      compressed = view.getUint32(position + 20, true),
      expanded = view.getUint32(position + 24, true),
      length = view.getUint16(position + 28, true),
      extra = view.getUint16(position + 30, true),
      comment = view.getUint16(position + 32, true),
      disk = view.getUint16(position + 34, true),
      mode = view.getUint32(position + 38, true) >>> 16,
      local = view.getUint32(position + 42, true);
    if (
      (flags & ~0x0808) !== 0 ||
      ![0, 8].includes(method) ||
      disk ||
      (mode & 0o170000) === 0o120000 ||
      position + 46 + length + extra + comment > end
    )
      throw Error('ZIP 含加密、链接或不支持的条目。');
    const name = new TextDecoder('utf-8', { fatal: true }).decode(
        bytes.subarray(position + 46, position + 46 + length),
      ),
      normalized = archivePath(name),
      key = normalized.toLowerCase();
    if (folded.has(key)) throw Error('ZIP 存在重复或大小写冲突的路径。');
    folded.add(key);
    total += expanded;
    if (
      total > CLASSROOM_LIMITS.expandedBytes ||
      compressed > bytes.length ||
      local + 30 > start ||
      view.getUint32(local, true) !== 0x04034b50
    )
      throw Error('ZIP 展开后过大或条目损坏。');
    const localLength = view.getUint16(local + 26, true),
      localExtra = view.getUint16(local + 28, true),
      payload = local + 30 + localLength + localExtra;
    if (
      view.getUint16(local + 6, true) !== flags ||
      view.getUint16(local + 8, true) !== method ||
      payload + compressed > start ||
      new TextDecoder('utf-8', { fatal: true }).decode(
        bytes.subarray(local + 30, local + 30 + localLength),
      ) !== name
    )
      throw Error('ZIP 本地条目与目录不一致。');
    entries.set(name, { normalized, expanded, checksum, directory: name.endsWith('/') });
    position += 46 + length + extra + comment;
  }
  if (position !== end) throw Error('ZIP 目录长度无效。');
  return entries;
}
export async function unpackClassroomZip(bytes, { signal } = {}) {
  if (!(bytes instanceof Uint8Array) || bytes.length > CLASSROOM_LIMITS.compressedBytes)
    throw Error('每个 ZIP 压缩文件最多 4 MiB。');
  const entries = directory(bytes),
    files = [],
    seen = new Set(),
    active = [];
  let total = 0;
  const deadline = Date.now() + 15_000;
  const unzip = new Unzip((file) => {
    const entry = entries.get(file.name);
    if (!entry || seen.has(file.name)) throw Error('ZIP 出现未声明或重复条目。');
    seen.add(file.name);
    active.push(file);
    const chunks = [];
    let size = 0;
    file.ondata = (error, chunk, final) => {
      if (error) throw error;
      size += chunk.length;
      total += chunk.length;
      if (size > entry.expanded || total > CLASSROOM_LIMITS.expandedBytes)
        throw Error('ZIP 实际展开内容超过限制。');
      chunks.push(chunk);
      if (final) {
        if (size !== entry.expanded) throw Error('ZIP 大小校验失败。');
        const data = new Uint8Array(size);
        let offset = 0;
        for (const item of chunks) {
          data.set(item, offset);
          offset += item.length;
        }
        if (crc(data) !== entry.checksum) throw Error('ZIP 校验失败。');
        if (!entry.directory) files.push({ path: entry.normalized, bytes: data });
      }
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  try {
    for (let offset = 0; offset < bytes.length; offset += 128) {
      if (signal?.aborted) throw new DOMException('已取消', 'AbortError');
      if (Date.now() > deadline) throw Error('ZIP 处理超时。');
      unzip.push(bytes.subarray(offset, offset + 128), offset + 128 >= bytes.length);
      if (offset % 8192 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
    }
    if (seen.size !== entries.size) throw Error('ZIP 条目不完整。');
    return files;
  } finally {
    for (const file of active) file.terminate();
  }
}
