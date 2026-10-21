import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { analyzePython } from '../../website/lib/code-counter/python.mjs';

const examples = [
  {
    name: 'ordinary strings and docstrings preserve existing physical-line policy',
    source: ['# header', 'value = "# text" # trailing', '"""docs', '# doc', '  ', 'end"""', '# tail'].join('\n'),
    expected: { total: 7, code: 4, comment: 2, blank: 1 },
  },
  {
    name: 'replacement comments ignore braces and quotes until the physical newline',
    source: ['message = f"""literal # text', '{', ' # real } """ f"', ' data["# key"] # inline', '}', '# literal', '"""', '# tail'].join('\n'),
    expected: { total: 8, code: 6, comment: 2, blank: 0 },
  },
  {
    name: 'short f-strings permit multiline expressions and same-quote nested strings in Python 3.12',
    source: ['value = f"{', ' # }" is a comment', ' data["key"]', '}"', '# final'].join('\n'),
    expected: { total: 5, code: 3, comment: 2, blank: 0 },
  },
  {
    name: 'nested f-strings can reuse outer quotes and contain expression comments',
    source: ['result = f"""{f"{', ' # nested', ' data["#"]', '}"}"""', '# final'].join('\n'),
    expected: { total: 5, code: 3, comment: 2, blank: 0 },
  },
  {
    name: 'doubled literal braces never open expression comment mode',
    source: ['text = f"""{{', '# literal', '}} {value}', '"""', '# comment'].join('\n'),
    expected: { total: 5, code: 4, comment: 1, blank: 0 },
  },
  {
    name: 'format spec hashes are literal while nested fields contain real comments',
    source: ['value = f"""{amount:', '#0{(', ' # nested expression', ' width', ')}', '}"""', '# tail'].join('\n'),
    expected: { total: 7, code: 5, comment: 2, blank: 0 },
  },
  {
    name: 'dict, slicing, walrus and lambda colons inside parentheses are expression syntax',
    source: ['value = f"""{(', ' # expression', ' {"#": values[1:3], "v": (n := 2), "fn": (lambda x: x)}', ')["#"]!r:>{width}}', '"""', '# final'].join('\n'),
    expected: { total: 6, code: 4, comment: 2, blank: 0 },
  },
  {
    name: 'debug equals, not-equals and conversion do not hide the next comment',
    source: ['value = f"""{(', ' # comment', ' left != right', ')=!r:>{width}}"""', '# tail'].join('\n'),
    expected: { total: 5, code: 3, comment: 2, blank: 0 },
  },
  {
    name: 'ordinary triple strings nested in expressions protect their hash contents',
    source: ['value = f"""{(', " '''nested", '# string content', " end'''", ' # expression comment', ')}"""', '# final'].join('\n'),
    expected: { total: 7, code: 5, comment: 2, blank: 0 },
  },
  {
    name: 'blank physical lines stay blank in literal and expression modes',
    source: ['value = f"""literal', ' \t', '{', '\t', '# expression comment', ' 1', '}', '"""', ''].join('\n'),
    expected: { total: 8, code: 5, comment: 1, blank: 2 },
  },
  {
    name: 'non-raw Unicode name escapes protect their own braces',
    source: ['value = f"""\\N{LEFT CURLY BRACKET}', '# literal content', '{', '# actual expression comment', ' value', '}"""', '# final'].join('\n'),
    expected: { total: 7, code: 5, comment: 2, blank: 0 },
  },
  {
    name: 'a backslash before a field brace does not escape the replacement field',
    source: [String.raw`value = rf"""\{`, '# actual expression comment', ' value', '}"""', '# final'].join('\n'),
    expected: { total: 5, code: 3, comment: 2, blank: 0 },
  },
  {
    name: 'backslash-containing nested strings cannot leak comment mode',
    source: ['value = f"""{', ' "\\n".join(items)', ' # actual expression comment', '}"""', '# final'].join('\n'),
    expected: { total: 5, code: 3, comment: 2, blank: 0 },
  },
  {
    name: 'raw nested strings protect escaped quotes and literal hashes',
    source: ['value = f"""{(', String.raw` r"quoted \" # still string"`, ' # expression comment', ')}"""', '# final'].join('\n'),
    expected: { total: 5, code: 3, comment: 2, blank: 0 },
  },
  {
    name: 'a format field can resume literal braces after its closing delimiter',
    source: ['value = f"""{number:>{(', ' # nested expression comment', ' width', ')}}}}', '# still outer literal', '"""', '# final'].join('\n'),
    expected: { total: 7, code: 5, comment: 2, blank: 0 },
  },
];

