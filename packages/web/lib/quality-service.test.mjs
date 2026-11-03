import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeQualityUploads, analyzeUploads, HttpError, getConfig } from './code-count-service.mjs';
const upload = (path, source) => ({ path, contentBase64: Buffer.from(source).toString('base64') });
test('quality endpoint reuses language, filtering and encoding validation', () => {
  const result = analyzeQualityUploads({
    files: [
      upload('lesson.go', '// lesson\nfunc main() { if ready { run() } }\n'),
      upload('node_modules/lib.go', 'bad'),
    ],
  });
  assert.equal(result.files.length, 1);
  assert.equal(result.files[0].language, 'Go');
  assert.ok(result.files[0].complexity.estimate >= 2);
  assert.throws(() => analyzeQualityUploads({ files: [upload('../escape.go', 'x')] }), HttpError);
});
test('directory depth is bounded before source decoding and analysis', () => {
  assert.equal(getConfig().limits.maxDirectoryDepth, 32);
  assert.throws(
    () => analyzeUploads({ files: [upload('a/'.repeat(33) + 'x.go', 'x')] }),
    (error) => error instanceof HttpError && error.code === 'path_too_deep',
  );
  assert.equal(analyzeUploads({ files: [upload('a/'.repeat(32) + 'x.go', 'x')] }).totals.files, 1);
});
