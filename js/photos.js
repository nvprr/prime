/* ============================================================
   PRIME LIFE MAXING — photos.js
   Optional private progress photos.
   - Stored ONLY in this device's IndexedDB (database "prime_photos").
     Never in localStorage, never uploaded anywhere.
   - Photos are downscaled before saving (≤1280 px JPEG) to save space.
   - Image bytes are stored as ArrayBuffer (more reliable than Blob in
     older Safari versions).
   - The JSON export does NOT include photos (stated in the UI).
   ============================================================ */
(function () {
  'use strict';
  const Prime = window.Prime, ui = Prime.ui, h = ui.h, D = Prime.D;
  const DB_NAME = 'prime_photos', STORE = 'photos';
  const MAX_SIDE = 1280, THUMB_SIDE = 320, QUALITY = 0.82;

  let dbPromise = null;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error('Ta przeglądarka nie udostępnia IndexedDB.')); return; }
      let req;
      try { req = indexedDB.open(DB_NAME, 1); } catch (e) { reject(e); return; }
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' }); };
      req.onsuccess = () => { req.result.onversionchange = () => { req.result.close(); dbPromise = null; }; resolve(req.result); };
      req.onerror = () => reject(req.error || new Error('Nie można otworzyć bazy zdjęć.'));
      req.onblocked = () => reject(new Error('Baza zdjęć jest zablokowana przez inną kartę.'));
    }).catch((e) => { dbPromise = null; throw e; });
    return dbPromise;
  }

  function tx(mode, fn) {
    return openDB().then(db => new Promise((resolve, reject) => {
      let t, result;
      try { t = db.transaction(STORE, mode); } catch (e) { reject(e); return; }
      t.oncomplete = () => resolve(result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('Transakcja przerwana.'));
      try { result = fn(t.objectStore(STORE), (v) => { result = v; }); } catch (e) { reject(e); }
    }));
  }

  const dbAdd = (rec) => tx('readwrite', (s) => { s.put(rec); });
  const dbDelete = (id) => tx('readwrite', (s) => { s.delete(id); });
  const dbClear = () => tx('readwrite', (s) => { s.clear(); });
  function dbAll() {
    return openDB().then(db => new Promise((resolve, reject) => {
      const out = [];
      const t = db.transaction(STORE, 'readonly');
      const req = t.objectStore(STORE).openCursor();
      req.onsuccess = () => { const c = req.result; if (c) { out.push(c.value); c.continue(); } };
      t.oncomplete = () => resolve(out);
      t.onerror = () => reject(t.error);
    }));
  }

  function friendlyError(e) {
    const n = e && e.name;
    if (n === 'QuotaExceededError') return 'Brak miejsca na urządzeniu. Usuń część zdjęć i spróbuj ponownie.';
    if (n === 'SecurityError' || n === 'InvalidStateError') return 'Przeglądarka blokuje zapis zdjęć (tryb prywatny lub ograniczenia).';
    return (e && e.message) || 'Nie udało się zapisać zdjęcia.';
  }

  /* ---------------- image processing ---------------- */

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Nie można odczytać tego pliku jako obrazu.')); };
      img.src = url;
    });
  }

  function scaleToBuffer(img, maxSide) {
    const ratio = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * ratio)), hgt = Math.max(1, Math.round(img.naturalHeight * ratio));
    const c = document.createElement('canvas'); c.width = w; c.height = hgt;
    c.getContext('2d').drawImage(img, 0, 0, w, hgt);
    return new Promise((resolve, reject) => {
      c.toBlob((blob) => {
        if (!blob) { reject(new Error('Nie udało się przetworzyć obrazu.')); return; }
        const fr = new FileReader();
        fr.onload = () => resolve({ buf: fr.result, w, h: hgt });
        fr.onerror = () => reject(new Error('Nie udało się odczytać przetworzonego obrazu.'));
        fr.readAsArrayBuffer(blob);
      }, 'image/jpeg', QUALITY);
    });
  }

  async function addPhoto(file, date, note) {
    if (!file || !/^image\//.test(file.type || 'image/')) throw new Error('Wybierz plik graficzny.');
    const img = await loadImage(file);
    const main = await scaleToBuffer(img, MAX_SIDE);
    const thumb = await scaleToBuffer(img, THUMB_SIDE);
    const rec = { id: Prime.uid(), date, note: note || '', type: 'image/jpeg', buf: main.buf, thumb: thumb.buf, w: main.w, h: main.h, created: new Date().toISOString() };
    await dbAdd(rec);
    return rec;
  }

  const urls = [];
  function urlFor(buf, type) { const u = URL.createObjectURL(new Blob([buf], { type: type || 'image/jpeg' })); urls.push(u); return u; }
  function revokeAll() { while (urls.length) { try { URL.revokeObjectURL(urls.pop()); } catch (e) { /* ignore */ } } }

  /* ---------------- UI ---------------- */

  function fmtBytes(n) { return n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.round(n / 1024) + ' KB'; }

  async function storageInfo(photos) {
    const used = photos.reduce((a, p) => a + (p.buf ? p.buf.byteLength : 0) + (p.thumb ? p.thumb.byteLength : 0), 0);
    let quota = null;
    try { if (navigator.storage && navigator.storage.estimate) { const e = await navigator.storage.estimate(); quota = e.quota ? e : null; } } catch (e) { /* ignore */ }
    return { used, quota };
  }

  function openAddSheet(done) {
    const file = h('input', { type: 'file', accept: 'image/*', 'aria-label': 'Wybierz zdjęcie' });
    const date = ui.input({ type: 'date', value: Prime.today(), max: Prime.today() });
    const note = ui.input({ placeholder: 'Notatka (opcjonalnie)', maxlength: '200' });
    const status = h('p.hint');
    ui.sheet({
      title: 'Dodaj zdjęcie', sub: 'Zdjęcie zostanie zmniejszone i zapisane tylko na tym urządzeniu.',
      body: h('div', null, ui.field('Plik', file), ui.field('Data', date), ui.field('Notatka', note), status), focus: false,
      actions: [{ label: 'Anuluj', kind: 'ghost' }, { label: 'Zapisz', kind: 'primary', keepOpen: true, onClick: async (ev) => {
        const f = file.files && file.files[0];
        if (!f) { ui.toast('Wybierz zdjęcie'); return; }
        if (!D.isDateStr(date.value)) { ui.toast('Podaj datę'); return; }
        const btn = ev.currentTarget; btn.disabled = true; status.textContent = 'Zapisywanie…';
        try { await addPhoto(f, date.value, note.value.trim()); ui.closeModals(); ui.toast('Zdjęcie zapisane'); done(); }
        catch (e) { status.textContent = friendlyError(e); btn.disabled = false; }
      } }],
    });
  }

  function openViewer(p, refresh) {
    const img = h('img.photo-full', { src: urlFor(p.buf, p.type), alt: `Zdjęcie z ${D.formatFullDate(p.date)}` });
    ui.sheet({
      title: D.formatFullDate(p.date), sub: p.note || '', body: img, focus: false,
      actions: [
        { label: 'Pobierz', kind: 'ghost', keepOpen: true, onClick: () => ui.download(`prime-zdjecie-${p.date}.jpg`, new Blob([p.buf], { type: p.type })) },
        { label: 'Usuń', kind: 'ghost', keepOpen: true, onClick: async () => {
          ui.closeModals();
          const ok = await ui.confirm({ title: 'Usunąć zdjęcie?', text: 'Zdjęcie zostanie trwale usunięte z tego urządzenia.', okLabel: 'Usuń' });
          if (!ok) return;
          try { await dbDelete(p.id); refresh(); } catch (e) { ui.toast(friendlyError(e)); }
        } },
        { label: 'Zamknij', kind: 'primary' },
      ],
    });
  }

  function openCompare(a, b) {
    const [older, newer] = a.date <= b.date ? [a, b] : [b, a];
    const days = D.diffDays(older.date, newer.date);
    const col = (p) => h('figure.cmp-fig', null, h('img', { src: urlFor(p.buf, p.type), alt: `Zdjęcie z ${D.formatFullDate(p.date)}` }), h('figcaption', { text: D.shortLabel(p.date) + (p.note ? ' · ' + p.note : '') }));
    ui.sheet({ title: 'Porównanie', sub: days === 0 ? 'To samo ' + 'dnia' : `Odstęp: ${days} ${Prime.plural(days, 'dzień', 'dni', 'dni')}`, body: h('div.cmp-grid', null, col(older), col(newer)), actions: [{ label: 'Zamknij', kind: 'primary' }], focus: false });
  }

  function openPanel() {
    ui.openPanel({
      id: 'photos', title: 'Zdjęcia sylwetki', onClose: revokeAll,
      actions: [h('button.icon-btn.accent', { type: 'button', 'aria-label': 'Dodaj zdjęcie', onClick: () => openAddSheet(() => ui.rerenderPanel()) }, ui.icon('plus'))],
      render(body, api) {
        revokeAll();
        const holder = h('div', null, h('p.hint', { text: 'Ładowanie…' }));
        body.appendChild(holder);
        dbAll().then(async (photos) => {
          ui.clear(holder);
          photos.sort((a, b) => b.date.localeCompare(a.date) || b.created.localeCompare(a.created));
          holder.appendChild(h('p.hint', { text: 'Zdjęcia są tylko na tym urządzeniu (IndexedDB) i nie są częścią eksportu JSON. Moduł możesz wyłączyć w Ustawieniach.' }));
          if (!photos.length) { holder.appendChild(ui.emptyState('Brak zdjęć.', 'Dodaj pierwsze zdjęcie — to całkowicie opcjonalne.')); return; }
          const info = await storageInfo(photos);
          holder.appendChild(h('div.li-sub', { text: `${photos.length} ${Prime.plural(photos.length, 'zdjęcie', 'zdjęcia', 'zdjęć')} · ${fmtBytes(info.used)}${info.quota ? ` z ok. ${fmtBytes(info.quota.quota)} dostępnych dla aplikacji` : ''}` }));
          let picked = [];
          const cmpBtn = h('button.btn.small.primary', { type: 'button', disabled: true, text: 'Porównaj (wybierz 2)', onClick: () => openCompare(picked[0], picked[1]) });
          const grid = h('div.photo-grid');
          photos.forEach(p => {
            const cell = h('button.photo-cell', { type: 'button', 'aria-label': 'Zdjęcie z ' + D.formatFullDate(p.date), 'aria-pressed': 'false' },
              h('img', { src: urlFor(p.thumb, p.type), alt: '', loading: 'lazy' }), h('span.photo-date', { text: D.shortLabel(p.date) }));
            let pressTimer = null, longPressed = false;
            const toggleSel = () => {
              const i = picked.findIndex(x => x.id === p.id);
              if (i >= 0) picked.splice(i, 1); else { picked.push(p); if (picked.length > 2) picked.shift(); }
              grid.querySelectorAll('.photo-cell').forEach((c, idx) => { const on = picked.some(x => x.id === photos[idx].id); c.classList.toggle('sel', on); c.setAttribute('aria-pressed', String(on)); });
              cmpBtn.disabled = picked.length !== 2; cmpBtn.textContent = picked.length === 2 ? 'Porównaj wybrane' : `Porównaj (wybierz 2)`;
            };
            cell.addEventListener('click', () => { if (longPressed) { longPressed = false; return; } if (selectMode) toggleSel(); else openViewer(p, () => api.rerender()); });
            cell.addEventListener('contextmenu', (e) => e.preventDefault());
            cell.addEventListener('touchstart', () => { pressTimer = setTimeout(() => { longPressed = true; selectMode = true; modeBtn.textContent = 'Zakończ wybór'; toggleSel(); }, 450); }, { passive: true });
            ['touchend', 'touchmove', 'touchcancel'].forEach(ev => cell.addEventListener(ev, () => clearTimeout(pressTimer), { passive: true }));
            grid.appendChild(cell);
          });
          let selectMode = false;
          const modeBtn = h('button.chip-btn', { type: 'button', text: 'Wybierz do porównania', onClick: () => {
            selectMode = !selectMode; modeBtn.textContent = selectMode ? 'Zakończ wybór' : 'Wybierz do porównania';
            if (!selectMode) { picked = []; grid.querySelectorAll('.photo-cell').forEach(c => { c.classList.remove('sel'); c.setAttribute('aria-pressed', 'false'); }); cmpBtn.disabled = true; cmpBtn.textContent = 'Porównaj (wybierz 2)'; }
          } });
          holder.appendChild(h('div.row-actions', null, modeBtn, cmpBtn));
          holder.appendChild(grid);
          holder.appendChild(h('button.btn.ghost.block', { type: 'button', text: 'Usuń wszystkie zdjęcia', onClick: async () => {
            const ok = await ui.confirm({ title: 'Usunąć wszystkie zdjęcia?', text: `Zostanie trwale usuniętych ${photos.length} zdjęć z tego urządzenia. Nie można tego cofnąć.`, okLabel: 'Usuń wszystkie' });
            if (!ok) return;
            try { await dbClear(); api.rerender(); ui.toast('Zdjęcia usunięte'); } catch (e) { ui.toast(friendlyError(e)); }
          } }));
        }).catch((e) => { ui.clear(holder); holder.appendChild(ui.emptyState('Zdjęcia są niedostępne.', friendlyError(e))); });
      },
    });
  }

  async function count() { try { return (await dbAll()).length; } catch (e) { return null; } }
  async function removeAll() { await dbClear(); }

  Prime.mods.photos = { openPanel, count, removeAll, _addPhoto: addPhoto, _all: dbAll };
})();
