'use client';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { CLASSROOM_LIMITS, unpackClassroomZip } from '../lib/classroom-archive.mjs';
import { safeCsvCell } from './counter-insights-export.mjs';
type Row = {
  name: string;
  files: number;
  total: number;
  code: number;
  comment: number;
  blank: number;
  skipped: number;
  error: string;
};
export default function CounterClassroom() {
  const [rows, setRows] = useState<Row[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [progress, setProgress] = useState('');
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function inspect(event: ChangeEvent<HTMLInputElement>) {
    const archives = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!archives.length) return;
    if (archives.length > CLASSROOM_LIMITS.archives) {
      setError('每次最多选择 20 个 ZIP。');
      return;
    }
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setError('');
    setRows([]);
    try {
      for (let index = 0; index < archives.length; index++) {
        abort.signal.throwIfAborted();
        const archive = archives[index];
        setProgress(`正在统计 ${index + 1} / ${archives.length} 份作业`);
        const row: Row = {
          name: archive.name.replace(/\.zip$/iu, ''),
          files: 0,
          total: 0,
          code: 0,
          comment: 0,
          blank: 0,
          skipped: 0,
          error: '',
        };
        try {
          if (!/\.zip$/iu.test(archive.name) || archive.size > CLASSROOM_LIMITS.compressedBytes)
            throw Error('只支持不超过 4 MiB 的 ZIP。');
          const files = await unpackClassroomZip(new Uint8Array(await archive.arrayBuffer()), {
            signal: abort.signal,
          });
          let chunk: { path: string; contentBase64: string }[] = [],
            size = 0;
          async function send() {
            if (!chunk.length) return;
            const response = await fetch('/api/code-count', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ files: chunk }),
              signal: AbortSignal.any([abort.signal, AbortSignal.timeout(30_000)]),
            });
            const data = (await response.json()) as {
              totals: Omit<Row, 'name' | 'skipped' | 'error'>;
              skipped: unknown[];
              errors: unknown[];
              error?: { message?: string };
            };
            if (!response.ok) throw Error(data.error?.message || '统计服务失败');
            for (const key of ['files', 'total', 'code', 'comment', 'blank'] as const)
              row[key] += data.totals[key];
            row.skipped += data.skipped.length;
            if (data.errors.length) row.error = '部分源码处理失败';
            chunk = [];
            size = 0;
          }
          for (const file of files) {
            if (chunk.length >= 100 || size + file.bytes.length > 4 * 1024 * 1024) await send();
            if (file.bytes.length > 4 * 1024 * 1024) {
              row.skipped++;
              continue;
            }
            let binary = '';
            for (let n = 0; n < file.bytes.length; n += 8192)
              binary += String.fromCharCode(...file.bytes.subarray(n, n + 8192));
            chunk.push({ path: file.path, contentBase64: btoa(binary) });
            size += file.bytes.length;
          }
          await send();
        } catch (failure) {
          if (abort.signal.aborted) throw failure;
          row.error = failure instanceof Error ? failure.message : '无法处理此作业';
        }
        setRows((previous) => [...previous, row]);
      }
    } catch (failure) {
      setError(
        abort.signal.aborted
          ? '批量统计已取消，已完成的行仍可导出。'
          : failure instanceof Error
            ? failure.message
            : '批量统计失败',
      );
    } finally {
      setBusy(false);
      setProgress('');
    }
  }
  function exportCsv() {
    const text =
      '\uFEFF' +
      [
        ['作业名', '源码文件', '总行数', '代码', '注释', '空白', '跳过', '异常'],
        ...rows.map((row) => [
          row.name,
          row.files,
          row.total,
          row.code,
          row.comment,
          row.blank,
          row.skipped,
          row.error,
        ]),
      ]
        .map((row) => row.map(safeCsvCell).join(','))
        .join('\r\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'classroom-summary.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section className="panel counter-classroom" aria-label="班级批量统计">
      <h2>班级作业汇总</h2>
      <p>
        每个学生一份 ZIP，一次最多 20 份。每份压缩包最多 4 MiB、展开 8 MiB、200
        个条目；不支持加密、链接、多卷或 ZIP64。源码只发送本站统计服务，作业名取自本地文件名。
      </p>
      <label>
        选择学生作业 ZIP
        <input
          type="file"
          accept=".zip,application/zip"
          multiple
          disabled={busy}
          onChange={(event) => void inspect(event)}
        />
      </label>
      {busy && (
        <button className="button secondary" onClick={() => controller.current?.abort()}>
          取消批量统计
        </button>
      )}
      <p role="status">{progress}</p>
      {error && <p role="alert">{error}</p>}
      {rows.length > 0 && (
        <>
          <button className="button secondary" onClick={exportCsv}>
            导出全班汇总 CSV
          </button>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>作业</th>
                  <th>文件</th>
                  <th>代码行</th>
                  <th>跳过</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={index}>
                    <td>{row.name}</td>
                    <td>{row.files}</td>
                    <td>{row.code}</td>
                    <td>{row.skipped}</td>
                    <td>{row.error || '完成'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
