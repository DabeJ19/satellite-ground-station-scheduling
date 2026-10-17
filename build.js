// build.js — 把 src/* 與 vendor/glpk 內嵌成單一 dist/index.html（零外部請求）
// 用法：node build.js
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');
const OUT = path.join(ROOT, 'dist', 'index.html');

function read(p) { return fs.readFileSync(p, 'utf8'); }

// 1. glpk.js：ES module → 全域 window.GLPK
let glpk = read(path.join(ROOT, 'vendor', 'glpk', 'glpk-5.0.0.js'));
const EXPORT_TAIL = 'export{pe as default};';
if (!glpk.includes(EXPORT_TAIL)) throw new Error('vendor glpk: export tail not found; check version');
glpk = glpk.replace(EXPORT_TAIL, 'window.GLPK=pe;');

// 2. 內嵌資料
const defaultData = read(path.join(SRC, 'data', 'default.json'));

// 3. 組裝：index.html 內的 <!-- @inline:xxx --> 標記
let html = read(path.join(SRC, 'index.html'));
const parts = {
  'style.css':   () => `<style>\n${read(path.join(SRC, 'style.css'))}\n</style>`,
  'glpk':        () => `<script>\n${glpk}\n</script>`,
  'default.json':() => `<script>window.SGS_DEFAULT_DATA = ${defaultData};</script>`,
  'engine.js':   () => `<script>\n${read(path.join(SRC, 'engine.js'))}\n</script>`,
  'milp.js':     () => `<script>\n${read(path.join(SRC, 'milp.js'))}\n</script>`,
  'ga.js':       () => `<script>\n${read(path.join(SRC, 'ga.js'))}\n</script>`,
  'anim.js':     () => `<script>\n${read(path.join(SRC, 'anim.js'))}\n</script>`,
  'ui.js':       () => `<script>\n${read(path.join(SRC, 'ui.js'))}\n</script>`,
};
html = html.replace(/<!--\s*@inline:([\w.]+)\s*-->/g, (m, name) => {
  if (!parts[name]) throw new Error('unknown inline part: ' + name);
  return parts[name]();
});
html = html.replace('__BUILD_TIME__', new Date().toISOString());

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html);
console.log(`built ${path.relative(ROOT, OUT)}  ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB`);
