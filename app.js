(function() {
  // ========== SERVICE WORKER ==========
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // ========== PWA INSTALL ==========
  let deferredPrompt = null;
  const installBanner = document.createElement('div');
  installBanner.className = 'install-banner';
  installBanner.innerHTML = '<span>📱 Установить приложение</span><button id="installBtn">Установить</button>';
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); deferredPrompt = e; installBanner.classList.add('show');
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null; installBanner.classList.remove('show');
  });

  // ========== VIBRATION ==========
  function vibrate(pattern) {
    if (navigator.vibrate) navigator.vibrate(pattern);
  }

  // ========== THEME ==========
  const themeKey = 'warehouse_theme';
  function getTheme() { return localStorage.getItem(themeKey) || 'light'; }
  function setTheme(t) {
    localStorage.setItem(themeKey, t);
    document.body.classList.toggle('dark', t === 'dark');
    const toggle = document.getElementById('themeToggle');
    if (toggle) toggle.textContent = t === 'dark' ? '☀️' : '🌓';
  }
  setTheme(getTheme());

  // ========== STORAGE ==========
  const STORAGE = {
    entries: 'warehouse_entries', employees: 'warehouse_employees',
    models: 'warehouse_models', quickColors: 'warehouse_colors', quickSizes: 'warehouse_sizes'
  };
  function load(key, fallback = []) {
    try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : fallback; } catch { return fallback; }
  }
  function save(key, data) { localStorage.setItem(key, JSON.stringify(data)); }

  // ========== STATE ==========
  let entries = load(STORAGE.entries, []);
  let employees = load(STORAGE.employees, ['Анна', 'Олег', 'Мария']);
  let models = load(STORAGE.models, ['Футболка', 'Джинсы', 'Куртка']);
  let quickColors = load(STORAGE.quickColors, ['Чёрный', 'Белый', 'Синий']);
  let quickSizes = load(STORAGE.quickSizes, ['42', '44', '46', '48', '50', '52']);
  let currentTab = 'add';
  let historyFilter = { search: '', employee: '', model: '', size: '', dateFrom: '', dateTo: '' };
  let statsPeriod = 'all';

  function persistAll() {
    save(STORAGE.entries, entries);
    save(STORAGE.employees, employees);
    save(STORAGE.models, models);
    save(STORAGE.quickColors, quickColors);
    save(STORAGE.quickSizes, quickSizes);
  }

  // ========== HELPERS ==========
  function normalizeSize(s) { return (s || '').trim().toLowerCase(); }
  function groupSum(list, keyFn) {
    const map = new Map();
    list.forEach(item => { const k = keyFn(item); const q = Number(item.quantity) || 0; map.set(k, (map.get(k) || 0) + q); });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }
  function formatDate(iso) { return new Date(iso).toLocaleDateString('ru-RU'); }
  function getToday() { return new Date().toISOString().slice(0, 10); }
  function getYesterday() {
    const d = new Date(Date.now() - 86400000);
    return d.toISOString().slice(0, 10);
  }
  function getWeekDay(iso) {
    const days = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
    return days[new Date(iso).getDay()];
  }

  // ========== RENDER ==========
  const appContent = document.getElementById('app-content');

  function render() {
    switch (currentTab) {
      case 'add': renderAdd(); break;
      case 'history': renderHistory(); break;
      case 'stats': renderStats(); break;
      case 'models': renderModelAnalysis(); break;
      case 'settings': renderSettings(); break;
    }
    if (installBanner.classList.contains('show') && !appContent.contains(installBanner)) {
      appContent.insertBefore(installBanner, appContent.firstChild);
    }
    const ib = document.getElementById('installBtn');
    if (ib && deferredPrompt) {
      ib.onclick = async () => {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        deferredPrompt = null;
        installBanner.classList.remove('show');
        vibrate(50);
      };
    }
    const tt = document.getElementById('themeToggle');
    if (tt) {
      tt.onclick = () => {
        const newTheme = getTheme() === 'light' ? 'dark' : 'light';
        setTheme(newTheme);
        vibrate(30);
      };
    }
  }

  function navHtml() {
    const tabs = [
      { key: 'add', label: '➕' }, { key: 'history', label: '📋' },
      { key: 'stats', label: '📊' }, { key: 'models', label: '📐' },
      { key: 'settings', label: '⚙️' }
    ];
    return `<nav>${tabs.map(t => `<button class="${currentTab === t.key ? 'active' : ''}" data-tab="${t.key}">${t.label}</button>`).join('')}</nav>`;
  }

  function shiftWidget() {
    const today = getToday();
    const yesterday = getYesterday();
    const todayEntries = entries.filter(e => e.createdAt.startsWith(today));
    const yesterdayEntries = entries.filter(e => e.createdAt.startsWith(yesterday));
    const todayQty = todayEntries.reduce((s, e) => s + (e.quantity || 0), 0);
    const yesterdayQty = yesterdayEntries.reduce((s, e) => s + (e.quantity || 0), 0);
    const diff = todayQty - yesterdayQty;
    const pct = yesterdayQty > 0 ? Math.round((diff / yesterdayQty) * 100) : (todayQty > 0 ? 100 : 0);
    const emps = new Set(todayEntries.map(e => e.employee)).size;
    const recs = todayEntries.length;

    return `<div class="shift-widget">
      <div class="shift-header">
        <span class="shift-title">⚡ Текущая смена</span>
        <span class="shift-date">${formatDate(today + 'T00:00:00')}</span>
      </div>
      <div class="shift-stats">
        <div class="shift-stat"><div class="shift-stat-value">${todayQty}</div><div class="shift-stat-label">Единиц</div></div>
        <div class="shift-stat"><div class="shift-stat-value">${recs}</div><div class="shift-stat-label">Записей</div></div>
        <div class="shift-stat"><div class="shift-stat-value">${emps}</div><div class="shift-stat-label">Сотрудников</div></div>
      </div>
      <div class="shift-comparison">
        ${diff >= 0
          ? `📈 На <span class="up">+${diff} (${pct}%)</span> больше, чем вчера`
          : `📉 На <span class="down">${diff} (${pct}%)</span> меньше, чем вчера`}
      </div>
    </div>`;
  }

  // ========== TAB: ADD ==========
  function renderAdd() {
    let html = shiftWidget() + navHtml() + `<h2>📦 Новая запись</h2>`;
    html += `<div class="form-group"><label>Сотрудник</label><select id="empSelect">${employees.map(e => `<option>${e}</option>`).join('')}</select><input placeholder="Новый сотрудник" id="newEmp" style="margin-top:6px;"></div>`;
    html += `<div class="form-group"><label>Модель</label><select id="modelSelect">${models.map(m => `<option>${m}</option>`).join('')}</select><input placeholder="Новая модель" id="newModel" style="margin-top:6px;"></div>`;
    html += `<div class="form-group"><label>Цвет</label><input id="colorInput" placeholder="Введите цвет"><div class="chip-row">${quickColors.map(c => `<span class="chip color-chip">${c}</span>`).join('')}</div></div>`;
    html += `<div class="form-group"><label>Размер</label><input id="sizeInput" placeholder="Размер"><div class="chip-row">${quickSizes.map(s => `<span class="chip size-chip">${s}</span>`).join('')}</div></div>`;
    html += `<div class="form-group"><label>Количество</label><input id="qtyInput" type="number" value="1" min="1"></div>`;
    html += `<div class="form-group"><label>Комментарий</label><textarea id="noteInput" placeholder="Необязательно"></textarea></div>`;
    html += `<div class="actions"><button class="btn" id="saveBtn">💾 Сохранить</button><button class="btn secondary" id="clearBtn">🧹 Очистить</button></div>`;
    appContent.innerHTML = html;

    document.getElementById('saveBtn').onclick = () => {
      const emp = document.getElementById('empSelect').value || document.getElementById('newEmp').value.trim();
      const mod = document.getElementById('modelSelect').value || document.getElementById('newModel').value.trim();
      const col = document.getElementById('colorInput').value.trim();
      const sz = normalizeSize(document.getElementById('sizeInput').value);
      const qty = parseInt(document.getElementById('qtyInput').value, 10) || 0;
      const note = document.getElementById('noteInput').value.trim();
      if (!emp || !mod || !sz || qty <= 0) return alert('Заполните обязательные поля');
      entries.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2,6), createdAt: new Date().toISOString(), employee: emp, model: mod, color: col, size: sz, quantity: qty, note });
      if (!employees.includes(emp)) employees.push(emp);
      if (!models.includes(mod)) models.push(mod);
      persistAll();
      vibrate([30, 50, 30]);
      renderAdd();
    };
    document.getElementById('clearBtn').onclick = () => renderAdd();
    document.querySelectorAll('.color-chip').forEach(c => c.onclick = () => { document.getElementById('colorInput').value = c.textContent; });
    document.querySelectorAll('.size-chip').forEach(c => c.onclick = () => { document.getElementById('sizeInput').value = c.textContent; });
  }

  // ========== TAB: HISTORY (группировка по дням) ==========
  function filteredEntries() {
    return entries.filter(e => {
      const f = historyFilter;
      if (f.search) { const t = `${e.employee} ${e.model} ${e.color} ${e.size} ${e.note}`.toLowerCase(); if (!t.includes(f.search.toLowerCase())) return false; }
      if (f.employee && e.employee !== f.employee) return false;
      if (f.model && e.model !== f.model) return false;
      if (f.size && e.size !== normalizeSize(f.size)) return false;
      if (f.dateFrom && e.createdAt < f.dateFrom) return false;
      if (f.dateTo && e.createdAt > f.dateTo + 'T23:59:59') return false;
      return true;
    });
  }

  function renderHistory() {
    const filtered = filteredEntries().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const totalQty = filtered.reduce((s, e) => s + (e.quantity || 0), 0);
    const uniqueEmps = new Set(filtered.map(e => e.employee)).size;
    const uniqueModels = new Set(filtered.map(e => e.model)).size;
    const uniqueSizes = new Set(filtered.map(e => e.size)).size;

    // Группировка по дням
    const groups = new Map();
    filtered.forEach(e => {
      const day = e.createdAt.slice(0, 10);
      if (!groups.has(day)) groups.set(day, []);
      groups.get(day).push(e);
    });

    let html = navHtml() + `<h2>📋 История</h2>`;
    html += `<div class="summary-bar"><span class="stat-item">📌 Записей: ${filtered.length}</span><span class="stat-item">🔢 Сумма: ${totalQty}</span><span class="stat-item">👥 Сотрудников: ${uniqueEmps}</span><span class="stat-item">👕 Моделей: ${uniqueModels}</span><span class="stat-item">📏 Размеров: ${uniqueSizes}</span></div>`;
    html += `<div class="filters">
      <input placeholder="🔍 Поиск" id="hSearch" value="${historyFilter.search}">
      <select id="hEmp"><option value="">Все</option>${employees.map(e => `<option ${historyFilter.employee===e?'selected':''}>${e}</option>`).join('')}</select>
      <select id="hModel"><option value="">Все</option>${models.map(m => `<option ${historyFilter.model===m?'selected':''}>${m}</option>`).join('')}</select>
      <input placeholder="Размер" id="hSize" value="${historyFilter.size}">
      <input type="date" id="hFrom" value="${historyFilter.dateFrom}">
      <input type="date" id="hTo" value="${historyFilter.dateTo}">
    </div>`;

    if (groups.size === 0) {
      html += `<div class="empty-state">Нет записей</div>`;
    } else {
      groups.forEach((dayEntries, day) => {
        const dayTotal = dayEntries.reduce((s, e) => s + (e.quantity || 0), 0);
        html += `<div class="day-group">
          <div class="day-header">📅 ${formatDate(day + 'T00:00:00')}, ${getWeekDay(day)}<span class="day-total">${dayEntries.length} записей · ${dayTotal} ед.</span></div>`;
        dayEntries.forEach(e => {
          html += `<div class="entry-row">
            <div class="entry-info"><span class="badge">${e.employee}</span><span>${e.model}</span><span>🎨 ${e.color||'-'}</span><span>📏 ${e.size}</span><span>✖️ ${e.quantity}</span>${e.note?`<small style="color:#8b6a50;">💬 ${e.note}</small>`:''}</div>
            <button class="del-btn" data-id="${e.id}">🗑️</button>
          </div>`;
        });
        html += `</div>`;
      });
    }
    appContent.innerHTML = html;

    ['hSearch','hSize','hFrom','hTo'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.oninput = (e) => { historyFilter[id.replace('h','').toLowerCase()] = e.target.value; renderHistory(); };
    });
    document.getElementById('hEmp').onchange = (e) => { historyFilter.employee = e.target.value; renderHistory(); };
    document.getElementById('hModel').onchange = (e) => { historyFilter.model = e.target.value; renderHistory(); };
    document.querySelectorAll('.del-btn').forEach(b => b.onclick = () => {
      entries = entries.filter(e => e.id !== b.dataset.id);
      persistAll();
      vibrate(100);
      renderHistory();
    });
  }

  // ========== TAB: STATS ==========
  function getPeriodEntries(period) {
    const now = new Date();
    if (period === 'today') return entries.filter(e => e.createdAt.startsWith(getToday()));
    if (period === 'week') return entries.filter(e => e.createdAt >= new Date(now.getTime() - 7*86400000).toISOString());
    if (period === 'month') return entries.filter(e => e.createdAt >= new Date(now.getTime() - 30*86400000).toISOString());
    return [...entries];
  }

  function renderStats() {
    const periods = ['today','week','month','all'];
    const labels = { today:'Сегодня', week:'Неделя', month:'Месяц', all:'Всё' };
    const data = getPeriodEntries(statsPeriod);
    const total = data.reduce((s,e)=>s+(e.quantity||0),0);
    const topEmp = groupSum(data, e=>e.employee);
    const topMod = groupSum(data, e=>e.model);
    const topSiz = groupSum(data, e=>e.size);

    let html = navHtml() + `<h2>📊 Статистика</h2>`;
    html += `<div class="chip-row" style="margin-bottom:16px;">${periods.map(p=>`<button class="chip period-chip ${statsPeriod===p?'active':''}" data-period="${p}">${labels[p]}</button>`).join('')}</div>`;
    html += `<div class="stats-grid">
      <div class="card"><strong>📦 Общее количество</strong><span>${total}</span></div>
      <div class="card"><strong>📋 Записей</strong><span>${data.length}</span></div>
      <div class="card"><strong>👥 Сотрудников</strong><span>${new Set(data.map(e=>e.employee)).size}</span></div>
      <div class="card"><strong>👕 Моделей</strong><span>${new Set(data.map(e=>e.model)).size}</span></div>
      <div class="card"><strong>📏 Размеров</strong><span>${new Set(data.map(e=>e.size)).size}</span></div>
    </div>`;
    html += `<h3>🏆 Топ сотрудников</h3><ul class="top-list">${topEmp.slice(0,5).map(([k,v])=>`<li><span>${k}</span><span>${v}</span></li>`).join('')||'<li>—</li>'}</ul>`;
    html += `<h3>👕 Топ моделей</h3><ul class="top-list">${topMod.slice(0,5).map(([k,v])=>`<li><span>${k}</span><span>${v}</span></li>`).join('')||'<li>—</li>'}</ul>`;
    html += `<h3>🔥 Топ размеров</h3><ul class="top-list">${topSiz.map(([k,v])=>`<li><span>${k}</span><span>${v}</span></li>`).join('')||'<li>—</li>'}</ul>`;
    html += `<h3>📈 Динамика (14 дней)</h3><canvas id="chart" width="400" height="180"></canvas>`;
    html += `<hr><div class="actions"><button class="btn secondary" id="exportCSV">📥 CSV</button><button class="btn secondary" id="exportXLSX">📥 XLSX</button><button class="btn secondary" id="importJSON">📤 Импорт JSON</button><input type="file" id="importFile" accept=".json" style="display:none"></div>`;
    appContent.innerHTML = html;

    document.querySelectorAll('.period-chip').forEach(c => c.onclick = () => { statsPeriod = c.dataset.period; renderStats(); });
    setTimeout(() => {
      const canvas = document.getElementById('chart');
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const days = []; for (let i=13; i>=0; i--) days.push(new Date(Date.now()-i*86400000).toISOString().slice(0,10));
      const vals = days.map(d => entries.filter(e=>e.createdAt.startsWith(d)).reduce((s,e)=>s+(e.quantity||0),0));
      const max = Math.max(...vals, 1);
      ctx.fillStyle = getTheme()==='dark'?'#1a1a2e':'#faf5f0';
      ctx.fillRect(0,0,canvas.width,canvas.height);
      const bw = (canvas.width-20)/days.length;
      vals.forEach((v,i) => { const h=(v/max)*140; ctx.fillStyle = getTheme()==='dark'?'#9b59b6':'#e8836b'; ctx.fillRect(10+i*bw,160-h,bw-4,h); });
      ctx.fillStyle = getTheme()==='dark'?'#e0d6c8':'#3d2c1e';
      ctx.font = '10px sans-serif';
      days.forEach((d,i) => { if(i%3===0) ctx.fillText(d.slice(5), 10+i*bw, 175); });
    }, 20);

    document.getElementById('exportCSV').onclick = () => {
      const rows = [['Сотрудник','Модель','Цвет','Размер','Кол-во','Комментарий','Дата']];
      entries.forEach(e => rows.push([e.employee,e.model,e.color,e.size,e.quantity,e.note,formatDate(e.createdAt)]));
      downloadBlob(rows.map(r=>r.map(c=>`"${(c||'').replace(/"/g,'""')}"`).join(',')).join('\n'), 'warehouse.csv', 'text/csv');
    };
    document.getElementById('exportXLSX').onclick = () => {
      let xml = `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet><Table>`;
      xml += '<Row><Cell><Data>Сотрудник</Data></Cell><Cell><Data>Модель</Data></Cell><Cell><Data>Цвет</Data></Cell><Cell><Data>Размер</Data></Cell><Cell><Data>Кол-во</Data></Cell><Cell><Data>Комментарий</Data></Cell><Cell><Data>Дата</Data></Cell></Row>';
      entries.forEach(e => xml += `<Row><Cell><Data>${e.employee}</Data></Cell><Cell><Data>${e.model}</Data></Cell><Cell><Data>${e.color||''}</Data></Cell><Cell><Data>${e.size}</Data></Cell><Cell><Data>${e.quantity}</Data></Cell><Cell><Data>${e.note||''}</Data></Cell><Cell><Data>${formatDate(e.createdAt)}</Data></Cell></Row>`);
      xml += '</Table></Worksheet></Workbook>';
      downloadBlob(xml, 'warehouse.xls', 'application/vnd.ms-excel');
    };
    document.getElementById('importJSON').onclick = () => document.getElementById('importFile').click();
    document.getElementById('importFile').onchange = (e) => {
      const file = e.target.files[0]; if(!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try { const data = JSON.parse(ev.target.result); if(Array.isArray(data)) { entries = data; persistAll(); renderStats(); } } catch { alert('Ошибка JSON'); }
      };
      reader.readAsText(file); e.target.value = '';
    };
  }

  // ========== TAB: MODEL ANALYSIS (с быстрым +1) ==========
  function renderModelAnalysis() {
    const allModels = [...new Set(entries.map(e => e.model))].sort();
    const stored = sessionStorage.getItem('analysisModel');
    const selectedModel = (stored && allModels.includes(stored)) ? stored : (allModels[0] || '');
    const setModel = (m) => { sessionStorage.setItem('analysisModel', m); renderModelAnalysis(); };

    let html = navHtml() + `<h2>📐 Анализ по моделям</h2>`;
    if (!allModels.length) { appContent.innerHTML = html + `<div class="empty-state">Нет данных</div>`; return; }

    html += `<div class="model-selector">${allModels.map(m => `<button class="chip ${m===selectedModel?'active':''}" data-model="${m}">${m}</button>`).join('')}</div>`;
    const me = entries.filter(e => e.model === selectedModel);
    const total = me.reduce((s,e)=>s+(e.quantity||0),0);
    const sz = groupSum(me, e=>e.size);
    const cl = groupSum(me, e=>e.color||'без цвета');

    html += `<h3>👕 Модель: <span style="color:#c45a40;">${selectedModel}</span></h3>`;
    html += `<div class="stats-grid"><div class="card"><strong>📦 Всего</strong><span>${total}</span></div><div class="card"><strong>📋 Записей</strong><span>${me.length}</span></div><div class="card"><strong>📏 Размеров</strong><span>${sz.length}</span></div><div class="card"><strong>🎨 Цветов</strong><span>${cl.length}</span></div></div>`;

    html += `<h3>📏 Размеры «${selectedModel}»</h3><table class="size-model-table"><thead><tr><th>Размер</th><th>Кол-во</th><th>%</th><th></th></tr></thead><tbody>`;
    sz.forEach(([s,q]) => html += `<tr><td><span class="highlight">${s}</span></td><td>${q}</td><td>${total?((q/total)*100).toFixed(1):0}%</td><td><button class="quick-add-btn" data-model="${selectedModel}" data-size="${s}">+1</button></td></tr>`);
    html += `</tbody></table>`;

    html += `<h3>🎨 Цвета</h3><table class="size-model-table"><thead><tr><th>Цвет</th><th>Кол-во</th></tr></thead><tbody>`;
    cl.forEach(([c,q]) => html += `<tr><td>${c}</td><td>${q}</td></tr>`);
    html += `</tbody></table>`;

    appContent.innerHTML = html;
    document.querySelectorAll('[data-model]').forEach(b => b.onclick = () => setModel(b.dataset.model));
    document.querySelectorAll('.quick-add-btn').forEach(b => b.onclick = () => {
      const model = b.dataset.model;
      const size = b.dataset.size;
      entries.push({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2,6),
        createdAt: new Date().toISOString(),
        employee: employees[0] || '—', model, color: '', size, quantity: 1, note: 'Быстрое добавление'
      });
      persistAll();
      vibrate([20, 40, 20]);
      renderModelAnalysis();
    });
  }

  function downloadBlob(content, filename, mime) {
    const blob = new Blob([content], {type: mime});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }

  // ========== TAB: SETTINGS ==========
  function renderSettings() {
    let html = navHtml() + `<h2>⚙️ Настройки</h2>`;
    html += `<div class="theme-row"><strong>🌓 Тема</strong><span>${getTheme()==='dark'?'Тёмная':'Светлая'}</span><button class="btn secondary" id="switchThemeBtn">Переключить</button></div>`;
    html += `<div class="settings-list"><strong>👥 Сотрудники</strong><div>${employees.map((e,i)=>`<div class="inline-edit"><input value="${e}" data-idx="${i}" class="empVal"><button class="chip delEmp" data-idx="${i}">✕</button></div>`).join('')}</div><div class="inline-edit"><input placeholder="Добавить" id="addEmp"><button class="chip" id="addEmpBtn">+</button></div></div>`;
    html += `<div class="settings-list"><strong>👕 Модели</strong><div>${models.map((m,i)=>`<div class="inline-edit"><input value="${m}" data-idx="${i}" class="modelVal"><button class="chip delModel" data-idx="${i}">✕</button></div>`).join('')}</div><div class="inline-edit"><input placeholder="Добавить" id="addModel"><button class="chip" id="addModelBtn">+</button></div></div>`;
    html += `<div class="settings-list"><strong>🎨 Цвета</strong><div>${quickColors.map((c,i)=>`<div class="inline-edit"><input value="${c}" data-idx="${i}" class="colorVal"><button class="chip delColor" data-idx="${i}">✕</button></div>`).join('')}</div><div class="inline-edit"><input placeholder="Добавить" id="addColor"><button class="chip" id="addColorBtn">+</button></div></div>`;
    html += `<div class="settings-list"><strong>📏 Размеры</strong><div>${quickSizes.map((s,i)=>`<div class="inline-edit"><input value="${s}" data-idx="${i}" class="sizeVal"><button class="chip delSize" data-idx="${i}">✕</button></div>`).join('')}</div><div class="inline-edit"><input placeholder="Добавить" id="addSize"><button class="chip" id="addSizeBtn">+</button></div></div>`;
    html += `<hr><div class="install-info"><strong>📱 Установка</strong><p>Chrome → «⋮» → «Установить приложение»</p></div>`;
    appContent.innerHTML = html;

    document.getElementById('switchThemeBtn').onclick = () => { setTheme(getTheme()==='light'?'dark':'light'); vibrate(30); renderSettings(); };

    function bind(cls, list) {
      document.querySelectorAll(`.${cls}`).forEach(inp => inp.oninput = (e) => { list[+e.target.dataset.idx] = e.target.value; persistAll(); });
    }
    bind('empVal', employees); bind('modelVal', models); bind('colorVal', quickColors); bind('sizeVal', quickSizes);

    document.querySelectorAll('.delEmp').forEach(b => b.onclick = function() { employees.splice(+this.dataset.idx,1); persistAll(); renderSettings(); });
    document.querySelectorAll('.delModel').forEach(b => b.onclick = function() { models.splice(+this.dataset.idx,1); persistAll(); renderSettings(); });
    document.querySelectorAll('.delColor').forEach(b => b.onclick = function() { quickColors.splice(+this.dataset.idx,1); persistAll(); renderSettings(); });
    document.querySelectorAll('.delSize').forEach(b => b.onclick = function() { quickSizes.splice(+this.dataset.idx,1); persistAll(); renderSettings(); });

    document.getElementById('addEmpBtn').onclick = () => { const v = document.getElementById('addEmp').value.trim(); if(v&&!employees.includes(v)){employees.push(v);persistAll();renderSettings();} };
    document.getElementById('addModelBtn').onclick = () => { const v = document.getElementById('addModel').value.trim(); if(v&&!models.includes(v)){models.push(v);persistAll();renderSettings();} };
    document.getElementById('addColorBtn').onclick = () => { const v = document.getElementById('addColor').value.trim(); if(v&&!quickColors.includes(v)){quickColors.push(v);persistAll();renderSettings();} };
    document.getElementById('addSizeBtn').onclick = () => { const v = document.getElementById('addSize').value.trim(); if(v&&!quickSizes.includes(v)){quickSizes.push(v);persistAll();renderSettings();} };
  }

  // ========== NAVIGATION ==========
  appContent.addEventListener('click', (e) => {
    if (e.target.dataset.tab) { currentTab = e.target.dataset.tab; render(); }
  });

  render();
})();
