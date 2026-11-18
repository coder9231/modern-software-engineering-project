'use client';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import type { Report } from '../lib/code-count-service.mjs';
import type { ProjectQualityReport, ReportComparison } from '@se-lab/core/quality';
import { comparisonToCsv } from './counter-insights-export.mjs';
import './counter-insights.css';
type Props = {
  report: Report | null;
  uploads: { path: string; file: File }[];
  options: { encoding: string; useDefaultExcludes: boolean; exclude: string[]; extensions: string[] };
};
const message = (e: unknown) => (e instanceof Error ? e.message : '操作失败，请稍后重试。');
function download(value: string, type: string, name: string) {
  const url = URL.createObjectURL(new Blob([value], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function CounterInsights({ report, uploads, options }: Props) {
  const [quality, setQuality] = useState<ProjectQualityReport | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [before, setBefore] = useState<unknown>(null),
    [after, setAfter] = useState<unknown>(null),
    [comparison, setComparison] = useState<ReportComparison | null>(null);
  const controller = useRef<AbortController | null>(null);
  const optionsKey = JSON.stringify(options);
  useEffect(() => {
    controller.current?.abort();
    controller.current = null;
    const frame = requestAnimationFrame(() => {
      setQuality(null);
      setBusy(false);
      setError('');
    });
    return () => {
      cancelAnimationFrame(frame);
      controller.current?.abort();
      controller.current = null;
    };
  }, [uploads, optionsKey]);
  async function inspect() {
    if (!uploads.length) return;
    if (uploads.length > 100 || uploads.reduce((n, item) => n + item.file.size, 0) > 4 * 1024 * 1024) {
      setError('质量分析每次最多 100 个文件、4 MiB；请缩小选择范围。');
      return;
    }
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setError('');
    const timeout = setTimeout(() => abort.abort(), 30_000);
    try {
      const files = [];
      for (const item of uploads) {
        if (abort.signal.aborted) return;
        const bytes = new Uint8Array(await item.file.arrayBuffer());
        let binary = '';
        for (let i = 0; i < bytes.length; i += 8192)
          binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
        files.push({ path: item.path, contentBase64: btoa(binary) });
      }
      const response = await fetch('/api/code-quality', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files, options }),
        signal: abort.signal,
      });
      const data = (await response.json()) as ProjectQualityReport & { error?: { message?: string } };
      if (!response.ok) throw Error(data.error?.message || '质量分析失败');
      if (controller.current === abort && !abort.signal.aborted) setQuality(data as ProjectQualityReport);
    } catch (e) {
      if (controller.current === abort)
        setError(abort.signal.aborted ? '质量分析已取消或超时，原统计报告保持不变。' : message(e));
    } finally {
      clearTimeout(timeout);
      if (controller.current === abort) {
        controller.current = null;
        setBusy(false);
      }
    }
  }
  async function load(event: ChangeEvent<HTMLInputElement>, side: 'before' | 'after') {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    setComparison(null);
    try {
      if (file.size > 8 * 1024 * 1024) throw Error('每份报告最多 8 MiB。');
      const data: unknown = JSON.parse(await file.text());
      if (side === 'before') setBefore(data);
      else setAfter(data);
    } catch (e) {
      setError(message(e));
    }
  }
  async function compare() {
    setError('');
    try {
      const { compareReports } = await import('@se-lab/core/quality');
      setComparison(compareReports(before, after));
    } catch (e) {
      setError(message(e));
    }
  }
  return (
    <section className="counter-insights" aria-label="代码质量与版本对比">
      <section className="panel">
        <h2>从规模，进一步观察质量</h2>
        <p>
          教学用启发式指标：文件级复杂度估计不是完整 McCabe
          分析，规范化片段重复率不能用作抄袭判定。每次最多分析 1 Mi 字符。
        </p>
        <button className="button secondary" disabled={!uploads.length || busy} onClick={inspect}>
          {busy ? '正在分析…' : '分析所选源码质量'}
        </button>
        {busy && (
          <button className="button text-button" onClick={() => controller.current?.abort()}>
            取消分析
          </button>
        )}
        {!uploads.length && <p>选择源码文件后可分析；内置示例只提供行数报告。</p>}
        {quality && (
          <>
            <p role="status">
              重复行率 {(quality.duplication.ratio * 100).toFixed(1)}% · {quality.files.length} 个文件 ·{' '}
              {quality.excludedFiles.length} 个文件未参与重复分析
            </p>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>文件</th>
                    <th>复杂度估计</th>
                    <th>纯注释率</th>
                  </tr>
                </thead>
                <tbody>
                  {quality.files.slice(0, 100).map((file) => (
                    <tr key={file.path}>
                      <td>
                        {file.path}
                        {file.warnings.length > 0 && <p>{file.warnings.join('；')}</p>}
                      </td>
                      <td>{file.complexity.estimate ?? '不可用'}</td>
                      <td>{(file.commentRatio * 100).toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
      <section className="panel">
        <h2>比较两次项目统计</h2>
        <p>导入两份本站 JSON 报告，比较规模和文件变化。等行数修改与文件重命名不能由行数报告识别。</p>
        <div className="counter-compare-inputs">
          <label>
            基准报告
            <input type="file" accept=".json,application/json" onChange={(e) => void load(e, 'before')} />
          </label>
          <label>
            新版本报告
            <input type="file" accept=".json,application/json" onChange={(e) => void load(e, 'after')} />
          </label>
        </div>
        <div className="counter-insights-actions">
          <button
            className="button secondary"
            disabled={!report}
            onClick={() => {
              setBefore(report);
              setComparison(null);
            }}
          >
            当前结果设为基准
          </button>
          <button
            className="button secondary"
            disabled={!report}
            onClick={() => {
              setAfter(report);
              setComparison(null);
            }}
          >
            当前结果设为新版本
          </button>
          <button className="button primary" disabled={!before || !after} onClick={compare}>
            生成差异报告
          </button>
        </div>
        <p aria-live="polite">
          基准：{before ? '已载入' : '待选择'} · 新版本：{after ? '已载入' : '待选择'}
        </p>
        {comparison && (
          <>
            <p role="status">
              代码行变化 {comparison.delta.code > 0 ? '+' : ''}
              {comparison.delta.code} · 新增 {comparison.files.added.length} · 删除{' '}
              {comparison.files.removed.length} · 规模变化 {comparison.files.changed.length} · 行数相同{' '}
              {comparison.files.unchanged}
            </p>
            <div className="counter-insights-actions">
              <button
                className="button secondary"
                onClick={() =>
                  download(JSON.stringify(comparison, null, 2), 'application/json', 'comparison.json')
                }
              >
                导出差异 JSON
              </button>
              <button
                className="button secondary"
                onClick={() =>
                  download(comparisonToCsv(comparison), 'text/csv;charset=utf-8', 'comparison.csv')
                }
              >
                导出差异 CSV
              </button>
            </div>
            <ul>
              {comparison.languages.map((item) => (
                <li key={item.language}>
                  {item.language}：{item.before.code} → {item.after.code}（{item.delta.code > 0 ? '+' : ''}
                  {item.delta.code}）
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
      {error && (
        <p className="message error-message" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
