import test from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, strToU8 } from 'fflate';
import { archivePath, unpackClassroomZip, CLASSROOM_LIMITS } from './classroom-archive.mjs';
test('ZIP streams through bounded memory and validates decoded files', async () => {
  const files = await unpackClassroomZip(
    zipSync({ 'src/main.go': strToU8('// lesson\npackage main\n'), 'note.txt': strToU8('hello') }),
  );
  assert.deepEqual(
    files.map((file) => file.path),
    ['src/main.go', 'note.txt'],
  );
  assert.match(new TextDecoder().decode(files[0].bytes), /package main/);
});
test('archive paths reject traversal, absolute, Windows and excessive depth', () => {
  for (const name of ['../a', '/a', 'a/../b', 'C:/a', 'a\\b', 'a//b', './a', 'a/'.repeat(34) + 'b', 'a\0b'])
    assert.throws(() => archivePath(name));
  assert.equal(archivePath('a/b.go'), 'a/b.go');
});
test('ZIP duplicate normalization, corrupt headers and expanded bombs are rejected', async () => {
  await assert.rejects(unpackClassroomZip(zipSync({ 'A.go': strToU8('a'), 'a.go': strToU8('b') })));
  await assert.rejects(unpackClassroomZip(new Uint8Array(40)));
  await assert.rejects(
    unpackClassroomZip(zipSync({ large: new Uint8Array(CLASSROOM_LIMITS.expandedBytes + 1) })),
    /过大/,
  );
});
test('archive cancellation and actual checksum mismatch do not return partial files', async () => {
  const abort = new AbortController();
  abort.abort();
  await assert.rejects(
    unpackClassroomZip(zipSync({ a: strToU8('x') }), { signal: abort.signal }),
    (error) => error.name === 'AbortError',
  );
  const zip = zipSync({ a: [strToU8('abc'), { level: 0 }] });
  zip[31] ^= 1;
  await assert.rejects(unpackClassroomZip(zip));
});
