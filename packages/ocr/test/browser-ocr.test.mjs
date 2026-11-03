import assert from 'node:assert/strict';
import test from 'node:test';
import { getBrowserOCRStatus, prepareBrowserOCRText, recognizeBrowserImage } from '@se-lab/ocr/browser';

const manifest = {
  version: 1,
  engineVersion: '7.0.0',
  assets: [
    'worker.min.js',
    'core/tesseract-core-lstm.wasm.js',
    'core/tesseract-core-lstm.wasm',
    'lang/eng.traineddata.gz',
  ].map((path) => ({ path })),
};
const fetchReady = async () => Response.json(manifest);
const image = new Blob(['fixture'], { type: 'image/png' });

test('normalizes mathematical punctuation but preserves ambiguous characters for review', () => {
  assert.deepEqual(prepareBrowserOCRText('１２ × ２ ＝ ２４\r\nO + 1 = 1\n', 91), {
    text: '12 * 2 = 24\nO + 1 = 1',
    rows: 2,
    confidence: 91,
    uncertain: [2],
  });
});
test('never silently drops malformed OCR lines or excessive text', () => {
  assert.deepEqual(prepareBrowserOCRText('Exercise 1\n1 + 2 = 3', 95).uncertain, [1]);
  assert.throws(() => prepareBrowserOCRText('  \n'), { code: 'no_text' });
  assert.throws(() => prepareBrowserOCRText('1=1\n'.repeat(101)), { code: 'too_many_lines' });
  assert.throws(() => prepareBrowserOCRText('1'.repeat(514)), { code: 'too_many_lines' });
});
test('asset status accepts prepared local resources and rejects HTML fallbacks or incomplete manifests', async () => {
  assert.equal((await getBrowserOCRStatus({ fetchImpl: fetchReady })).available, true);
  assert.equal(
    (await getBrowserOCRStatus({ fetchImpl: async () => new Response('<html>fallback</html>') })).available,
    false,
  );
  assert.equal(
    (await getBrowserOCRStatus({ fetchImpl: async () => Response.json({ ...manifest, assets: [] }) }))
      .available,
    false,
  );
});
test('OCR uses only local paths and releases the worker after success', async () => {
  let terminations = 0;
  const result = await recognizeBrowserImage(image, {
    fetchImpl: fetchReady,
    validateImage: async () => {},
    createWorker: async (language, engine, options) => {
      assert.equal(language, 'eng');
      assert.equal(engine, 1);
      assert.equal(options.workerPath, '/ocr/worker.min.js');
      assert.equal(options.langPath, '/ocr/lang');
      assert.equal(options.corePath, '/ocr/core');
      return {
        setParameters: async () => {},
        recognize: async (received) => {
          assert.equal(received, image);
          return { data: { text: '1+2=3', confidence: 90 } };
        },
        terminate: async () => {
          terminations++;
        },
      };
    },
  });
  assert.equal(result.text, '1+2=3');
  assert.equal(terminations, 1);
});
test('initialization cancellation rejects promptly and terminates a late worker', async () => {
  const controller = new AbortController();
  let resolveCreation;
  let initialized;
  const init = new Promise((resolve) => {
    initialized = resolve;
  });
  let terminations = 0;
  const result = recognizeBrowserImage(image, {
    signal: controller.signal,
    fetchImpl: fetchReady,
    validateImage: async () => {},
    createWorker: () => {
      initialized();
      return new Promise((resolve) => {
        resolveCreation = resolve;
      });
    },
  });
  await init;
  controller.abort();
  await assert.rejects(result, { name: 'AbortError' });
  resolveCreation({
    setParameters: async () => {},
    recognize: async () => {
      throw new Error('must not recognise');
    },
    terminate: async () => {
      terminations++;
    },
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(terminations, 1);
});
test('recognition cancellation terminates once and cannot return stale text', async () => {
  const controller = new AbortController();
  let started;
  const recognizing = new Promise((resolve) => {
    started = resolve;
  });
  let terminations = 0;
  const result = recognizeBrowserImage(image, {
    signal: controller.signal,
    fetchImpl: fetchReady,
    validateImage: async () => {},
    createWorker: async () => ({
      setParameters: async () => {},
      recognize: () => {
        started();
        return new Promise(() => {});
      },
      terminate: async () => {
        terminations++;
      },
    }),
  });
  await recognizing;
  controller.abort();
  await assert.rejects(result, { name: 'AbortError' });
  assert.equal(terminations, 1);
});
test('engine failures release workers and missing assets never start one', async () => {
  let created = 0,
    terminated = 0;
  const createWorker = async () => {
    created++;
    return {
      setParameters: async () => {},
      recognize: async () => {
        throw new Error('decode failed');
      },
      terminate: async () => {
        terminated++;
      },
    };
  };
  await assert.rejects(
    recognizeBrowserImage(image, { fetchImpl: fetchReady, validateImage: async () => {}, createWorker }),
    /decode failed/,
  );
  assert.equal(terminated, 1);
  await assert.rejects(
    recognizeBrowserImage(image, { fetchImpl: async () => new Response('', { status: 404 }), createWorker }),
    { code: 'assets_missing' },
  );
  assert.equal(created, 1);
});
