// 语料库回归测试
// 运行：node test/regression.mjs
//
// 这是整个插件的地板线。
//
// corpus/manifest.json 里的每一条都对应一次真实的误判——某个文体的正常文本
// 被规则判成了「模板腔」。改动任何规则、任何阈值、任何文体画像之后，先跑这个。
// 它存在的唯一理由就是：不要让同一个误判发生第二次。
//
// 与 smoke.mjs 的分工：smoke 测的是「规则引擎的行为对不对」，
// regression 测的是「对真实语料的结论稳不稳」。

import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { scanText } from '../lib/scan.js';
import { GENRES } from '../lib/content.js';

const here = dirname(fileURLToPath(import.meta.url));
const corpusDir = resolve(here, '..', 'corpus');

let manifest;
try {
  manifest = JSON.parse(await readFile(join(corpusDir, 'manifest.json'), 'utf8'));
} catch (error) {
  console.error(`读不到语料清单 ${join(corpusDir, 'manifest.json')}：${error.message}`);
  process.exit(2);
}

const pad = (s, n) => {
  const width = [...String(s)].reduce((w, ch) => w + (ch.charCodeAt(0) > 0x2e80 ? 2 : 1), 0);
  return String(s) + ' '.repeat(Math.max(0, n - width));
};

const rows = [];
let failures = 0;

for (const sample of manifest.samples) {
  const text = await readFile(join(corpusDir, 'samples', sample.file), 'utf8');
  const result = scanText(text, { genre: sample.genre });
  const ids = new Set(result.findings.map((f) => f.id));
  const expect = sample.expect || {};
  const problems = [];

  if (expect.maxScore !== undefined && result.score > expect.maxScore) {
    problems.push(`分数 ${result.score} 超过上限 ${expect.maxScore}`);
  }
  if (expect.minScore !== undefined && result.score < expect.minScore) {
    problems.push(`分数 ${result.score} 低于下限 ${expect.minScore}`);
  }
  for (const id of expect.mustNotHit || []) {
    if (ids.has(id)) problems.push(`不应命中 ${id}`);
  }
  for (const id of expect.mustHit || []) {
    if (!ids.has(id)) problems.push(`应命中而未命中 ${id}`);
  }

  if (problems.length > 0) failures += 1;
  rows.push({ sample, result, problems });
}

console.log('语料库回归测试');
console.log('─'.repeat(88));
for (const { sample, result, problems } of rows) {
  const mark = problems.length === 0 ? '✓' : '✗';
  const genreLabel = GENRES[sample.genre]?.label ?? sample.genre;
  const bounds = [];
  if (sample.expect?.minScore !== undefined) bounds.push(`≥${sample.expect.minScore}`);
  if (sample.expect?.maxScore !== undefined) bounds.push(`≤${sample.expect.maxScore}`);
  console.log(
    `${mark} ${pad(sample.file.replace(/\.txt$/, ''), 34)}` +
      `${pad(genreLabel, 16)}` +
      `${pad(`${result.score} 分 ${result.grade} 级`, 12)}` +
      `期望 ${bounds.join(' ') || '—'}`,
  );
}

const failed = rows.filter((r) => r.problems.length > 0);
if (failed.length > 0) {
  console.log('');
  for (const { sample, problems } of failed) {
    console.log(`── ${sample.file} ──`);
    for (const p of problems) console.log(`   · ${p}`);
    if (sample.history) console.log(`   背景：${sample.history}`);
    console.log('');
  }
}

console.log('─'.repeat(88));
console.log(
  failures === 0
    ? `全部通过（${rows.length} 个样本）`
    : `${failures} / ${rows.length} 个样本失败——改规则之前先解决这个`,
);
process.exitCode = failures === 0 ? 0 : 1;
