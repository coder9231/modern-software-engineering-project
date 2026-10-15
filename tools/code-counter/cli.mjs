#!/usr/bin/env node
import { lstat, mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { LANGUAGES } from './analyzer.mjs';
import { scanPath } from './scanner.mjs';
import { formatReport } from './report.mjs';

const HELP = `代码量统计工具 v0.1.0

用法：node tools/code-counter/cli.mjs [文件或目录] [选项]
默认统计当前目录，无需安装第三方依赖。

  --details                   显示文件明细和跳过原因
  --format text|json|csv       输出格式，默认 text
  --json                      --format json 的简写
  --output <文件>             保存报告（覆盖指定文件），父目录自动创建
  --exclude <模式>            排除路径；可重复，支持 *、**、?
  --extensions <扩展名列表>   例如 .py,.java 或 js,ts
  --encoding auto|utf8|gb18030 默认 auto：识别 BOM，否则使用 UTF-8
  --max-size <MB>             单文件大小上限，默认 10 MB
  --no-default-excludes       关闭依赖、版本库、构建目录的默认排除
  --languages                 列出支持的语言和扩展名
  --help, -h                  显示帮助
  --                          后续参数按路径处理，支持以 - 开头的路径

示例：
  node tools/code-counter/cli.mjs . --details
  node tools/code-counter/cli.mjs "D:/my project" --exclude "tests/**"
  node tools/code-counter/cli.mjs . --format json --output reports/code-count.json
  node tools/code-counter/cli.mjs . --extensions .py,.java --format csv

退出码：0 成功；1 参数、输入路径或输出错误；2 部分条目读取失败。
`;

function parseArguments(args) {
  const options = { exclude: [], extensions: [], ignoredPaths: [], format: 'text', details: false };
  let input;
  let positionalOnly = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!positionalOnly && argument === '--') {
      positionalOnly = true;
      continue;
    }
    if (!positionalOnly && argument.startsWith('-')) {
      if (argument === '--help' || argument === '-h') options.help = true;
      else if (argument === '--languages') options.languages = true;
      else if (argument === '--details') options.details = true;
      else if (argument === '--json') options.format = 'json';
      else if (argument === '--no-default-excludes') options.useDefaultExcludes = false;
      else if (['--format', '--output', '--exclude', '--extensions', '--encoding', '--max-size'].includes(argument)) {
        const value = args[index + 1];
        if (!value || value.startsWith('--')) throw new Error(`${argument} 缺少参数值。`);
        index += 1;
        if (argument === '--exclude') options.exclude.push(value);
        else if (argument === '--extensions') {
          options.extensions = value.split(',').map((extension) => extension.trim().toLowerCase()).map((extension) => extension.startsWith('.') ? extension : `.${extension}`);
          const supported = new Set(LANGUAGES.flatMap((language) => language.extensions));
          if (options.extensions.some((extension) => !supported.has(extension))) throw new Error('扩展名列表含有不支持的扩展名，请使用 --languages 查看。');
        } else if (argument === '--max-size') {
          const size = Number(value);
          options.maxBytes = Math.floor(size * 1024 * 1024);
          if (!Number.isFinite(size) || size <= 0 || !Number.isSafeInteger(options.maxBytes) || options.maxBytes < 1) throw new Error('--max-size 必须是大于零的有效 MB 数值。');
        } else options[argument.slice(2)] = value;
      } else throw new Error(`未知选项：${argument}。使用 --help 查看用法。`);
    } else {
      if (input !== undefined) throw new Error('一次只能统计一个文件或目录。');
      input = argument;
    }
  }
  if (!['text', 'json', 'csv'].includes(options.format)) throw new Error('--format 只能是 text、json 或 csv。');
  if (options.encoding && !['auto', 'utf8', 'gb18030'].includes(options.encoding)) throw new Error('--encoding 只能是 auto、utf8 或 gb18030。');
  return { input: input ?? '.', options };
}

async function main() {
  const { input, options } = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(HELP);
    return;
  }
  if (options.languages) {
    process.stdout.write(`${LANGUAGES.map((language) => `${language.name}: ${language.extensions.join(', ')}`).join('\n')}\n`);
    return;
  }
  if (options.output) {
    const output = path.resolve(options.output);
    const inputPath = path.resolve(input);
    const samePath = process.platform === 'win32'
      ? output.toLowerCase() === inputPath.toLowerCase()
      : output === inputPath;
    if (samePath) throw new Error('输出文件不能覆盖统计输入。');
    try {
      const outputInfo = await lstat(output, { bigint: true });
      if (outputInfo.isSymbolicLink()) throw new Error('输出文件不能是符号链接。');
      const inputInfo = await stat(inputPath, { bigint: true });
      if (outputInfo.dev === inputInfo.dev && outputInfo.ino !== 0n && outputInfo.ino === inputInfo.ino) {
        throw new Error('输出文件不能覆盖统计输入的硬链接或路径别名。');
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    options.ignoredPaths.push(output);
  }
  const report = await scanPath(input, options);
  const content = formatReport(report, options.format, options);
  if (options.output) {
    const output = path.resolve(options.output);
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(output, content, 'utf8');
    process.stderr.write(`报告已保存：${output}\n`);
  } else process.stdout.write(content);
  if (report.errors.length) {
    if (options.format === 'csv') {
      process.stderr.write(`有 ${report.errors.length} 个条目读取失败，CSV 仅包含成功读取的源文件：\n`);
      for (const error of report.errors) process.stderr.write(`  ${error.path}：${error.message}\n`);
    } else if (options.output || options.format !== 'text') {
      process.stderr.write(`有 ${report.errors.length} 个条目读取失败，统计结果不完整；详见报告的 errors。\n`);
    }
    process.exitCode = 2;
  }
}

main().catch((error) => {
  process.stderr.write(`错误：${error.message}\n`);
  process.exitCode = 1;
});