for (const example of examples) {
  test(`Python: ${example.name}`, () => {
    const counts = analyzePython(example.source);
    assert.deepEqual(counts, example.expected);
    assert.equal(counts.total, counts.code + counts.comment + counts.blank);
  });
}

test('Python: f/fr/rf prefixes are case insensitive with both triple quote styles', () => {
  for (const prefix of ['f', 'F', 'fr', 'fR', 'Fr', 'FR', 'rf', 'rF', 'Rf', 'RF']) {
    for (const quote of ['"""', "'''"]) {
      const source = [`value = ${prefix}${quote}{`, '# expression comment', 'value', `}${quote}`, '# final'].join('\n');
      assert.deepEqual(analyzePython(source), { total: 5, code: 3, comment: 2, blank: 0 }, `${prefix}${quote}`);
    }
  }
});

test('Python: raw and bytes prefixes never create f-string expression mode', () => {
  for (const prefix of ['r', 'R', 'b', 'B', 'br', 'BR', 'rb', 'rB', 'u', 'U']) {
    const source = [`value = ${prefix}"""{`, '# string content', '}"""', '# final'].join('\n');
    assert.deepEqual(analyzePython(source), { total: 4, code: 3, comment: 1, blank: 0 });
  }
});

test('Python: physical line counts are independent of newline convention', () => {
  for (const newline of ['\n', '\r\n', '\r']) {
    assert.deepEqual(analyzePython(['value = f"{', '# expression comment', '1', '}"', ''].join(newline)), {
      total: 4, code: 3, comment: 1, blank: 0,
    });
  }
  assert.deepEqual(analyzePython(''), { total: 0, code: 0, comment: 0, blank: 0 });
  assert.deepEqual(analyzePython('\n'), { total: 1, code: 0, comment: 0, blank: 1 });
  assert.throws(() => analyzePython(null), TypeError);
});

test('Python: short strings recover at invalid newlines and preserve explicit continuations', () => {
  assert.deepEqual(analyzePython(['value = "unfinished', '# independent comment'].join('\n')), {
    total: 2, code: 1, comment: 1, blank: 0,
  });
  for (const prefix of ['', 'r', 'f', 'rf']) {
    assert.deepEqual(analyzePython([`value = ${prefix}"continued\\`, '# literal"', '# real'].join('\n')), {
      total: 3, code: 2, comment: 1, blank: 0,
    });
  }
});

test('Python: deeply nested fields use an iterative stack and malformed EOF remains countable', () => {
  const depth = 15000;
  assert.deepEqual(analyzePython(`value = ${'f"{'.repeat(depth)}1${'}"'.repeat(depth)}\n# tail`), {
    total: 2, code: 1, comment: 1, blank: 0,
  });
  assert.deepEqual(analyzePython('value = f"""{\n# unfinished expression'), {
    total: 2, code: 1, comment: 1, blank: 0,
  });
});

// Set CODE_COUNTER_PYTHON to a Python >=3.12 executable for an independent
// tokenizer oracle. The regular Node suite never requires Python to be present.
test('Python: valid fixtures agree with Python 3.12+ tokenize', { skip: !process.env.CODE_COUNTER_PYTHON }, () => {
  const oracle = String.raw`
import io, json, sys, token, tokenize
if sys.version_info < (3, 12):
    raise RuntimeError("Python 3.12 or newer is required")
results = []
for source in json.load(sys.stdin):
    lines = source.splitlines()
    marks = [set() for _ in lines]
    ignored = {token.ENCODING, token.ENDMARKER, token.INDENT, token.DEDENT, token.NEWLINE, tokenize.NL}
    for item in tokenize.generate_tokens(io.StringIO(source).readline):
        if item.type in ignored or (item.type == token.ERRORTOKEN and not item.string.strip()):
            continue
        kind = 'comment' if item.type == token.COMMENT else 'code'
        end = item.end[0] - (item.end[1] == 0)
        for line in range(item.start[0], end + 1):
            if 0 < line <= len(marks): marks[line - 1].add(kind)
    counts = dict(total=len(lines), code=0, comment=0, blank=0)
    for line, mark in zip(lines, marks):
        kind = 'blank' if not line.strip() else 'code' if 'code' in mark else 'comment' if 'comment' in mark else 'code'
        counts[kind] += 1
    results.append(counts)
json.dump(results, sys.stdout)
`;
  const oracleProcess = spawnSync(process.env.CODE_COUNTER_PYTHON, ['-c', oracle], {
    input: JSON.stringify(examples.map((example) => example.source)), encoding: 'utf8', timeout: 15000,
  });
  assert.equal(oracleProcess.status, 0, oracleProcess.stderr || oracleProcess.error?.message);
  assert.deepEqual(JSON.parse(oracleProcess.stdout), examples.map((example) => analyzePython(example.source)));
});
