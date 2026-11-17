'use client';

import { useEffect, useRef, useState } from 'react';
import type { LineAnalysis, LineExplanation } from '@se-lab/core/counter';
import './counter-line-explainer.css';

type Props = {
  uploads: { path: string; file: File }[];
  options: { encoding: string; useDefaultExcludes: boolean; exclude: string[]; extensions: string[] };
};
type Result = LineAnalysis & { path: string; file: File; optionsKey: string };
const labels = { code: '代码行', comment: '注释行', blank: '空白行' };
const reasons: Record<LineExplanation['reason'], string> = {
  code: '本行包含代码记号，计为代码行。',
  comment: '本行只有注释，没有代码，计为注释行。',
  whitespace: '本行为空或只有空白字符；即使位于跨行注释或字符串内部，也按空白行计入。',
  mixed: '本行同时包含代码和注释，按代码行计入一次。',
  literal: '本行包含字符串、模板文本或正则字面量；其中看起来像注释的符号仍属于代码。',
};
const pageSize = 50;

export default function CounterLineExplainer({ uploads, options }: Props) {
  const [path, setPath] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [page, setPage] = useState(1);
  const [focused, setFocused] = useState(1);
  const [pending, setPending] = useState<{ file: File; optionsKey: string } | null>(null);
  const [failure, setFailure] = useState<{ file: File; optionsKey: string; message: string } | null>(null);
  const controller = useRef<AbortController | null>(null);
  const files = uploads.filter((item) => /\.(?:js|mjs|cjs)$/iu.test(item.path));
  const source = files.find((item) => item.path === path) ?? files[0];
  const optionsKey = JSON.stringify(options);
  const busy = pending?.file === source?.file && pending?.optionsKey === optionsKey;
  const current = result?.file === source?.file && result?.optionsKey === optionsKey ? result : null;
  const error = failure?.file === source?.file && failure?.optionsKey === optionsKey ? failure.message : '';
  useEffect(
    () => () => {
      controller.current?.abort();
      controller.current = null;
    },
    [source?.file, optionsKey],
  );

  async function inspect() {
    if (!source) return;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setPending({ file: source.file, optionsKey });
    setResult(null);
    setFailure(null);
    const timeout = setTimeout(() => abort.abort(), 30_000);
    try {
      if (source.file.size > 128 * 1024)
        throw Error('原文件超过 128 KiB，请选择较小的文件查看逐行解释。普通统计仍可使用。');
      const bytes = new Uint8Array(await source.file.arrayBuffer());
      if (abort.signal.aborted) return;
      let binary = '';
      for (let start = 0; start < bytes.length; start += 32768)
        binary += String.fromCharCode(...bytes.subarray(start, start + 32768));
      const response = await fetch('/api/code-count/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abort.signal,
        body: JSON.stringify({ files: [{ path: source.path, contentBase64: btoa(binary) }], options }),
      });
      const data = (await response.json()) as LineAnalysis & { path: string; error?: { message?: string } };
      if (!response.ok) throw Error(data.error?.message || '逐行解释失败，请重试。');
      if (controller.current !== abort || abort.signal.aborted) return;
      setResult({ ...data, file: source.file, optionsKey });
      setPage(1);
      setFocused(1);
    } catch (e) {
      if (controller.current === abort)
        setFailure({
          file: source.file,
          optionsKey,
          message: abort.signal.aborted
            ? '读取已取消或超时，请重试。'
            : e instanceof Error
              ? e.message
              : '逐行解释失败，请重试。',
        });
    } finally {
      clearTimeout(timeout);
      if (controller.current === abort) setPending(null);
    }
  }
  const pages = Math.max(1, Math.ceil((current?.lines.length ?? 0) / pageSize));
  const activePage = Math.min(page, pages);
  const selectedLine = current?.lines.find((line) => line.line === focused);
  return (
    <section className="panel counter-lines" aria-label="JavaScript 逐行解释">
      <h2>每一行，为什么这样统计？</h2>
      <p>
        选择一个 JavaScript
        文件，查看代码、注释和空白行的判断依据。点击“逐行解释”会将该文件发送到本站分析，不执行或保存源码。解码后
        UTF-8 最多 64 KiB。
      </p>
      <div className="counter-lines-controls">
        <label>
          待解释文件
          <select
            value={source?.path ?? ''}
            disabled={!files.length}
            onChange={(event) => {
              controller.current?.abort();
              controller.current = null;
              setPending(null);
              setPath(event.target.value);
            }}
          >
            {!files.length && <option value="">请先选择 .js、.mjs 或 .cjs 文件</option>}
            {files.map((item) => (
              <option key={item.path} value={item.path}>
                {item.path}
              </option>
            ))}
          </select>
        </label>
        <button className="button secondary" disabled={!source || busy} onClick={inspect}>
          {busy ? '正在读取…' : '逐行解释'}
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {current && (
        <>
          <p aria-live="polite">
            总行数 {current.counts.total} = 代码 {current.counts.code} + 注释 {current.counts.comment} + 空白{' '}
            {current.counts.blank}
          </p>
          {current.method === 'scanner' && (
            <p className="counter-lines-warning">
              当前源码无法完整解析，已使用与普通统计相同的词法扫描。以下分类为尽力判断，请结合源码核对。
            </p>
          )}
          {current.lines.length === 0 ? (
            <p>这是空文件，没有物理行。</p>
          ) : (
            <>
              <div className="counter-lines-table">
                <table>
                  <caption>点击行号查看分类原因：{current.path}</caption>
                  <thead>
                    <tr>
                      <th>行号</th>
                      <th>分类</th>
                      <th>源码</th>
                    </tr>
                  </thead>
                  <tbody>
                    {current.lines.slice((activePage - 1) * pageSize, activePage * pageSize).map((line) => (
                      <tr key={line.line} data-kind={line.kind}>
                        <td>
                          <button
                            className="counter-line-number"
                            aria-label={`查看第 ${line.line} 行原因`}
                            aria-pressed={focused === line.line}
                            onClick={() => setFocused(line.line)}
                          >
                            {line.line}
                          </button>
                        </td>
                        <td>{labels[line.kind]}</td>
                        <td>
                          <pre>{line.text || ' '}</pre>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="counter-line-reason" aria-live="polite">
                {selectedLine && (
                  <>
                    第 {selectedLine.line} 行 · {labels[selectedLine.kind]}：{reasons[selectedLine.reason]}
                  </>
                )}
              </p>
              <nav className="counter-lines-pagination" aria-label="源码逐行分页">
                <button
                  className="button secondary"
                  disabled={activePage === 1}
                  onClick={() => {
                    setPage(activePage - 1);
                    setFocused((activePage - 2) * pageSize + 1);
                  }}
                >
                  上一页
                </button>
                <span>
                  第 {activePage} / {pages} 页
                </span>
                <button
                  className="button secondary"
                  disabled={activePage === pages}
                  onClick={() => {
                    setPage(activePage + 1);
                    setFocused(activePage * pageSize + 1);
                  }}
                >
                  下一页
                </button>
              </nav>
            </>
          )}
        </>
      )}
    </section>
  );
}
