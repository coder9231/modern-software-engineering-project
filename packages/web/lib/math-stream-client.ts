import { normalizeOptions, type MathOptions, type Question, type Worksheet } from '@se-lab/core/math';
export async function readWorksheetStream(
  response: Response,
  onProgress: (generated: number, requested: number, preview: Question[]) => void,
  signal: AbortSignal,
): Promise<Worksheet> {
  if (!response.ok) {
    const error = (await response.json()) as { error?: { message?: string } };
    throw Error(error.error?.message || '出题请求失败。');
  }
  if (!response.body || !response.headers.get('content-type')?.includes('application/x-ndjson'))
    throw Error('出题服务未返回增量数据。');
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let buffer = '',
    seed = '',
    options: Worksheet['options'] | null = null,
    complete = false;
  const questions: Question[] = [],
    ids = new Set<string>();
  function consume(line: string) {
    if (!line.trim()) return;
    const data = JSON.parse(line) as {
      type?: unknown;
      seed?: unknown;
      options?: unknown;
      requested?: unknown;
      questions?: unknown;
      generated?: unknown;
      message?: unknown;
    };
    if (complete) throw Error('完成标记后出现额外数据。');
    if (data.type === 'error') throw Error(typeof data.message === 'string' ? data.message : '生成失败。');
    if (data.type === 'meta') {
      if (options || typeof data.seed !== 'string' || !data.options || typeof data.options !== 'object')
        throw Error('出题元信息无效。');
      seed = data.seed;
      options = normalizeOptions(data.options as MathOptions);
      if (options.seed !== seed || options.count !== data.requested) throw Error('出题元信息不一致。');
      return;
    }
    if (!options) throw Error('题目数据缺少元信息。');
    if (data.type === 'questions') {
      if (!Array.isArray(data.questions) || data.questions.length > 32) throw Error('题目数据块无效。');
      for (const item of data.questions as unknown[]) {
        if (!item || typeof item !== 'object') throw Error('题目无效。');
        const q = item as Question;
        if (
          typeof q.id !== 'string' ||
          typeof q.expression !== 'string' ||
          typeof q.answer !== 'string' ||
          typeof q.canonical !== 'string' ||
          (q.kind !== 'normal' && q.kind !== 'remainder') ||
          ids.has(q.id) ||
          q.expression.length > 256 ||
          q.answer.length > 256 ||
          q.canonical.length > 8192
        )
          throw Error('题目格式无效。');
        ids.add(q.id);
        questions.push(q);
      }
      if (
        questions.length > options.count ||
        data.generated !== questions.length ||
        data.requested !== options.count
      )
        throw Error('题目进度不一致。');
      onProgress(questions.length, options.count, questions.slice(0, 12));
      return;
    }
    if (data.type === 'complete' && data.generated === options.count && questions.length === options.count) {
      complete = true;
      return;
    }
    throw Error('生成数据不完整。');
  }
  try {
    while (true) {
      signal.throwIfAborted();
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        if (line.length > 512 * 1024) throw Error('数据块超过上限。');
        consume(line);
      }
      if (buffer.length > 512 * 1024) throw Error('数据块超过上限。');
    }
    buffer += decoder.decode();
    if (buffer.trim()) consume(buffer);
    if (!complete || !options) throw Error('连接中断，未完成的练习卷已丢弃。');
    return { seed, options, questions };
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
}
