// 构建 WorkBuddy 插件包
//
// 运行：node scripts/build-workbuddy.mjs [输出目录]
// 默认输出到 <工作区>/nature-workbuddy/plugin/nature/
//
// WorkBuddy（CodeBuddy 系）的插件格式：
//   <plugin>/
//     .codebuddy-plugin/plugin.json   插件元数据（name/version/skills/rules）
//     rules/*.md                      常驻规则，frontmatter 里 alwaysApply: true
//     skills/<name>/SKILL.md          按需加载的技能
//     agents/*.md                     子 agent（本插件不需要）
//
// 为什么要同时出 rules 和 skills：
//   这两层在 DSH 版里分别对应「常驻提示片段」和「内嵌技能」。
//   只出 skills 会丢掉常驻层——模型平时写中文就不会自动遵循 nature 的规则，
//   必须显式触发技能才生效。

import { readFile, writeFile, mkdir, rm, cp } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(here, '..');
const outRoot = resolve(process.argv[2] || join(pkgRoot, '..', 'nature-workbuddy'));
const pluginDir = join(outRoot, 'plugin', 'nature');
const skillDir = join(pluginDir, 'skills', 'nature');

const WANTED_MODULES = ['rules', 'scan', 'content'];
const pkg = JSON.parse(await readFile(join(pkgRoot, 'package.json'), 'utf8'));

// ── 1. 清空重建
await rm(join(outRoot, 'plugin'), { recursive: true, force: true });
await mkdir(join(pluginDir, '.codebuddy-plugin'), { recursive: true });
await mkdir(join(pluginDir, 'rules'), { recursive: true });
await mkdir(join(skillDir, 'scripts'), { recursive: true });
await mkdir(join(skillDir, 'lib'), { recursive: true });

// ── 2. 转换 lib/*.js → *.mjs
// 用扩展名声明 ESM，而不是在技能目录里放 package.json——
// 后者有可能被 WorkBuddy 当成插件目录去解析，多一个失败面。
for (const name of WANTED_MODULES) {
  const before = await readFile(join(pkgRoot, 'lib', `${name}.js`), 'utf8');
  const after = before.replace(/from '\.\/([a-z-]+)\.js'/g, "from './$1.mjs'");
  if (after === before && /from '\.\//.test(before)) {
    throw new Error(`${name}.js 里有未转换的相对 import，检查转换规则`);
  }
  await writeFile(join(skillDir, 'lib', `${name}.mjs`), after, 'utf8');
}

// ── 3. 复制手写内容
await cp(join(pkgRoot, 'workbuddy', 'SKILL.md'), join(skillDir, 'SKILL.md'));
await cp(join(pkgRoot, 'workbuddy', 'scripts', 'nature.mjs'), join(skillDir, 'scripts', 'nature.mjs'));
await cp(join(pkgRoot, 'workbuddy', 'plugin', 'README.md'), join(pluginDir, 'README.md'));
await cp(
  join(pkgRoot, 'workbuddy', 'plugin', 'rules', 'nature-chinese.md'),
  join(pluginDir, 'rules', 'nature-chinese.md'),
);

// ── 4. 生成 plugin.json（版本号以 package.json 为单一真相源）
const pluginJson = {
  name: 'nature',
  version: pkg.version,
  description:
    'nature · 中文写作体检：按 11 个文体分别判定模板腔，给出改写处方。它衡量文字的模板化程度，不判断作者身份。',
  author: { name: '刘老爷' },
  license: 'MIT',
  skills: ['./skills/nature'],
  rules: ['./rules/nature-chinese.md'],
};
await writeFile(
  join(pluginDir, '.codebuddy-plugin', 'plugin.json'),
  `${JSON.stringify(pluginJson, null, 2)}\n`,
  'utf8',
);

// ── 5. 版本号同步进 SKILL.md
const skillPath = join(skillDir, 'SKILL.md');
const skill = (await readFile(skillPath, 'utf8')).replace(/^version: .*$/m, `version: ${pkg.version}`);
await writeFile(skillPath, skill, 'utf8');

// ── 6. 安装说明
const marketplaceDir = String.raw`%USERPROFILE%\.workbuddy\plugins\marketplaces\my-experts`;
await writeFile(
  join(outRoot, 'INSTALL.md'),
  `# nature · 中文写作体检 —— WorkBuddy 插件

版本 ${pkg.version}

## 装法一：放进已有的 marketplace（推荐）

把 \`plugin\\nature\` 整个目录复制到 my-experts 市场：

\`\`\`powershell
Copy-Item -Recurse -Force ".\\plugin\\nature" "${marketplaceDir}\\plugins\\nature"
\`\`\`

然后在 \`${marketplaceDir}\\.codebuddy-plugin\\marketplace.json\` 的 \`plugins\` 数组里加一条：

\`\`\`json
{
  "name": "nature",
  "source": "./plugins/nature",
  "description": "中文模板腔体检：确定性脚本扫描 + 常驻人话规则 + 去味方法论技能。"
}
\`\`\`

重启 WorkBuddy，插件列表里就会出现「去AI味」。

## 装法二：自己建一个 marketplace

\`\`\`
<你的marketplace>/
  .codebuddy-plugin/marketplace.json
  plugins/nature/            ← 把 plugin\\nature 放这里
\`\`\`

marketplace.json：

\`\`\`json
{
  "name": "my-plugins",
  "description": "自建插件市场",
  "plugins": [
    { "name": "nature", "source": "./plugins/nature", "description": "中文写作体检" }
  ]
}
\`\`\`

## 装完的结构

\`\`\`
nature/
  .codebuddy-plugin/plugin.json
  README.md
  rules/nature-chinese.md            常驻：每一轮都在场的中文写作规则
  skills/nature/
    SKILL.md                       按需：完整方法论
    scripts/nature.mjs               工具：命令行扫描
    lib/*.mjs                      规则库与扫描引擎
\`\`\`

## 依赖

只需要 Node.js（>= 18）。无第三方依赖，不联网。

## 试跑

\`\`\`powershell
$s = "${marketplaceDir}\\plugins\\nature\\skills\\nature"
node "$s\\scripts\\nature.mjs" --list
\`\`\`
`,
  'utf8',
);

console.log(`构建完成：${pluginDir}`);
console.log(`  版本：${pkg.version}`);
console.log('  .codebuddy-plugin/plugin.json');
console.log('  rules/nature-chinese.md        （常驻）');
console.log('  skills/nature/SKILL.md         （按需）');
console.log('  skills/nature/scripts/nature.mjs （工具）');
for (const name of WANTED_MODULES) console.log(`  skills/nature/lib/${name}.mjs`);
console.log(`安装说明：${join(outRoot, 'INSTALL.md')}`);
