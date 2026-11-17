// 超长文本性能探针（重复检测是唯一可能 O(n²) 的地方）
import { performance } from 'node:perf_hooks';
import { scanText } from '../lib/scan.js';
import { RHYTHM_RULES } from '../lib/rules.js';

const unit = '他说，这件事并不简单。她想了想，又问了一句为什么。';
console.log('=== 超长文本性能 ===');
for (const n of [200000, 500000, 1000000]) {
  const text = unit.repeat(Math.ceil(n / unit.length)).slice(0, n);
  const t0 = performance.now();
  const r = scanText(text, { genre: 'webnovel' });
  const dt = performance.now() - t0;
  console.log(
    `  ${String(n).padStart(8)} 字  ${dt.toFixed(0).padStart(6)}ms  ` +
      `${(dt / (n / 1000)).toFixed(2)} ms/千字  句子 ${r.stats.sentences}  重复对 ${r.stats.duplicatePairs.length}`,
  );
}

console.log(`\n=== 节奏规则条数 ===`);
console.log(`  RHYTHM_RULES 有 ${Object.keys(RHYTHM_RULES).length} 条：${Object.keys(RHYTHM_RULES).join(' / ')}`);

console.log(`\n=== 重复检测的最坏情况：全是相同长句 ===`);
for (const n of [50000, 200000]) {
  const text = '这是一句用来测试重复检测性能的话，长度大概三十个字左右。'.repeat(Math.ceil(n / 30)).slice(0, n);
  const t0 = performance.now();
  const r = scanText(text, { genre: 'webnovel' });
  const dt = performance.now() - t0;
  console.log(`  ${String(n).padStart(8)} 字  ${dt.toFixed(0).padStart(6)}ms  重复对 ${r.stats.duplicatePairs.length}`);
}
