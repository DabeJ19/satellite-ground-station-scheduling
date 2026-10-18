// tests/build.test.js — SPEC §7／§8 S4：單檔交付物自檢（build 成功、零外部資源、授權齊備、標記全替換、JSON 轉義、worker 原始碼內嵌）。
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const tests = []; const test = (n, f) => tests.push({ name: n, fn: f }); const section = (n) => tests.push({ section: n });

section('build');
let html = '';
test('node build.js succeeds and writes dist/index.html (single file, > 300 KB)', () => {
  const out = execFileSync(process.execPath, [path.join(ROOT, 'build.js')], { cwd: ROOT, encoding: 'utf8' });
  assert.ok(/built dist\/index\.html/.test(out), out);
  html = fs.readFileSync(path.join(ROOT, 'dist', 'index.html'), 'utf8');
  assert.ok(html.length > 300 * 1024);
});
test('no external resources: no src/href to http(s)/protocol-relative on script/link/img/iframe; no @import; no importScripts', () => {
  assert.strictEqual(html.match(/<(script|link|img|iframe)[^>]+(src|href)\s*=\s*["'](https?:)?\/\//gi), null);
  assert.ok(!/@import\s/.test(html));
  assert.ok(!/importScripts\(/.test(html.replace(/<pre[\s\S]*?<\/pre>/g, '')), 'worker must not use importScripts');
  assert.ok(!/<!--\s*@inline:/.test(html), 'all inline markers replaced');
  assert.ok(!/__BUILD_TIME__|__GLPK_SHA256__/.test(html), 'placeholders replaced');
});
test('licence block: glpk.js 5.0.0, GPL-3.0, copyright, source URL, SHA-256 pin, build transform note, full GPL text, MIT for own code', () => {
  assert.ok(/glpk\.js 5\.0\.0/.test(html));
  assert.ok(/GPL-3\.0/.test(html));
  assert.ok(/Copyright © Jan Vaillant/.test(html));
  assert.ok(/https:\/\/github\.com\/jvail\/glpk\.js/.test(html));
  assert.ok(/04ff37a216b2a8fa9375fee1c56b4522405b6d23a1af5fcfe230a59ca419a2a9/.test(html));
  assert.ok(/export\{pe as default\};<\/code> 改寫為 <code>window\.GLPK=pe;/.test(html));
  assert.ok(/GNU GENERAL PUBLIC LICENSE/.test(html) && /Version 3, 29 June 2007/.test(html));
  assert.ok(/自有程式碼[^<]*MIT|MIT/.test(html));
  // the vendored file's own header is retained verbatim (not stripped by the build)
  const vendor = fs.readFileSync(path.join(ROOT, 'vendor', 'glpk', 'glpk-5.0.0.js'), 'utf8');
  const head = vendor.slice(0, 200);
  assert.ok(html.includes(head), 'vendor head retained');
  assert.ok(html.includes('window.GLPK=pe;') && !html.includes('export{pe as default};\n</script>'), 'export tail rewritten');
});
test('default data embedded with escaping; worker sources embedded; SGS modules present', () => {
  assert.ok(/window\.SGS_DEFAULT_DATA = \{/.test(html));
  assert.ok(/window\.SGS_SOURCES = \{/.test(html));
  const inScripts = html.replace(/<pre[\s\S]*?<\/pre>/g, '');
  const dataStr = inScripts.slice(inScripts.indexOf('window.SGS_DEFAULT_DATA'), inScripts.indexOf(';</script>', inScripts.indexOf('window.SGS_DEFAULT_DATA')));
  assert.ok(!/<\/script/i.test(dataStr) && !/[\u2028\u2029]/.test(dataStr));
  for (const k of ['SGS.engine', 'SGS.milp', 'SGS.ga', 'SGS.anim', 'SGS.app']) assert.ok(html.includes(k), k);
});
test('README distinguishes MIT (own code) from GPL-3.0 (embedded glpk.js) and does not call the single file pure MIT', () => {
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  assert.ok(/MIT/.test(readme) && /GPL-3\.0/.test(readme) && /不是純 MIT/.test(readme));
});

(async () => {
  let passed = 0, failed = 0;
  for (const t of tests) { if (t.section) { console.log(t.section); continue; } try { await t.fn(); passed++; console.log('  ✔', t.name); } catch (e) { failed++; console.log('  ✘', t.name, '\n    ', e.message); } }
  console.log(`\n${passed} passed, ${failed} failed`); process.exitCode = failed ? 1 : 0;
})();
