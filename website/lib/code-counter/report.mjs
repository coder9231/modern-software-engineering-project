const SKIP_LABELS = {
  excluded: '已排除', unsupported_extension: '不支持的扩展名', extension_filter: '扩展名过滤',
  symbolic_link: '符号链接', too_large: '文件过大', binary: '含二进制数据',
  invalid_encoding: '无法按指定编码读取', unsupported_file_type: '特殊文件',
};

function displayWidth(text) {
  return [...String(text)].reduce((width, character) => width + (/[^\u0000-\u00ff]/u.test(character) ? 2 : 1), 0);
}

function table(headers, rows) {
  const values = [headers, ...rows].map((row) => row.map(String));
  const widths = headers.map((_, index) => values.reduce((width, row) => Math.max(width, displayWidth(row[index])), 0));
  return values.map((row, rowIndex) => row.map((value, index) => {
    const padding = ' '.repeat(widths[index] - displayWidth(value));
    return index > 0 && rowIndex > 0 ? `${padding}${value}` : `${value}${padding}`;
  }).join('  ').trimEnd()).join('\n');
}

export function formatText(report, { details = false } = {}) {
  const counts = (row) => [row.files, row.total, row.code, row.comment, row.blank];
  const lines = [
    '代码量统计', `路径：${report.input}`, '规则：物理行；总行数 = 代码行 + 注释行 + 空白行', '',
    table(['语言', '文件', '总行', '代码', '注释', '空白'], [
      ...report.languages.map((row) => [row.language, ...counts(row)]),
      ['合计', ...counts(report.totals)],
    ]),
  ];
  if (details) {
    lines.push('', '文件明细', table(['文件', '语言', '总行', '代码', '注释', '空白'],
      report.files.map((row) => [row.path, row.language, row.total, row.code, row.comment, row.blank])));
  }
  if (report.skipped.length) {
    const reasons = new Map();
    for (const item of report.skipped) reasons.set(item.reason, (reasons.get(item.reason) ?? 0) + 1);
    lines.push('', `跳过 ${report.skipped.length} 个条目（排除目录计为一个条目）：${[...reasons].map(([reason, count]) => `${SKIP_LABELS[reason] ?? reason} ${count}`).join('；')}`);
    if (details) for (const item of report.skipped) lines.push(`  ${item.path}：${SKIP_LABELS[item.reason] ?? item.reason}`);
  }
  if (report.errors.length) {
    lines.push('', `读取失败 ${report.errors.length} 个条目，结果不完整：`);
    for (const error of report.errors) lines.push(`  ${error.path}：${error.message}`);
  }
  if (!report.totals.files) lines.push('', '未找到符合条件的源文件。使用 --languages 查看支持的扩展名。');
  return `${lines.join('\n')}\n`;
}

function csvCell(value) {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function formatCsv(report) {
  const columns = ['path', 'language', 'total', 'code', 'comment', 'blank'];
  // Keep filenames as text when the CSV is opened in spreadsheet software.
  const safePath = (value) => /^[=+\-@\t\r\n]/.test(value) ? `'${value}` : value;
  const rows = [columns, ...report.files.map((file) => columns.map((key) => key === 'path' ? safePath(file[key]) : file[key]))];
  return `\ufeff${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

export function formatReport(report, format = 'text', options = {}) {
  if (format === 'json') return `${JSON.stringify(report, null, 2)}\n`;
  if (format === 'csv') return formatCsv(report);
  if (format === 'text') return formatText(report, options);
  throw new Error(`不支持的输出格式：${format}`);
}
