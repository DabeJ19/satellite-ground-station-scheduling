// build.js — 把 src/* 與 vendor/glpk 內嵌成單一 dist/index.html（零外部請求）。SPEC §7。
// 用法：node build.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');
const OUT = path.join(ROOT, 'dist', 'index.html');
const read = (p) => fs.readFileSync(p, 'utf8');
const fail = (m) => { throw new Error('build: ' + m); };

// 1. glpk.js（版本專用 adapter）：SHA-256 固定、export 尾端恰好一次且位於檔尾 → window.GLPK
const GLPK_FILE = path.join(ROOT, 'vendor', 'glpk', 'glpk-5.0.0.js');
const GLPK_SHA256 = '04ff37a216b2a8fa9375fee1c56b4522405b6d23a1af5fcfe230a59ca419a2a9';
let glpk = read(GLPK_FILE);
const sha = crypto.createHash('sha256').update(glpk, 'utf8').digest('hex');
if (sha !== GLPK_SHA256) fail(`vendor glpk SHA-256 不符（${sha}）；升級 vendor 時請改用 bundler adapter 並更新雜湊`);
const EXPORT_TAIL = 'export{pe as default};';
const idx = glpk.indexOf(EXPORT_TAIL);
if (idx < 0 || glpk.indexOf(EXPORT_TAIL, idx + 1) >= 0) fail('vendor glpk：export 尾端不存在或不唯一');
if (glpk.slice(idx + EXPORT_TAIL.length).trim() !== '') fail('vendor glpk：export 尾端不在檔尾');
glpk = glpk.slice(0, idx) + 'window.GLPK=pe;';
assertNoCloser(glpk, 'script', 'vendor glpk');

// 2. 內嵌資料：先 parse 驗證，再 stringify 並轉義 script 敏感字元
const defaultRaw = read(path.join(SRC, 'data', 'default.json'));
let defaultObj;
try { defaultObj = JSON.parse(defaultRaw); } catch (e) { fail('default.json 不是合法 JSON：' + e.message); }
const defaultJS = JSON.stringify(defaultObj)
  .replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
  .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

// 2b. worker 原始碼：engine.js 與 ga.js 以字串內嵌，供 Blob worker 使用（同一份原始碼，不在 worker 重寫規則）
const srcEngine = read(path.join(SRC, 'engine.js')), srcGa = read(path.join(SRC, 'ga.js'));
const workerSources = `window.SGS_SOURCES = ${JSON.stringify({ engine: srcEngine, ga: srcGa }).replace(/<\//g, '<\\/')};`;

// 3. 組裝：index.html 內的 <!-- @inline:xxx --> 標記，每個恰好一次
const js = (name) => { const s = read(path.join(SRC, name)); assertNoCloser(s, 'script', name); return `<script>\n${s}\n</script>`; };
const parts = {
  'style.css':    () => { const s = read(path.join(SRC, 'style.css')); assertNoCloser(s, 'style', 'style.css'); return `<style>\n${s}\n</style>`; },
  'glpk':         () => `<script>\n${glpk}\n</script>`,
  'default.json': () => `<script>window.SGS_DEFAULT_DATA = ${defaultJS};</script>`,
  'sources':      () => `<script>${workerSources}</script>`,
  'engine.js':    () => js('engine.js'),
  'milp.js':      () => js('milp.js'),
  'ga.js':        () => js('ga.js'),
  'anim.js':      () => js('anim.js'),
  'ui.js':        () => js('ui.js'),
};
let html = read(path.join(SRC, 'index.html'));
const seen = {};
html = html.replace(/<!--\s*@inline:([\w.]+)\s*-->/g, (m, name) => {
  if (!parts[name]) fail('未知的 inline 標記：' + name);
  if (seen[name]) fail('inline 標記重複：' + name);
  seen[name] = true;
  return parts[name]();
});
Object.keys(parts).forEach((name) => { if (!seen[name]) fail('inline 標記缺少：' + name); });
if (/<!--\s*@inline:/.test(html)) fail('仍有未替換的 inline 標記');
html = html.replace('__BUILD_TIME__', new Date().toISOString());

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html);
console.log(`built ${path.relative(ROOT, OUT)}  ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB`);

function assertNoCloser(text, tag, label) {
  if (new RegExp('</' + tag + '\\s*>', 'i').test(text)) fail(`${label} 含 </${tag}>，會提前關閉內嵌元素`);
}
