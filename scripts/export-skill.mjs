// 把插件内嵌的技能正文导出成项目技能文件。
//
// 项目技能放在 <projectRoot>/.dsh/skills/<name>/SKILL.md，由 dsh-skill-filesystem 监视，
// 新增后无需重启宿主即可被发现。这样即使 profile 尚未重新组合，也能先用上方法论。
//
// 运行：node scripts/export-skill.mjs [目标目录]

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildSkillBody, buildPromptSection } from '../lib/content.js';
import { normalizeOptions } from '../index.js';

const here = dirname(fileURLToPath(import.meta.url));
const target = resolve(process.argv[2] || join(here, '..', '..', '.dsh', 'skills', 'nature-chinese'));
const options = normalizeOptions({});

const frontmatter = [
  '---',
  'name: nature-chinese',
  'description: 中文去 AI 味方法论：判断 AI 味来自哪里、必删清单、句式改造手法、七种文体的具体写法、改写对照与自检表。',
  'whenToUse: 需要把一段中文改到像真人写的，或者要判断一段文字为什么读着像机器、审稿、润色、去腔调时。',
  '---',
  '',
].join('\n');

const body = [
  frontmatter,
  buildSkillBody(options),
  '',
  '## 附：常驻精简规则',
  '',
  '下面这份是插件在系统提示里常驻的版本，比本文短。两者内容一致，取舍不同。',
  '',
  buildPromptSection(options),
  '',
].join('\n');

await mkdir(target, { recursive: true });
const file = join(target, 'SKILL.md');
await writeFile(file, body, 'utf8');
console.log(`已写出技能文件：${file}`);
console.log(`正文长度：${body.length} 字符`);
