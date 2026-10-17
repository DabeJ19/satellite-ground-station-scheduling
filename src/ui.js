// ui.js — 分頁、主題、S0 煙霧測試
window.SGS = window.SGS || {};
(function () {
  const tabs = document.getElementById('tabs');
  tabs.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tab]'); if (!b) return;
    tabs.querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
    document.querySelectorAll('.tab').forEach(s => s.classList.toggle('hidden', s.id !== 'tab-' + b.dataset.tab));
  });
  const root = document.documentElement;
  try { const t = localStorage.getItem('sgs.theme'); if (t) root.dataset.theme = t; } catch (_) {}
  document.getElementById('themeToggle').onclick = () => {
    root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('sgs.theme', root.dataset.theme); } catch (_) {}
  };

  // S0 煙霧測試：glpk 在 file:// 下能啟動 worker + wasm，並解一個小 LP
  const el = document.getElementById('glpkStatus');
  (async () => {
    try {
      const glpk = await window.GLPK();
      const res = await glpk.solve({
        name: 'smoke', objective: { direction: glpk.GLP_MAX, name: 'obj', vars: [{ name: 'x', coef: 1 }] },
        subjectTo: [{ name: 'c', vars: [{ name: 'x', coef: 1 }], bnds: { type: glpk.GLP_UP, ub: 3, lb: 0 } }],
        binaries: [], generals: ['x']
      }, { msglev: glpk.GLP_MSG_OFF });
      el.textContent = `glpk ${glpk.version} OK，smoke z = ${res.result.z}（預期 3），status = ${res.result.status}`;
      el.style.color = res.result.z === 3 ? 'var(--ok)' : 'var(--bad)';
    } catch (err) { el.textContent = 'glpk 失敗：' + err; el.style.color = 'var(--bad)'; }
  })();
})();
