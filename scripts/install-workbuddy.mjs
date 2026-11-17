// 把构建好的插件装进 WorkBuddy 的 marketplace
//
// 运行：node scripts/install-workbuddy.mjs [插件源目录] [marketplace 目录]
// 默认：
//   源       <工作区>/nature-workbuddy/plugin/nature
//   目标市场 ~/.workbuddy/plugins/marketplaces/my-experts
//
// 做三件事，每一步都可回滚：
//   1. 备份 marketplace.json
//   2. 复制插件目录（已存在则先备份旧的）
//   3. 在 marketplace.json 的 plugins 里补一条（同名先删再加，保证幂等）

import { readFile, writeFile, copyFile, cp, rm, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(here, '..');

const srcDir = resolve(process.argv[2] || join(pkgRoot, '..', 'nature-workbuddy', 'plugin', 'nature'));
const marketDir = resolve(
  process.argv[3] || join(homedir(), '.workbuddy', 'plugins', 'marketplaces', 'my-experts'),
);

const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
const pluginName = JSON.parse(await readFile(join(srcDir, '.codebuddy-plugin', 'plugin.json'), 'utf8')).name;

const marketFile = join(marketDir, '.codebuddy-plugin', 'marketplace.json');
if (!existsSync(marketFile)) {
  console.error(`找不到 marketplace 清单：${marketFile}`);
  console.error('目标市场不存在。先确认路径，或者手动放进别处。');
  process.exit(2);
}

// ── 1. 备份清单
const manifestBackup = `${marketFile}.bak-${stamp}`;
await copyFile(marketFile, manifestBackup);

// ── 2. 复制插件（旧的先备份）
const destDir = join(marketDir, 'plugins', pluginName);
if (existsSync(destDir)) {
  const oldBackup = `${destDir}.bak-${stamp}`;
  await cp(destDir, oldBackup, { recursive: true });
  await rm(destDir, { recursive: true, force: true });
  console.log(`已备份旧插件：${oldBackup}`);
}
await mkdir(dirname(destDir), { recursive: true });
await cp(srcDir, destDir, { recursive: true });

// ── 3. 更新清单（读-改-写；同名先移除，保证重复执行结果一致）
const manifest = JSON.parse(await readFile(marketFile, 'utf8'));
// 版本号与描述都从刚复制过去的 plugin.json 读，避免清单和插件本体各说一套。
const builtPlugin = JSON.parse(await readFile(join(srcDir, '.codebuddy-plugin', 'plugin.json'), 'utf8'));
const entry = {
  name: pluginName,
  source: `./plugins/${pluginName}`,
  description: builtPlugin.description,
  version: builtPlugin.version,
};
const others = (manifest.plugins || []).filter((p) => p.name !== pluginName);
manifest.plugins = [...others, entry];
await writeFile(marketFile, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

console.log(`已安装插件：${destDir}`);
console.log(`已更新清单：${marketFile}`);
console.log(`清单备份：${manifestBackup}`);
console.log(`\n当前市场内的插件：`);
for (const p of manifest.plugins) console.log(`  - ${p.name}  ${p.source}`);
console.log('\n重启 WorkBuddy 后生效。');
