#!/usr/bin/env node
// nature —— 中文写作体检（WorkBuddy 技能的命令行入口）
//
// 用法：
//   node scripts/nature.mjs <文件> [选项]
//   node scripts/nature.mjs - [选项]              # 从 stdin 读
//   node scripts/nature.mjs <文件> --out=报告.md   # 写到文件（Windows 控制台编码不稳，推荐）
//   node scripts/nature.mjs --list                 # 列出所有文体
//
// 选项：
//   --genre=<id>      文体（默认 general）
//   --strength=<id>   改写强度 light | standard | rewrite（默认 standard）
//   --locale=<id>     zh-CN | zh-TW | zh-HK（默认 zh-CN）
//   --keep=<文本>     必须原样保留的内容
//   --json            输出 JSON 而不是 markdown
//   --quiet           只输出分数和命中 id（给脚本用）

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { scanText } from '../lib/scan.mjs';
import {
  GENRES,
  GENRE_IDS,
  STRENGTHS,
  STRENGTH_IDS,
  buildReport,
  buildPrescription,
} from '../lib/content.mjs';

const LOCALES = ['zh-CN', 'zh-TW', 'zh-HK'];

function usage() {
  console.log(`nature —— 中文写作体检

用法：
  node scripts/nature.mjs <文件> [选项]
  node scripts/nature.mjs - [选项]          从 stdin 读

选项：
  --genre=<id>      文体，默认 general
  --strength=<id>   light | standard | rewrite，默认 standard
  --locale=<id>     zh-CN | zh-TW | zh-HK，默认 zh-CN
  --keep=<文本>     必须原样保留的内容
  --before=<文件>   改之前的原文，传了就出「改前改后」对照
  --out=<文件>      把报告写到文件（Windows 控制台编码不稳，推荐）
  --json            输出 JSON
  --quiet           只输出分数与命中 id
  --list            列出所有文体与强度

文体：${GENRE_IDS.join(' / ')}`);
}

function parseArgs(argv) {
  const options = { genre: 'general', strength: 'standard', locale: 'zh-CN', keep: '', before: '', json: false, quiet: false, out: '', list: false };
  const positional = [];

  for (const arg of argv) {
    if (arg === '--json') options.json = true;
    else if (arg === '--quiet') options.quiet = true;
    else if (arg === '--list') options.list = true;
    else if (arg.startsWith('--genre=')) options.genre = arg.slice(8);
    else if (arg.startsWith('--strength=')) options.strength = arg.slice(11);
    else if (arg.startsWith('--locale=')) options.locale = arg.slice(9);
    else if (arg.startsWith('--keep=')) options.keep = arg.slice(7);
    else if (arg.startsWith('--before=')) options.before = arg.slice(9);
    else if (arg.startsWith('--out=')) options.out = arg.slice(6);
    else if (arg.startsWith('--')) {
      console.error(`未知选项：${arg}\n`);
      usage();
      process.exit(2);
    } else positional.push(arg);
  }

  return { options, positional };
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

const { options, positional } = parseArgs(process.argv.slice(2));

if (options.list) {
  console.log('文体：');
  for (const id of GENRE_IDS) console.log(`  ${id.padEnd(12)} ${GENRES[id].label}`);
  console.log('\n强度：');
  for (const id of STRENGTH_IDS) console.log(`  ${id.padEnd(12)} ${STRENGTHS[id].label}`);
  process.exit(0);
}

if (positional.length === 0) {
  console.error('缺少输入。给一个文件路径，或者用 - 从 stdin 读。\n');
  usage();
  process.exit(2);
}

const source = positional[0];
let text;
try {
  text = source === '-' ? await readStdin() : await readFile(resolve(source), 'utf8');
} catch (error) {
  console.error(`读不到输入 ${source}：${error.message}`);
  process.exit(2);
}

if (!GENRE_IDS.includes(options.genre)) {
  console.error(`未知文体「${options.genre}」。可用：${GENRE_IDS.join(' / ')}`);
  process.exit(2);
}
if (!STRENGTH_IDS.includes(options.strength)) {
  console.error(`未知强度「${options.strength}」。可用：${STRENGTH_IDS.join(' / ')}`);
  process.exit(2);
}
if (!LOCALES.includes(options.locale)) {
  console.error(`未知语区「${options.locale}」。可用：${LOCALES.join(' / ')}`);
  process.exit(2);
}

const result = scanText(text, { genre: options.genre, locale: options.locale });
const args = { genre: options.genre, strength: options.strength, keep: options.keep };

if (options.before) {
  let beforeText;
  try {
    beforeText = await readFile(resolve(options.before), 'utf8');
  } catch (error) {
    console.error(`读不到 --before 指定的文件 ${options.before}：${error.message}`);
    process.exit(2);
  }
  const beforeResult = scanText(beforeText, { genre: options.genre, locale: options.locale });
  if (beforeResult.ok) args.before = beforeResult;
}
const report = buildReport(result, args, {});
const prescription = buildPrescription(result, args, {});

let output;
if (options.json) {
  output = JSON.stringify(
    {
      score: result.score,
      grade: result.grade,
      chars: result.chars,
      genre: options.genre,
      strength: options.strength,
      findings: result.findings.map((f) => ({
        id: f.id,
        signal: f.signal || 'template',
        severity: f.sev,
        label: f.label,
        count: f.count,
      })),
      report,
      prescription: prescription.body,
    },
    null,
    2,
  );
} else if (options.quiet) {
  const ids = result.findings.map((f) => `${f.id}(${f.count})`).join(' ');
  output = `${result.score}\t${result.grade}\t${result.chars}\t${ids}`;
} else {
  output = `${report}\n\n${'─'.repeat(60)}\n改写处方\n${'─'.repeat(60)}\n\n${prescription.body}\n`;
}

if (options.out) {
  await writeFile(resolve(options.out), output, 'utf8');
  console.error(`已写入 ${resolve(options.out)}（${result.score} 分 ${result.grade} 级）`);
} else {
  process.stdout.write(output.endsWith('\n') ? output : `${output}\n`);
}
