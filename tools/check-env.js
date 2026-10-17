// tools/check-env.js — 本機環境檢查（不需管理員權限）。用法：node tools/check-env.js
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const ok = (m) => console.log('  ✔ ' + m), bad = (m) => console.log('  ✘ ' + m), info = (m) => console.log('  · ' + m);
const run = (cmd) => { try { return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch (_) { return null; } };
console.log('Node / npm');
const major = parseInt(process.versions.node.split('.')[0], 10);
(major >= 18 ? ok : bad)(`node ${process.versions.node}（需 ≥ 18；Claude Code 的 npm 安裝法需 ≥ 22，原生安裝法不需要 Node）`);
const npmv = run('npm --version'); (npmv ? ok : bad)('npm ' + (npmv || '不可用'));
console.log('git');
const gitv = run('git --version'); (gitv ? ok : bad)(gitv || 'git 不可用（Git for Windows 建議安裝，Claude Code 的 Bash 工具需要）');
const origin = run('git remote get-url origin'); info('origin = ' + (origin || '未設定'));
console.log('專案');
(fs.existsSync(path.join(__dirname, '..', 'vendor', 'glpk', 'glpk-5.0.0.js')) ? ok : bad)('vendor/glpk 存在');
const built = run('node build.js'); (built ? ok : bad)('build：' + (built || '失敗'));
console.log('Playwright（瀏覽器測試用，可選）');
let pw = null; try { pw = require.resolve('playwright'); } catch (_) { try { pw = require.resolve('playwright', { paths: [run('npm root -g') || ''] }); } catch (__) {} }
(pw ? ok : bad)(pw ? 'playwright 已安裝' : 'playwright 未安裝：npm i -D playwright 後 npx playwright install chromium；若公司網路擋下載，改用 PW_CHANNEL=msedge');
console.log('代理 / 網路');
['HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY'].forEach((k) => info(`${k} = ${process.env[k] ? '已設定' : '未設定'}`));
console.log('Claude Code / Codex');
const cc = run('claude --version'); (cc ? ok : info)(cc ? 'claude ' + cc : 'claude 未安裝或不在 PATH（PowerShell：irm https://claude.ai/install.ps1 | iex，不需管理員）');
const cx = run('codex --version'); (cx ? ok : info)(cx ? 'codex ' + cx : 'codex 未安裝或不在 PATH');
