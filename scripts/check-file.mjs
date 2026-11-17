// 检查一个磁盘上的文本文件。
// 运行：node scripts/check-file.mjs <文件路径> [文体] [强度]
//
// 工具在会话里可以直接调用；这个脚本是给「文本在文件里、想批量或离线看报告」用的。

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { scanText } from '../lib/scan.js';
import { buildReport, buildPrescription, GENRES, GENRE_IDS, STRENGTHS, STRENGTH_IDS } from '../lib/content.js';

const [, , fileArg, genreArg, strengthArg] = process.argv;
if (!fileArg) {
  console.error('用法：node scripts/check-file.mjs <文件路径> [文体] [强度]');
  console.error(`文体：${GENRE_IDS.join(' / ')}`);
  console.error(`强度：${STRENGTH_IDS.join(' / ')}`);
  process.exit(2);
}

const genre = GENRE_IDS.includes(genreArg) ? genreArg : 'general';
const strength = STRENGTH_IDS.includes(strengthArg) ? strengthArg : 'standard';

const path = resolve(fileArg);
const text = await readFile(path, 'utf8');

const result = scanText(text, { genre });
const args = { genre, strength };
const report = buildReport(result, args, {});
const prescription = buildPrescription(result, args, {});

const bar = '─'.repeat(60);
console.log(bar);
console.log(`文件：${path}`);
console.log(`文体：${GENRES[genre].label}　强度：${STRENGTHS[strength].label}`);
console.log(bar);
console.log();
console.log(report);
console.log();
console.log(bar);
console.log('节奏原始数据');
console.log(bar);
const s = result.stats;
console.log(
  JSON.stringify(
    {
      字数: s.chars,
      句数: s.sentences,
      段数: s.paragraphs,
      平均句长: s.avgSentenceLength,
      最短句: s.minSentenceLength,
      最长句: s.maxSentenceLength,
      句长CV: s.sentenceCv === null ? null : Number(s.sentenceCv.toFixed(3)),
      逗号数: s.commaCount,
      句号数: s.periodCount,
      逗号句号比: s.commaPeriodRatio,
      最长连续短句: s.maxConsecutiveShort,
      最长连续同主语: s.maxConsecutiveSameSubject,
      一句一段数: s.oneSentenceParagraphs,
      每千字锚点: s.anchorsPer1000,
    },
    null,
    2,
  ),
);
console.log();
console.log(bar);
console.log('改写处方');
console.log(bar);
console.log();
console.log(prescription.body);
