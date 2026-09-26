// ==UserScript==
// @name         GeoFS Livery Switcher
// @namespace    https://www.geo-fs.com/
// @version      1.3
// @description  Aircraft-aware livery browser for GeoFS. Press Shift to toggle.
// @author       CP8888
// @match        https://www.geo-fs.com/geofs.php*
// @match        https://geo-fs.com/geofs.php*
// @icon         https://www.geo-fs.com/favicon.ico
// @grant        unsafeWindow
// @run-at       document-idle
// @noframes
// ==/UserScript==

(function () {
  'use strict';

  const W = (typeof unsafeWindow !== 'undefined' && unsafeWindow) ? unsafeWindow : window;

  const CONFIG = {
    jsonUrl    : 'https://raw.githubusercontent.com/8888CP/GeoFS-Livery-Switcher/refs/heads/main/livery.json',
    title      : 'GeoFS Livery Switcher',
    startHidden: false,
    toggleKey  : 'Shift',
    maxThumbs  : 3
  };

  const TYPES = [
    { id: 'all',      name: 'All Liveries',       icon: '✈' },
    { id: 'cargo',    name: 'Cargo Liveries',     icon: '📦' },
    { id: 'pax',      name: 'Passenger Liveries', icon: '👥' },
    { id: 'real',     name: 'Real Liveries',      icon: '🌍' },
    { id: 'virtual',  name: 'Virtual Liveries',   icon: '🎨' },
    { id: 'military', name: 'Military Liveries',  icon: '🛡' },
    { id: 'special',  name: 'Special Liveries',   icon: '⭐' }
  ];
  const TYPE_MAP = Object.fromEntries(TYPES.map(t => [t.id, t.name]));

  const state = {
    groups: [], data: [], query: '', type: 'all',
    open: !CONFIG.startHidden,
    currentAcId: null, lastError: ''
  };

  const LOG = (...a) => console.log('%c[GLS]', 'color:#58a6ff;font-weight:bold', ...a);
  const ERR = (...a) => console.error('%c[GLS]', 'color:#ff6b6b;font-weight:bold', ...a);

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

  function resolveUrl(u, base) {
    if (!u) return '';
    if (/^(https?:)?\/\//i.test(u) || u.startsWith('data:')) return u;
    try { return new URL(u, base || CONFIG.jsonUrl).href; } catch (e) { return u; }
  }

  function isTyping() {
    const el = document.activeElement;
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
  }

  function toast(msg, ms) {
    let el = document.getElementById('gfl-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'gfl-toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('gfl-show');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('gfl-show'), ms || 3000);
  }

  function getAircraftInstance() {
    try {
      const g = W.geofs;
      if (!g || !g.aircraft) return null;
      return g.aircraft.instance || g.aircraft.current || g.aircraft.active || null;
    } catch (e) { return null; }
  }

  function getCurrentAircraftId() {
    const inst = getAircraftInstance();
    if (!inst) return null;

    if (inst.aircraftRecord && inst.aircraftRecord.id != null && inst.aircraftRecord.id !== '') {
      return String(inst.aircraftRecord.id);
    }
    const fp = (inst.fullPath || (inst.definition && inst.definition.fullPath) || '').trim();
    if (fp) {
      const parts = fp.split('/').filter(Boolean);
      if (parts.length >= 2) {
        const code = parts[parts.length - 2];
        if (code) return String(code);
      }
    }
    if (inst.definition && inst.definition.id != null && inst.definition.id !== '') return String(inst.definition.id);
    if (inst.setup && inst.setup.id != null && inst.setup.id !== '') return String(inst.setup.id);
    if (inst.definition && inst.definition.acid != null && inst.definition.acid !== '') return String(inst.definition.acid);
    if (inst.id != null && inst.id !== '') return String(inst.id);
    return null;
  }

  async function fetchJson(url) {
    const bust = url + (url.includes('?') ? '&' : '?') + 't=' + Date.now();
    LOG('Requesting JSON:', bust);
    const r = await fetch(bust, { cache: 'no-cache', mode: 'cors' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const text = await r.text();
    LOG('Response length:', text.length);
    return JSON.parse(text);
  }

  function findCurrentGroup(groups) {
    const acId = getCurrentAircraftId();
    if (!acId) return null;
    let g = groups.find(x => String(x.id) === acId);
    if (!g) {
      const inst = getAircraftInstance();
      const fp = (inst && inst.fullPath || '').trim();
      if (fp) {
        const parts = fp.split('/').filter(Boolean);
        const longCode = parts[parts.length - 2];
        if (longCode) g = groups.find(x => String(x.id) === longCode);
      }
    }
    return g || null;
  }

  function flattenForCurrentAircraft(groups) {
    state.currentAcId = getCurrentAircraftId();
    const group = findCurrentGroup(groups);
    if (!group) return [];

    return (group.liveries || []).map(lv => Object.assign({}, lv, {
      _aircraftId: group.id,
      _index: group.index,
      _parts: group.parts
    }));
  }

  /* ---------- 获取当前飞机的槽位定义 ---------- */
  function getSlotLabels() {
    const inst = getAircraftInstance();
    if (!inst) return null;

    const group = findCurrentGroup(state.groups);
    let labels = group && group.labels;

    if (!labels) {
      const def = inst.definition || inst.setup;
      labels = def && def.labels;
    }

    if (!labels || typeof labels !== 'object') return null;

    const out = [];
    Object.keys(labels).forEach(name => {
      const raw = labels[name];
      const slots = (Array.isArray(raw) ? raw : [raw])
        .map(s => Number(s))
        .filter(s => !isNaN(s));
      if (slots.length) out.push({ name, slots });
    });

    out.sort((a, b) => a.slots[0] - b.slots[0]);
    return out;
  }

  /* ---------- Panel ---------- */
  const panel = document.createElement('div');
  panel.id = 'gfl-panel';
  panel.className = 'gfl-panel' + (state.open ? '' : ' gfl-hidden');

  panel.innerHTML = `
    <div class="gfl-glow"></div>
    <div class="gfl-header">
      <span class="gfl-logo"></span>
      <span class="gfl-title">${esc(CONFIG.title)}</span>
      <button class="gfl-btn-close" title="Hide (Shift)">✕</button>
    </div>
    <div class="gfl-search-wrap">
      <svg class="gfl-search-icon" viewBox="0 0 24 24">
        <circle cx="11" cy="11" r="7"></circle>
        <line x1="16.5" y1="16.5" x2="21" y2="21"></line>
      </svg>
      <input class="gfl-search" type="text" placeholder="Search by livery name, author, or aircraft…" spellcheck="false">
      <button class="gfl-search-clear" title="Clear">✕</button>
    </div>
    <div class="gfl-select">
      <button class="gfl-select-btn">
        <span class="gfl-select-label">All Liveries</span>
        <svg class="gfl-caret" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"></polyline></svg>
      </button>
      <div class="gfl-select-list"><div class="gfl-select-inner"></div></div>
    </div>
    <div class="gfl-list"></div>
    <div class="gfl-footer">
      <span class="gfl-count">0 liveries</span>
      <button class="gfl-test-btn" title="Test a livery">Test Livery</button>
      <button class="gfl-reload" title="Reload JSON">↻</button>
      <span class="gfl-hint"><kbd>Shift</kbd> to hide</span>
    </div>
  `;

  document.body.appendChild(panel);

  const $ = s => panel.querySelector(s);
  const headerEl    = $('.gfl-header');
  const searchEl    = $('.gfl-search');
  const clearEl     = $('.gfl-search-clear');
  const selectEl    = $('.gfl-select');
  const selectBtn   = $('.gfl-select-btn');
  const selectLbl   = $('.gfl-select-label');
  const selectInner = $('.gfl-select-inner');
  const listEl      = $('.gfl-list');
  const countEl     = $('.gfl-count');
  const reloadBtn   = $('.gfl-reload');
  const testBtn     = $('.gfl-test-btn');

  /* ---------- Test modal ---------- */
  const modal = document.createElement('div');
  modal.id = 'gfl-modal';
  modal.className = 'gfl-modal gfl-hidden';
  modal.innerHTML = `
    <div class="gfl-modal-backdrop"></div>
    <div class="gfl-modal-box">
      <div class="gfl-modal-header">
        <span>Test Livery</span>
        <button class="gfl-modal-close" title="Close">✕</button>
      </div>
      <div class="gfl-modal-body"></div>
      <div class="gfl-modal-footer">
        <button class="gfl-modal-cancel">Close</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const modalBackdrop = modal.querySelector('.gfl-modal-backdrop');
  const modalClose    = modal.querySelector('.gfl-modal-close');
  const modalCancel   = modal.querySelector('.gfl-modal-cancel');
  const modalBody     = modal.querySelector('.gfl-modal-body');

  function openModal() {
    modal.classList.remove('gfl-hidden');
    renderModalBody();
  }
  function closeModal() {
    modal.classList.add('gfl-hidden');
  }

  modalClose.addEventListener('click', closeModal);
  modalCancel.addEventListener('click', closeModal);
  modalBackdrop.addEventListener('click', closeModal);

  function renderModalBody() {
    const labels = getSlotLabels();

    if (!labels || !labels.length) {
      modalBody.innerHTML = `
        <div class="gfl-modal-empty">
          This aircraft has no slot definitions (<code>labels</code>) available.
        </div>`;
      return;
    }

    modalBody.innerHTML = labels.map((item, i) => `
      <div class="gfl-slot-row" data-row="${i}">
        <button class="gfl-slot-btn" data-row="${i}">LOAD IMAGE</button>
        <span class="gfl-slot-name">${esc(item.name)}</span>
      </div>
    `).join('');

    // 绑定每行的点击 & 拖拽
    modalBody.querySelectorAll('.gfl-slot-row').forEach(rowEl => {
      const rowIdx = Number(rowEl.dataset.row);
      const row = labels[rowIdx];
      if (!row) return;

      // 点击按钮 → 打开文件选择器
      const btn = rowEl.querySelector('.gfl-slot-btn');
      btn.addEventListener('click', () => {
        pickAndApply(row.slots);
      });

      // 整行支持拖入
      rowEl.addEventListener('dragover', e => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
        rowEl.classList.add('gfl-row-dragover');
      });
      rowEl.addEventListener('dragleave', e => {
        e.preventDefault();
        e.stopPropagation();
        rowEl.classList.remove('gfl-row-dragover');
      });
      rowEl.addEventListener('drop', e => {
        e.preventDefault();
        e.stopPropagation();
        rowEl.classList.remove('gfl-row-dragover');

        const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (!f) return;
        if (!f.type || !f.type.startsWith('image/')) {
          toast('Only image files are supported');
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          applyTestTexture(reader.result, row.slots);
        };
        reader.onerror = () => toast('Failed to read file');
        reader.readAsDataURL(f);
      });
    });
  }

  function pickAndApply(slots) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.addEventListener('change', () => {
      const f = input.files && input.files[0];
      if (!f) return;
      if (!f.type.startsWith('image/')) {
        toast('Only image files are supported');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        applyTestTexture(reader.result, slots);
      };
      reader.onerror = () => toast('Failed to read file');
      reader.readAsDataURL(f);
    });
    input.click();
  }

  function applyTestTexture(dataUrl, slots) {
    const inst = getAircraftInstance();
    if (!inst) return;

    const def = inst.definition || inst.setup;
    if (!def || !def.parts) return;

    const g = W.geofs;
    const version = parseFloat(g && g.version) || 0;
    const api = g && g.api;

    let applied = 0;

    for (const slot of slots) {
      for (let p = 0; p < def.parts.length; p++) {
        const part = def.parts[p];
        if (!part) continue;
        const model3d = part['3dmodel'];
        if (!model3d || !model3d._model) continue;

        try {
          if (version === 2.9 && api.Model && api.Model.prototype.changeTexture) {
            api.Model.prototype.changeTexture(dataUrl, slot, model3d);
          } else if (version >= 3.0 && version <= 3.7 && typeof api.changeModelTexture === 'function') {
            api.changeModelTexture(model3d._model, dataUrl, slot);
          } else if (typeof api.changeModelTexture === 'function') {
            api.changeModelTexture(model3d._model, dataUrl, { index: slot });
          } else if (model3d._model.changeTexture) {
            model3d._model.changeTexture(dataUrl, { index: slot });
          }
          applied++;
        } catch (err) {
          ERR('Test apply failed for slot ' + slot + ' part ' + p, err);
        }
      }
    }

    if (applied > 0) {
      LOG(`Test texture applied to slots [${slots}]`);
    }
  }

  testBtn.addEventListener('click', () => {
    const inst = getAircraftInstance();
    if (!inst) { toast('Load an aircraft first'); return; }
    openModal();
  });

  /* ---------- CSS ---------- */
  const CSS = `
  .gfl-panel{position:fixed;top:70px;left:24px;width:320px;max-height:min(74vh,660px);display:flex;flex-direction:column;border-radius:18px;z-index:2147483000;color:#e6edf8;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:1.45;background:linear-gradient(180deg,rgba(20,26,42,.90) 0%,rgba(11,15,24,.94) 100%);-webkit-backdrop-filter:blur(22px) saturate(160%);backdrop-filter:blur(22px) saturate(160%);border:1px solid rgba(255,255,255,.09);box-shadow:0 28px 70px -14px rgba(0,0,0,.85),0 0 0 1px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.07);transition:opacity .24s ease,transform .24s cubic-bezier(.2,.85,.3,1),visibility .24s;transform-origin:top left;--gfl-mx:50%;--gfl-my:0%;overflow:hidden;user-select:none;-webkit-user-select:none}
  .gfl-panel.gfl-hidden{opacity:0;visibility:hidden;pointer-events:none;transform:scale(.93) translateY(-10px)}
  .gfl-glow{position:absolute;inset:0;pointer-events:none;z-index:0;opacity:0;transition:opacity .35s ease;background:radial-gradient(420px circle at var(--gfl-mx) var(--gfl-my),rgba(88,166,255,.16),rgba(140,110,255,.07) 42%,transparent 68%)}
  .gfl-panel:hover .gfl-glow{opacity:1}
  .gfl-panel::after{content:'';position:absolute;inset:0;border-radius:inherit;pointer-events:none;z-index:5;padding:1px;background:radial-gradient(300px circle at var(--gfl-mx) var(--gfl-my),rgba(130,190,255,.75),rgba(150,120,255,.25) 40%,transparent 65%);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);mask-composite:exclude;opacity:0;transition:opacity .35s ease}
  .gfl-panel:hover::after{opacity:1}
  .gfl-header{position:relative;z-index:2;display:flex;align-items:center;gap:9px;padding:13px 14px 11px;cursor:grab;flex-shrink:0}
  .gfl-header:active{cursor:grabbing}
  .gfl-logo{width:9px;height:9px;border-radius:50%;background:linear-gradient(135deg,#58a6ff,#a78bfa);box-shadow:0 0 10px rgba(88,166,255,.85),0 0 22px rgba(88,166,255,.35);flex-shrink:0}
  .gfl-title{flex:1;font-size:13.5px;font-weight:600;letter-spacing:.4px;color:#eaf2ff;text-shadow:0 1px 2px rgba(0,0,0,.5)}
  .gfl-btn-close{width:24px;height:24px;border:none;border-radius:7px;background:rgba(255,255,255,.05);color:#8b98ad;font-size:11px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .18s,color .18s,transform .18s}
  .gfl-btn-close:hover{background:rgba(255,90,90,.18);color:#ff8b8b;transform:rotate(90deg)}
  .gfl-search-wrap{position:relative;z-index:2;padding:0 14px 10px;flex-shrink:0}
  .gfl-search-icon{position:absolute;left:25px;top:50%;transform:translateY(-62%);width:14px;height:14px;pointer-events:none;fill:none;stroke:#6b7a90;stroke-width:2;stroke-linecap:round;transition:stroke .2s}
  .gfl-search-wrap:focus-within .gfl-search-icon{stroke:#58a6ff}
  .gfl-search{width:100%;height:37px;box-sizing:border-box;padding:0 32px 0 34px;border-radius:11px;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.075);color:#e6edf8;font:inherit;font-size:12.5px;outline:none;transition:border-color .2s,background .2s,box-shadow .2s}
  .gfl-search::placeholder{color:#5d6b80}
  .gfl-search:focus{border-color:rgba(88,166,255,.55);background:rgba(88,166,255,.06);box-shadow:0 0 0 3px rgba(88,166,255,.10)}
  .gfl-search-clear{position:absolute;right:23px;top:50%;transform:translateY(-62%);width:17px;height:17px;border:none;border-radius:50%;background:rgba(255,255,255,.10);color:#9aa8bd;font-size:9px;line-height:1;cursor:pointer;display:none;align-items:center;justify-content:center;transition:background .18s,color .18s}
  .gfl-search-clear:hover{background:rgba(255,255,255,.2);color:#fff}
  .gfl-search-clear.gfl-on{display:flex}
  .gfl-select{position:relative;z-index:3;margin:0 14px;flex-shrink:0}
  .gfl-select-btn{width:100%;height:37px;box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;padding:0 12px;border-radius:11px;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.075);color:#cfdaea;font:inherit;font-size:12.5px;cursor:pointer;outline:none;transition:border-color .2s,background .2s,box-shadow .2s}
  .gfl-select-btn:hover{background:rgba(255,255,255,.075)}
  .gfl-select.gfl-open .gfl-select-btn{border-color:rgba(88,166,255,.55);background:rgba(88,166,255,.07);box-shadow:0 0 0 3px rgba(88,166,255,.10)}
  .gfl-caret{width:14px;height:14px;flex-shrink:0;fill:none;stroke:#7c8ba1;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round;transition:transform .28s cubic-bezier(.2,.8,.3,1),stroke .2s}
  .gfl-select.gfl-open .gfl-caret{transform:rotate(180deg);stroke:#58a6ff}
  .gfl-select-list{overflow:hidden;max-height:0;opacity:0;margin-top:0;transition:max-height .3s cubic-bezier(.2,.8,.3,1),opacity .22s ease,margin-top .3s}
  .gfl-select.gfl-open .gfl-select-list{max-height:250px;opacity:1;margin-top:6px}
  .gfl-select-inner{max-height:250px;overflow-y:auto;padding:6px;border-radius:12px;background:rgba(10,14,22,.92);border:1px solid rgba(255,255,255,.08);box-shadow:0 12px 30px -8px rgba(0,0,0,.7);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.18) transparent}
  .gfl-opt{display:flex;align-items:center;gap:9px;padding:8px 10px;border-radius:8px;cursor:pointer;font-size:12.5px;color:#b9c6d8;transition:background .15s,color .15s}
  .gfl-opt:hover{background:rgba(255,255,255,.06);color:#e6edf8}
  .gfl-opt.gfl-active{background:linear-gradient(90deg,rgba(88,166,255,.18),rgba(140,110,255,.10));color:#9dcbff;font-weight:500}
  .gfl-opt-icon{font-size:12px;width:15px;text-align:center;opacity:.9}
  .gfl-opt-name{flex:1}
  .gfl-opt-num{font-size:10.5px;color:#68758a;background:rgba(255,255,255,.055);padding:1px 7px;border-radius:20px}
  .gfl-opt.gfl-active .gfl-opt-num{color:#7fb7ff;background:rgba(88,166,255,.16)}
  .gfl-list{position:relative;z-index:2;flex:1;min-height:60px;overflow-y:auto;padding:12px 10px 6px;display:flex;flex-direction:column;gap:7px;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.20) transparent;overscroll-behavior:contain}
  .gfl-list::-webkit-scrollbar{width:9px}
  .gfl-list::-webkit-scrollbar-track{background:rgba(255,255,255,.035);border-radius:9px;margin:4px 0}
  .gfl-list::-webkit-scrollbar-thumb{background:rgba(255,255,255,.17);border-radius:9px;border:2px solid transparent;background-clip:padding-box;transition:background .2s}
  .gfl-list::-webkit-scrollbar-thumb:hover{background:rgba(88,166,255,.55);background-clip:padding-box}
  .gfl-select-inner::-webkit-scrollbar{width:9px}
  .gfl-select-inner::-webkit-scrollbar-track{background:rgba(255,255,255,.035);border-radius:9px}
  .gfl-select-inner::-webkit-scrollbar-thumb{background:rgba(255,255,255,.17);border-radius:9px;border:2px solid transparent;background-clip:padding-box}
  .gfl-select-inner::-webkit-scrollbar-thumb:hover{background:rgba(88,166,255,.55);background-clip:padding-box}
  .gfl-card{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:12px;background:rgba(255,255,255,.032);border:1px solid rgba(255,255,255,.055);cursor:pointer;position:relative;overflow:hidden;flex-shrink:0;transition:background .18s,border-color .18s,transform .18s,box-shadow .18s;animation:gfl-in .3s cubic-bezier(.2,.8,.3,1) both}
  @keyframes gfl-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
  .gfl-card::before{content:'';position:absolute;left:0;top:0;bottom:0;width:2px;background:linear-gradient(180deg,#58a6ff,#a78bfa);opacity:0;transition:opacity .2s}
  .gfl-card:hover{background:rgba(255,255,255,.075);border-color:rgba(88,166,255,.32);transform:translateY(-1px);box-shadow:0 6px 18px -8px rgba(88,166,255,.5)}
  .gfl-card:hover::before{opacity:1}
  .gfl-card.gfl-loading{opacity:.55;pointer-events:none}
  .gfl-info{flex:1;min-width:0}
  .gfl-name{font-size:13px;font-weight:600;color:#e8f0fd;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:3px}
  .gfl-sub{font-size:10.5px;color:#7c8ba1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:5px}
  .gfl-author{color:#8fa5c2}
  .gfl-tags{display:flex;gap:4px;flex-wrap:wrap}
  .gfl-tag{font-size:9.5px;line-height:1;padding:3px 6px;border-radius:5px;background:rgba(88,166,255,.10);color:#7fb0e8;border:1px solid rgba(88,166,255,.16);white-space:nowrap}
  .gfl-empty{padding:34px 16px;text-align:center;color:#5d6b80;font-size:12px}
  .gfl-empty span{display:block;font-size:24px;margin-bottom:8px;opacity:.4}
  .gfl-empty code{color:#8fa5c2;font-size:10.5px;background:rgba(255,255,255,.05);padding:2px 5px;border-radius:4px;word-break:break-all;display:inline-block;margin-top:6px;max-width:100%}
  .gfl-footer{position:relative;z-index:2;display:flex;align-items:center;justify-content:space-between;padding:9px 14px 11px;border-top:1px solid rgba(255,255,255,.055);font-size:10.5px;color:#5d6b80;flex-shrink:0;gap:8px}
  .gfl-hint kbd{display:inline-block;padding:1px 5px;border-radius:4px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);border-bottom-width:2px;font-family:inherit;font-size:9.5px;color:#8fa0b8}
  .gfl-reload{width:20px;height:20px;border:none;border-radius:6px;background:rgba(255,255,255,.05);color:#8b98ad;font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .18s,color .18s,transform .18s}
  .gfl-reload:hover{background:rgba(88,166,255,.18);color:#58a6ff;transform:rotate(180deg)}
  .gfl-test-btn{height:20px;padding:0 8px;border:1px solid rgba(255,154,60,.35);border-radius:6px;background:rgba(255,154,60,.12);color:#ffb266;font-size:9.5px;font-weight:500;cursor:pointer;display:flex;align-items:center;transition:background .18s,color .18s,border-color .18s}
  .gfl-test-btn:hover{background:rgba(255,154,60,.22);color:#ffcb91;border-color:rgba(255,154,60,.55)}
  #gfl-toast{position:fixed;left:50%;bottom:56px;transform:translate(-50%,16px);padding:9px 18px;border-radius:10px;background:rgba(16,22,34,.95);border:1px solid rgba(88,166,255,.32);box-shadow:0 12px 34px -10px rgba(0,0,0,.8),0 0 0 1px rgba(0,0,0,.4);color:#cfe2ff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;font-size:12.5px;-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);z-index:2147483001;opacity:0;pointer-events:none;transition:opacity .25s ease,transform .25s cubic-bezier(.2,.8,.3,1)}
  #gfl-toast.gfl-show{opacity:1;transform:translate(-50%,0)}
  .gfl-modal{position:fixed;inset:0;z-index:2147483002;display:flex;align-items:center;justify-content:center;opacity:0;visibility:hidden;transition:opacity .2s ease,visibility .2s}
  .gfl-modal.gfl-hidden{opacity:0;visibility:hidden;pointer-events:none}
  .gfl-modal:not(.gfl-hidden){opacity:1;visibility:visible}
  .gfl-modal-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.55);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}
  .gfl-modal-box{position:relative;width:460px;max-width:92vw;max-height:80vh;display:flex;flex-direction:column;background:linear-gradient(180deg,rgba(20,26,42,.96) 0%,rgba(11,15,24,.98) 100%);border:1px solid rgba(255,255,255,.10);border-radius:16px;box-shadow:0 30px 80px -20px rgba(0,0,0,.9),inset 0 1px 0 rgba(255,255,255,.06);color:#e6edf8;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;animation:gfl-modal-in .25s cubic-bezier(.2,.85,.3,1);overflow:hidden}
  @keyframes gfl-modal-in{from{opacity:0;transform:scale(.94) translateY(8px)}to{opacity:1;transform:none}}
  .gfl-modal-header{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;font-size:14px;font-weight:600;border-bottom:1px solid rgba(255,255,255,.06);flex-shrink:0}
  .gfl-modal-close{width:24px;height:24px;border:none;border-radius:7px;background:rgba(255,255,255,.05);color:#8b98ad;font-size:11px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .18s,color .18s}
  .gfl-modal-close:hover{background:rgba(255,90,90,.18);color:#ff8b8b}
  .gfl-modal-body{padding:16px;overflow-y:auto;flex:1}
  .gfl-modal-body::-webkit-scrollbar{width:8px}
  .gfl-modal-body::-webkit-scrollbar-track{background:rgba(255,255,255,.035);border-radius:8px}
  .gfl-modal-body::-webkit-scrollbar-thumb{background:rgba(255,255,255,.17);border-radius:8px}
  .gfl-modal-body::-webkit-scrollbar-thumb:hover{background:rgba(88,166,255,.55)}
  .gfl-modal-empty{text-align:center;padding:30px 16px;color:#5d6b80;font-size:12px}
  .gfl-modal-empty code{color:#8fa5c2;background:rgba(255,255,255,.05);padding:2px 5px;border-radius:4px}

  /* Slot rows */
  .gfl-slot-row{
    display:flex;align-items:center;gap:12px;margin-bottom:8px;
    padding:6px;border-radius:10px;
    border:2px dashed transparent;
    transition:border-color .18s ease, background .18s ease;
  }
  .gfl-slot-row:last-child{margin-bottom:0}
  .gfl-slot-row.gfl-row-dragover{
    border-color:rgba(88,166,255,.70);
    background:rgba(88,166,255,.12);
  }
  .gfl-slot-btn{
    flex-shrink:0;width:150px;height:40px;border:none;border-radius:8px;
    background:linear-gradient(180deg,#ff9a3c 0%,#e07820 100%);
    color:#fff;font-size:12.5px;font-weight:600;letter-spacing:.5px;
    cursor:pointer;pointer-events:auto;
    transition:transform .12s ease,box-shadow .18s ease,filter .18s ease;
    box-shadow:0 6px 14px -6px rgba(224,120,32,.55),inset 0 1px 0 rgba(255,255,255,.25);
  }
  .gfl-slot-btn:hover{filter:brightness(1.08);transform:translateY(-1px);box-shadow:0 10px 20px -8px rgba(224,120,32,.7),inset 0 1px 0 rgba(255,255,255,.3)}
  .gfl-slot-btn:active{transform:translateY(0);filter:brightness(.95)}
  .gfl-slot-name{flex:1;font-size:13px;color:#cfdaea;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none}
  .gfl-modal-footer{display:flex;justify-content:flex-end;padding:12px 16px;border-top:1px solid rgba(255,255,255,.06);flex-shrink:0}
  .gfl-modal-cancel{height:32px;padding:0 14px;border:1px solid rgba(255,255,255,.10);border-radius:8px;background:rgba(255,255,255,.05);color:#cfdaea;font-size:12px;cursor:pointer;transition:background .18s,color .18s}
  .gfl-modal-cancel:hover{background:rgba(255,255,255,.10);color:#e6edf8}
  `;

  const styleEl = document.createElement('style');
  styleEl.textContent = CSS;
  document.head.appendChild(styleEl);

  panel.addEventListener('pointermove', e => {
    const r = panel.getBoundingClientRect();
    panel.style.setProperty('--gfl-mx', (e.clientX - r.left) + 'px');
    panel.style.setProperty('--gfl-my', (e.clientY - r.top) + 'px');
  }, { passive: true });

  (function enableDrag() {
    let drag = null;
    headerEl.addEventListener('pointerdown', e => {
      if (e.target.closest('button')) return;
      const r = panel.getBoundingClientRect();
      drag = { px: e.clientX, py: e.clientY, left: r.left, top: r.top };
      headerEl.setPointerCapture(e.pointerId);
      panel.style.transition = 'none';
      e.preventDefault();
    });
    headerEl.addEventListener('pointermove', e => {
      if (!drag) return;
      const w = panel.offsetWidth, h = panel.offsetHeight;
      let x = drag.left + (e.clientX - drag.px);
      let y = drag.top + (e.clientY - drag.py);
      x = Math.max(6, Math.min(window.innerWidth - w - 6, x));
      y = Math.max(6, Math.min(window.innerHeight - h - 6, y));
      panel.style.left = x + 'px';
      panel.style.top = y + 'px';
    });
    const endDrag = e => {
      if (!drag) return;
      drag = null;
      panel.style.transition = '';
      try { headerEl.releasePointerCapture(e.pointerId); } catch (_) {}
    };
    headerEl.addEventListener('pointerup', endDrag);
    headerEl.addEventListener('pointercancel', endDrag);
  })();

  function setOpen(open) { state.open = open; panel.classList.toggle('gfl-hidden', !open); }
  function toggle() { setOpen(!state.open); }
  $('.gfl-btn-close').addEventListener('click', () => setOpen(false));

  window.addEventListener('keydown', e => {
    if (e.key !== CONFIG.toggleKey) return;
    if (e.repeat) return;
    if (isTyping()) return;
    e.preventDefault();
    toggle();
  }, true);

  let searchTimer = null;
  searchEl.addEventListener('input', () => {
    const v = searchEl.value;
    clearEl.classList.toggle('gfl-on', !!v);
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { state.query = v; renderList(); }, 120);
  });
  clearEl.addEventListener('click', () => {
    searchEl.value = ''; state.query = ''; clearEl.classList.remove('gfl-on');
    renderList(); searchEl.focus();
  });

  selectBtn.addEventListener('click', e => { e.stopPropagation(); selectEl.classList.toggle('gfl-open'); });
  document.addEventListener('click', e => { if (!selectEl.contains(e.target)) selectEl.classList.remove('gfl-open'); });
  panel.addEventListener('click', e => { if (!selectEl.contains(e.target)) selectEl.classList.remove('gfl-open'); });

  reloadBtn.addEventListener('click', () => { LOG('Manual reload'); loadData(); });

  function renderSelect() {
    selectInner.innerHTML = TYPES.map(t => {
      const n = countByType(t.id);
      return `<div class="gfl-opt ${state.type === t.id ? 'gfl-active' : ''}" data-type="${t.id}">
        <span class="gfl-opt-icon">${t.icon}</span>
        <span class="gfl-opt-name">${esc(t.name)}</span>
        <span class="gfl-opt-num">${n}</span></div>`;
    }).join('');
  }
  selectInner.addEventListener('click', e => {
    const opt = e.target.closest('.gfl-opt');
    if (!opt) return;
    state.type = opt.dataset.type;
    selectLbl.textContent = TYPE_MAP[state.type] || 'All Liveries';
    selectEl.classList.remove('gfl-open');
    renderSelect(); renderList();
  });

  function matchesType(item, typeId) {
    if (typeId === 'all') return true;
    const t = String(item.type || '').toLowerCase();
    if (t === typeId) return true;
    return (item.tags || []).map(x => String(x).toLowerCase()).includes(typeId);
  }
  function countByType(typeId) {
    if (typeId === 'all') return state.data.length;
    return state.data.filter(x => matchesType(x, typeId)).length;
  }
  function getFiltered() {
    const q = state.query.trim().toLowerCase();
    const list = state.data.filter(item => {
      if (!matchesType(item, state.type)) return false;
      if (!q) return true;
      const hay = [item.name, item.author, item.type, item.desc, ...(item.tags || [])]
        .filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
    list.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }));
    return list;
  }

  function renderList() {
    const list = getFiltered();
    listEl.innerHTML = '';

    if (!list.length) {
      if (!state.currentAcId) {
        listEl.innerHTML = `<div class="gfl-empty"><span>⏳</span>Loading aircraft…</div>`;
      } else {
        const acInJson = state.groups.some(g => String(g.id) === state.currentAcId);
        if (!acInJson) {
          listEl.innerHTML = `<div class="gfl-empty"><span>✈</span>No liveries available for this aircraft</div>`;
        }
        else if (state.lastError) {
          listEl.innerHTML = `<div class="gfl-empty"><span>⚠</span>Failed to load liveries<br><code>${esc(state.lastError)}</code></div>`;
        }
        else {
          listEl.innerHTML = `<div class="gfl-empty"><span>🔍</span>No matching liveries</div>`;
        }
      }
    } else {
      const frag = document.createDocumentFragment();
      list.forEach((item, i) => frag.appendChild(buildCard(item, i)));
      listEl.appendChild(frag);
    }

    countEl.textContent = `${list.length} ${list.length === 1 ? 'livery' : 'liveries'}`;
  }

  function buildCard(item, index) {
    const name = item.name || 'Untitled Livery';
    const el = document.createElement('div');
    el.className = 'gfl-card';
    el.style.animationDelay = Math.min(index * 22, 300) + 'ms';

    const tags = (item.tags || []).slice(0, CONFIG.maxThumbs);
    if (!tags.length && item.type) tags.push(TYPE_MAP[item.type] || item.type);

    el.innerHTML = `
      <div class="gfl-info">
        <div class="gfl-name">${esc(name)}</div>
        <div class="gfl-sub">
          <span class="gfl-author">by ${esc(item.author || 'Unknown')}</span>
        </div>
        <div class="gfl-tags">${tags.map(t => `<span class="gfl-tag">${esc(TYPE_MAP[t] || t)}</span>`).join('')}</div>
      </div>
    `;
    el.addEventListener('click', () => applyLivery(item, el));
    return el;
  }

  function applyLivery(livery, cardEl) {
    const inst = getAircraftInstance();
    if (!inst) return;

    const acId = getCurrentAircraftId();
    if (livery._aircraftId && acId && String(livery._aircraftId) !== acId) return;

    const def = inst.definition || inst.setup;
    if (!def || !def.parts) return;

    const texRaw   = livery.texture || livery.textureUrl;
    const idxRaw   = livery._index;
    const partsRaw = livery._parts;
    if (!texRaw) return;

    const items = [];

    if (Array.isArray(texRaw)) {
      const indexes = Array.isArray(idxRaw) ? idxRaw : [idxRaw];
      const parts   = Array.isArray(partsRaw) ? partsRaw : [partsRaw];

      for (let i = 0; i < texRaw.length; i++) {
        const t = texRaw[i];
        if (t && typeof t === 'object' && t.url) {
          items.push({
            url  : resolveUrl(t.url),
            index: t.index != null ? t.index : indexes[i],
            part : t.part  != null ? t.part  : (parts[i] != null ? parts[i] : 0)
          });
        } else if (typeof t === 'string') {
          items.push({
            url  : resolveUrl(t),
            index: indexes[i],
            part : parts[i] != null ? parts[i] : 0
          });
        }
      }
    } else if (typeof texRaw === 'string') {
      const idx   = Array.isArray(idxRaw)   ? idxRaw[0]   : idxRaw;
      const part  = Array.isArray(partsRaw) ? partsRaw[0] : (partsRaw != null ? partsRaw : 0);
      items.push({ url: resolveUrl(texRaw), index: idx, part });
    }

    const valid = items.filter(it => it.url && it.index != null);
    if (!valid.length) return;

    const g = W.geofs;
    const version = parseFloat(g && g.version) || 0;
    const api = g && g.api;

    LOG(`Applying "${livery.name}" — ${valid.length} item(s)`);

    if (cardEl) cardEl.classList.add('gfl-loading');

    let changed = 0;

    for (const item of valid) {
      const partIdx = item.part != null ? item.part : 0;
      const texIdx  = item.index;

      const part = def.parts[partIdx];
      if (!part) { ERR('Part not found', partIdx); continue; }

      const model3d = part['3dmodel'];
      if (!model3d || !model3d._model) {
        ERR('3dmodel not found', partIdx);
        continue;
      }

      try {
        if (version === 2.9 && api.Model && api.Model.prototype.changeTexture) {
          api.Model.prototype.changeTexture(item.url, texIdx, model3d);
        } else if (version >= 3.0 && version <= 3.7 && typeof api.changeModelTexture === 'function') {
          api.changeModelTexture(model3d._model, item.url, texIdx);
        } else if (typeof api.changeModelTexture === 'function') {
          api.changeModelTexture(model3d._model, item.url, { index: texIdx });
        } else if (model3d._model.changeTexture) {
          model3d._model.changeTexture(item.url, { index: texIdx });
        } else {
          throw new Error('No texture-change API available');
        }
        changed++;
      } catch (err) {
        ERR('Failed slot ' + texIdx, err);
      }
    }

    if (cardEl) cardEl.classList.remove('gfl-loading');
    LOG(`Applied ${changed}/${valid.length} slot(s)`);
  }

  W.GeoFSLiverySwitcher = {
    apply: applyLivery, state, reload: loadData, panel, setOpen, toggle,
    current: getCurrentAircraftId,
    debug: () => {
      const inst = getAircraftInstance();
      const g = W.geofs;
      console.log('--- GeoFS Livery Switcher debug ---');
      console.log('geofs.version:', g && g.version);
      console.log('instance:', inst);
      console.log('instance.aircraftRecord.id:', inst && inst.aircraftRecord && inst.aircraftRecord.id);
      console.log('instance.definition.labels:', inst && inst.definition && inst.definition.labels);
      console.log('resolved id:', getCurrentAircraftId());
      console.log('slot labels:', getSlotLabels());
      console.log('current group:', findCurrentGroup(state.groups));
      console.log('-----------------------------------');
    }
  };

  const FALLBACK = [{
    aircraft: 'Unknown', id: 'unknown', index: [2], parts: [0],
    liveries: [{ name: 'Sample Livery (JSON failed to load)', author: '—',
      type: 'virtual', tags: ['Sample'], texture: '' }]
  }];

  async function loadData() {
    state.lastError = '';
    let groups = [];
    try {
      const json = await fetchJson(CONFIG.jsonUrl);
      groups = Array.isArray(json) ? json : (json.aircraft || []);
      if (!groups.length) throw new Error('JSON was empty');
      LOG('Loaded', groups.length, 'aircraft group(s)');
    } catch (err) {
      ERR('Load failed:', err);
      state.lastError = err.message || String(err);
      groups = FALLBACK;
      toast('JSON load failed: ' + state.lastError, 4000);
    }
    state.groups = groups;
    state.data = flattenForCurrentAircraft(groups);
    renderSelect();
    renderList();
  }

  (function init() {
    LOG('Version 1.4');
    LOG('Current aircraft ID:', getCurrentAircraftId());

    requestAnimationFrame(() => {
      const r = panel.getBoundingClientRect();
      if (r.bottom > window.innerHeight) panel.style.top = Math.max(10, window.innerHeight - r.height - 16) + 'px';
      if (r.right > window.innerWidth) panel.style.left = Math.max(10, window.innerWidth - r.width - 16) + 'px';
    });

    loadData();

    let lastId = getCurrentAircraftId();

    function checkAircraftChanged() {
      const now = getCurrentAircraftId();
      if (now !== lastId) {
        LOG('Aircraft changed:', lastId, '→', now);
        lastId = now;
        loadData();
      }
    }

    setInterval(checkAircraftChanged, 1000);

    (function watchAircraft() {
      checkAircraftChanged();
      requestAnimationFrame(watchAircraft);
    })();
  })();

})();