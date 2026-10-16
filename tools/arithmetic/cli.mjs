#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateWorksheet, MathError } from '../../website/lib/math/core.mjs';

const HELP = `四则运算出题工具

用法：node tools/arithmetic/cli.mjs [选项]
与网站使用同一数学核心，无需安装第三方依赖。

  --count, -n <数量>           1～10000，默认 20
  --min <整数>                最小操作数，默认 0
  --max <整数>                最大操作数，默认 100
  --operators <列表>          +,-,*,/ 中的非重复项，默认 +,-
  --ops <数量>                每题 1～4 个运算符，默认 2
  --parentheses               启用括号
  --negative                  允许负数及负数中间结果
  --fractions                 允许分数操作数
  --division <模式>           exact（整除）|fraction（分数）|remainder（余数）
  --result-min <整数>         答案下界，默认 0
  --result-max <整数>         答案上界，默认 100
  --denominator <整数>        分数最大分母，2～12，默认 12
  --seed <文本>               固定随机种子，复现相同题目
  --format text|json          输出格式，默认 text；--json 为简写
  --answers                   同时输出标准答案
  --output <文件.txt|.json>    保存到新文件；不覆盖任何现有文件
  --help, -h                  显示帮助

示例：
  node tools/arithmetic/cli.mjs --count 300 --answers
  node tools/arithmetic/cli.mjs --count 10000 --seed course-10000 --json
  node tools/arithmetic/cli.mjs --operators / --ops 1 --division remainder --answers

退出码：0 成功；1 参数、出题条件或输出错误。
`;

const NUMBER_OPTIONS = Object.freeze({
  '--count': 'count', '-n': 'count', '--min': 'min', '--max': 'max',
  '--ops': 'operatorCount', '--result-min': 'resultMin', '--result-max': 'resultMax',
  '--denominator': 'denominatorMax',
});
const BOOLEAN_OPTIONS = Object.freeze({
  '--parentheses': ['parentheses', true], '--no-parentheses': ['parentheses', false],
  '--negative': ['allowNegative', true], '--no-negative': ['allowNegative', false],
  '--fractions': ['fractions', true], '--no-fractions': ['fractions', false],
});
const VALUE_OPTIONS = new Set([...Object.keys(NUMBER_OPTIONS), '--operators', '--division', '--seed', '--format', '--output']);

export function parseArguments(args) {
  const options = {}, output = { format: 'text', answers: false, filename: undefined, help: false };
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === '--help' || argument === '-h') output.help = true;
    else if (argument === '--json') output.format = 'json';
    else if (argument === '--answers') output.answers = true;
    else if (Object.hasOwn(BOOLEAN_OPTIONS, argument)) {
      const [key, value] = BOOLEAN_OPTIONS[argument]; options[key] = value;
    } else if (VALUE_OPTIONS.has(argument)) {
      const value = args[++index];
      if (!value || value.startsWith('--')) throw new Error(`${argument} 缺少参数值。`);
      if (Object.hasOwn(NUMBER_OPTIONS, argument)) {
        if (!/^-?\d+$/u.test(value) || !Number.isSafeInteger(Number(value))) throw new Error(`${argument} 须为安全整数。`);
        options[NUMBER_OPTIONS[argument]] = Number(value);
      } else if (argument === '--operators') {
        options.operators = value.replaceAll('×', '*').replaceAll('÷', '/').split(',').map((op) => op.trim());
      } else if (argument === '--division') options.divisionMode = value;
      else if (argument === '--seed') options.seed = value;
      else if (argument === '--format') output.format = value;
      else output.filename = value;
    } else throw new Error(`未知参数：${argument}。使用 --help 查看用法。`);
  }
  if (!['text', 'json'].includes(output.format)) throw new Error('--format 仅支持 text 或 json。');
  if (output.filename && !['.txt', '.json'].includes(path.extname(output.filename).toLowerCase())) {
    throw new Error('--output 仅允许 .txt 或 .json 文件，以避免写入源代码。');
  }
  return { options, output };
}

export function formatWorksheet(worksheet, output) {
  if (output.format === 'json') {
    const value = output.answers ? worksheet : {
      ...worksheet,
      questions: worksheet.questions.map(({ answer: _answer, ...question }) => question),
    };
    return `${JSON.stringify(value, null, 2)}\n`;
  }
  const questions = worksheet.questions.map((question) => `${question.id}. ${question.expression} =${output.answers ? ` ${question.answer}` : ''}`);
  return `四则运算练习 · ${worksheet.questions.length} 题\n随机种子：${worksheet.seed}\n\n${questions.join('\n')}\n`;
}

export async function main(args = process.argv.slice(2)) {
  const { options, output } = parseArguments(args);
  if (output.help) { process.stdout.write(HELP); return; }
  const worksheet = generateWorksheet(options);
  const content = formatWorksheet(worksheet, output);
  if (output.filename) {
    const filename = path.resolve(output.filename);
    await mkdir(path.dirname(filename), { recursive: true });
    try {
      // Exclusive creation also rejects existing symbolic links and hard links.
      await writeFile(filename, content, { encoding: 'utf8', flag: 'wx' });
    } catch (error) {
      if (error.code === 'EEXIST') throw new Error('输出文件已存在，请更换文件名；本工具不会覆盖文件。');
      throw error;
    }
    process.stderr.write(`练习已保存：${filename}\n`);
  } else process.stdout.write(content);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`错误${error instanceof MathError ? `（${error.code}）` : ''}：${error.message}\n`);
    process.exitCode = 1;
  });
}
