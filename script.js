/* =========================================================================
   Kişisel Ders Programı — script.js
   Tamamen istemci tarafında çalışır: sunucu, hesap, bulut, senkronizasyon yok.
   Veriler yalnızca bu cihazın tarayıcı deposunda tutulur (localStorage,
   gerekirse IndexedDB'ye yedeklenir). Hiçbir veri internete gönderilmez.
   ========================================================================= */
(function () {
  'use strict';

  /* ------------------------------ Sabitler ------------------------------- */
  const STORAGE_KEY = 'kdp:state:v1';
  const DB_NAME = 'kdp-db';
  const DB_STORE = 'kv';
  const THEMES = ['light', 'dark', 'system'];

  const DAYS = [
    { id: 'monday', label: 'Pazartesi', short: 'Pzt' },
    { id: 'tuesday', label: 'Salı', short: 'Sal' },
    { id: 'wednesday', label: 'Çarşamba', short: 'Çar' },
    { id: 'thursday', label: 'Perşembe', short: 'Per' },
    { id: 'friday', label: 'Cuma', short: 'Cum' },
    { id: 'saturday', label: 'Cumartesi', short: 'Cmt' },
    { id: 'sunday', label: 'Pazar', short: 'Paz' }
  ];
  const DAY_BY_ID = {};
  DAYS.forEach(function (d) { DAY_BY_ID[d.id] = d; });
  const WEEKDAY_INDEX_TO_DAY = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

  const SLOTS = {
    morning: { id: 'morning', label: 'Sabah' },
    school: { id: 'school', label: 'Okul' },
    evening: { id: 'evening', label: 'Akşam' }
  };
  const SLOT_IDS = ['morning', 'school', 'evening'];

  /* Dersin içindeki listeler: hangisi boşsa arayüzde hiç görünmez. */
  const LISTS = {
    topics: { title: 'Konular', add: 'Konu Ekle', checkable: true, placeholder: 'Örn. Fonksiyonlar' },
    goals: { title: 'Soru Hedefleri', add: 'Soru Hedefi Ekle' },
    homeworks: { title: 'Ödevler', add: 'Ödev Ekle', checkable: true, placeholder: 'Örn. 30 matematik sorusu çöz' },
    repeats: { title: 'Tekrarlar', add: 'Tekrar Ekle', checkable: true, placeholder: 'Örn. Konu tekrarı' },
    notes: { title: 'Notlar', add: 'Not Ekle', placeholder: 'Notunu yaz…' },
    sources: { title: 'Kaynaklar', add: 'Kaynak Ekle', placeholder: 'Örn. 3D Yayınları' }
  };

  /* -------------------------------- İkonlar ------------------------------ */
  function icon(inner, weight) {
    return '<svg viewBox="0 0 24 24" class="icon" aria-hidden="true" fill="none" stroke="currentColor"' +
      ' stroke-linecap="round" stroke-linejoin="round" stroke-width="' + (weight || 2) + '">' + inner + '</svg>';
  }
  const ICONS = {
    plus: icon('<path d="M12 5v14M5 12h14"/>'),
    close: icon('<path d="M6 6l12 12M18 6 6 18"/>'),
    drag: icon('<path d="M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01"/>', 3),
    up: icon('<path d="M6 14l6-6 6 6"/>'),
    down: icon('<path d="M6 10l6 6 6-6"/>'),
    pencil: icon('<path d="M4 20h4L20 8l-4-4L4 16v4Z"/><path d="M14 6l4 4"/>'),
    trash: icon('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'),
    clock: icon('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    user: icon('<circle cx="12" cy="8" r="3.5"/><path d="M5 20c.8-3.6 3.6-5 7-5s6.2 1.4 7 5"/>'),
    check: icon('<path d="M5 13l4 4L19 7"/>', 3),
    download: icon('<path d="M12 4v10m0 0 4-4m-4 4-4-4"/><path d="M5 19h14"/>'),
    upload: icon('<path d="M12 15V5m0 0 4 4m-4-4-4 4"/><path d="M5 19h14"/>'),
    info: icon('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'),
    calendar: icon('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 11h18"/>')
  };

  /* ----------------------------- Yardımcılar ----------------------------- */
  const $ = function (sel, root) { return (root || document).querySelector(sel); };
  const $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  function esc(value) {
    return String(value === undefined || value === null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function uid(prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }
  function nowISO() { return new Date().toISOString(); }
  function clamp(value, min, max) { return Math.min(Math.max(value, min), max); }
  function intOr(value, fallback) {
    const n = parseInt(value, 10);
    return Number.isFinite(n) ? n : fallback;
  }
  function todayDayId() { return WEEKDAY_INDEX_TO_DAY[new Date().getDay()]; }

  function formatLongDate(date) {
    try {
      return date.toLocaleDateString('tr-TR', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
      });
    } catch (e) { return date.toDateString(); }
  }
  function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  /* --------------------------- Depolama katmanı -------------------------- */
  /* localStorage tercih edilir; erişilemezse veya kota dolarsa IndexedDB'ye geçilir.
     Her iki durumda da veri YALNIZCA bu cihazda kalır. */
  const lsWorks = (function () {
    try {
      const probe = '__kdp_probe__';
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
      return true;
    } catch (e) { return false; }
  })();

  let storageMode = lsWorks ? 'localStorage' : 'indexedDB';

  function idbOpen() {
    return new Promise(function (resolve, reject) {
      if (!window.indexedDB) { reject(new Error('IndexedDB kullanılamıyor')); return; }
      const req = window.indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () {
        const db = req.result;
        if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }
  async function idbGet(key) {
    const db = await idbOpen();
    return new Promise(function (resolve, reject) {
      const tx = db.transaction(DB_STORE, 'readonly');
      const req = tx.objectStore(DB_STORE).get(key);
      req.onsuccess = function () { resolve(req.result === undefined ? null : req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }
  async function idbSet(key, value) {
    const db = await idbOpen();
    return new Promise(function (resolve, reject) {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).put(value, key);
      tx.oncomplete = function () { resolve(true); };
      tx.onerror = function () { reject(tx.error); };
      tx.onabort = function () { reject(tx.error); };
    });
  }

  /* IndexedDB bazı ortamlarda (gizli sekme, kısıtlı profil, headless) yanıt vermeyebilir.
     Bu yüzden okuma belirli bir süre sonra vazgeçer; uygulama boş programla açılır. */
  function withTimeout(promise, ms) {
    return new Promise(function (resolve) {
      let settled = false;
      const timer = window.setTimeout(function () {
        if (!settled) { settled = true; resolve(null); }
      }, ms);
      promise.then(function (value) {
        if (!settled) { settled = true; window.clearTimeout(timer); resolve(value); }
      }, function () {
        if (!settled) { settled = true; window.clearTimeout(timer); resolve(null); }
      });
    });
  }

  const Store = {
    async read() {
      /* localStorage varsa tek doğruluk kaynağı odur: açılış anında bekleme olmaz. */
      if (lsWorks) {
        try {
          const raw = window.localStorage.getItem(STORAGE_KEY);
          return raw ? JSON.parse(raw) : null;
        } catch (e) { return null; }
      }
      /* localStorage engelliyse (gizli sekme vb.) IndexedDB denenir. */
      return await withTimeout(idbGet(STORAGE_KEY), 1500);
    },
    async write(value) {
      const payload = JSON.stringify(value);
      if (storageMode === 'localStorage') {
        try {
          window.localStorage.setItem(STORAGE_KEY, payload);
          return true;
        } catch (e) {
          storageMode = 'indexedDB';
        }
      }
      const ok = await withTimeout(idbSet(STORAGE_KEY, value), 5000);
      return ok !== null;
    },
    async clear() {
      try { window.localStorage.removeItem(STORAGE_KEY); } catch (e) { /* yoksay */ }
      try { await idbSet(STORAGE_KEY, null); } catch (e) { /* yoksay */ }
    },
    label() { return storageMode === 'localStorage' ? 'Tarayıcı yerel deposu (localStorage)' : 'IndexedDB'; }
  };

  /* ------------------------------ Veri modeli ---------------------------- */
  /*
    state = {
      version: 1,
      settings: { theme: 'light' | 'dark' | 'system' },
      updatedAt: 'ISO',
      days: { monday: { id: 'monday', courses: [ ... ] }, ... }
    }

    course = {
      id, name, slot: 'morning' | 'school' | 'evening',
      teacher: '', time: '', description: '',
      topics: [{ id, text, done }],
      goals: [{ id, text, target, done }],
      homeworks: [{ id, text, done }],
      repeats: [{ id, text, done }],
      notes: [{ id, text }],
      sources: [{ id, text }],
      createdAt, updatedAt
    }

    Bütün listeler boş başlar; arayüz yalnızca doldurulanları gösterir.
  */
  function emptyState() {
    const days = {};
    DAYS.forEach(function (d) { days[d.id] = { id: d.id, courses: [] }; });
    return { version: 1, settings: { theme: 'system' }, updatedAt: nowISO(), days: days };
  }

  function normalizeItem(item, kind) {
    if (!isPlainObject(item)) return null;
    const out = { id: typeof item.id === 'string' && item.id ? item.id : uid('i'), text: String(item.text || '') };
    if (kind !== 'notes' && kind !== 'sources') out.done = !!item.done;
    if (kind === 'goals') {
      out.target = Math.max(1, intOr(item.target, 1));
      out.done = clamp(intOr(item.done, 0), 0, out.target);
    }
    return out;
  }

  function normalizeCourse(raw) {
    if (!isPlainObject(raw)) return null;
    const name = String(raw.name || '').trim();
    if (!name) return null;
    const course = {
      id: typeof raw.id === 'string' && raw.id ? raw.id : uid('c'),
      name: name,
      slot: SLOT_IDS.indexOf(raw.slot) >= 0 ? raw.slot : 'school',
      teacher: String(raw.teacher || ''),
      time: String(raw.time || ''),
      description: String(raw.description || ''),
      createdAt: raw.createdAt || nowISO(),
      updatedAt: raw.updatedAt || nowISO()
    };
    Object.keys(LISTS).forEach(function (key) {
      const source = Array.isArray(raw[key]) ? raw[key] : [];
      course[key] = source.map(function (item) { return normalizeItem(item, key); }).filter(Boolean);
    });
    return course;
  }

  function normalize(raw) {
    const out = emptyState();
    if (!isPlainObject(raw)) return out;
    const theme = isPlainObject(raw.settings) ? raw.settings.theme : null;
    if (THEMES.indexOf(theme) >= 0) out.settings.theme = theme;
    DAYS.forEach(function (day) {
      const src = isPlainObject(raw.days) ? raw.days[day.id] : null;
      const courses = src && Array.isArray(src.courses) ? src.courses : [];
      out.days[day.id].courses = courses.map(normalizeCourse).filter(Boolean);
    });
    out.updatedAt = typeof raw.updatedAt === 'string' ? raw.updatedAt : nowISO();
    return out;
  }

  /* ------------------------------- Durum --------------------------------- */
  let state = emptyState();

  const ui = {
    view: 'week',     // week | today | school | study | settings
    drawer: null,     // açık dersin kimliği
    forms: {},        // açık satır içi formlar
    modal: null,      // { type, ... }
    drag: null,       // sürüklenen ders bilgisi
    focus: null       // render sonrası odaklanacak eleman
  };
  let pendingConfirm = null;
  let toastAction = null;

  /* -------------------------------- Tema --------------------------------- */
  function prefersDark() {
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }
  function resolveTheme() {
    const pref = state.settings.theme;
    if (pref === 'light' || pref === 'dark') return pref;
    return prefersDark() ? 'dark' : 'light';
  }
  function applyTheme() {
    const resolved = resolveTheme();
    document.documentElement.setAttribute('data-theme', resolved);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', resolved === 'dark' ? '#0d1220' : '#4f46e5');
  }

  /* ------------------------------- Kayıt --------------------------------- */
  let saveTimer = null;
  let pendingSave = false;
  let touchedByUser = false; // yükleme sürerken kullanıcı veri ekledi mi?

  function save() {
    state.updatedAt = nowISO();
    touchedByUser = true;
    pendingSave = true;
    if (saveTimer) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(flushSave, 180);
  }
  async function flushSave() {
    if (saveTimer) { window.clearTimeout(saveTimer); saveTimer = null; }
    if (!pendingSave) return;
    pendingSave = false;
    const ok = await Store.write(state);
    if (!ok) toast('Kaydedilemedi: tarayıcı deposu dolu veya engellenmiş olabilir.');
  }

  /* ------------------------------ Sorgular ------------------------------- */
  function allCourses() {
    const list = [];
    DAYS.forEach(function (day) {
      state.days[day.id].courses.forEach(function (course) {
        list.push({ dayId: day.id, course: course });
      });
    });
    return list;
  }
  function totalCourses() {
    let total = 0;
    DAYS.forEach(function (day) { total += state.days[day.id].courses.length; });
    return total;
  }
  function hasAnyContent() {
    return totalCourses() > 0;
  }
  function findCourse(courseId) {
    for (let i = 0; i < DAYS.length; i += 1) {
      const dayId = DAYS[i].id;
      const course = state.days[dayId].courses.find(function (c) { return c.id === courseId; });
      if (course) return { dayId: dayId, course: course };
    }
    return null;
  }
  function coursesOf(dayId, slotId) {
    return state.days[dayId].courses.filter(function (c) { return c.slot === slotId; });
  }
  function slotsWithContent(dayId) {
    return SLOT_IDS.filter(function (slotId) { return coursesOf(dayId, slotId).length > 0; });
  }
  function goalsTotals(course) {
    let target = 0;
    let done = 0;
    course.goals.forEach(function (g) { target += g.target; done += g.done; });
    return { target: target, done: done };
  }
  function courseSummary(course) {
    const parts = [];
    if (course.topics.length) {
      parts.push(course.topics.filter(function (t) { return t.done; }).length + '/' + course.topics.length + ' konu');
    }
    if (course.goals.length) {
      const totals = goalsTotals(course);
      parts.push(totals.done + '/' + totals.target + ' soru');
    }
    if (course.homeworks.length) {
      parts.push(course.homeworks.filter(function (h) { return h.done; }).length + '/' + course.homeworks.length + ' ödev');
    }
    if (course.repeats.length) {
      parts.push(course.repeats.filter(function (r) { return r.done; }).length + '/' + course.repeats.length + ' tekrar');
    }
    return parts;
  }
  function counts() {
    const out = { courses: 0, topics: 0, goals: 0, homeworks: 0, repeats: 0, notes: 0, sources: 0 };
    allCourses().forEach(function (entry) {
      out.courses += 1;
      Object.keys(LISTS).forEach(function (key) { out[key] += entry.course[key].length; });
    });
    return out;
  }

  /* --------------------------- Ders işlemleri ---------------------------- */
  function addCourse(dayId, data) {
    const course = normalizeCourse({
      id: uid('c'),
      name: data.name,
      slot: data.slot,
      teacher: data.teacher,
      time: data.time,
      description: data.description,
      createdAt: nowISO(),
      updatedAt: nowISO()
    });
    if (!course) return null;
    state.days[dayId].courses.push(course);
    save();
    return course;
  }

  function updateCourse(courseId, patch) {
    const found = findCourse(courseId);
    if (!found) return null;
    if (typeof patch.name === 'string') {
      const name = patch.name.trim();
      if (!name) return null;
      patch.name = name;
    }
    if (patch.slot !== undefined && SLOT_IDS.indexOf(patch.slot) < 0) delete patch.slot;
    Object.assign(found.course, patch);
    found.course.updatedAt = nowISO();
    save();
    return found.course;
  }

  function removeCourse(courseId) {
    const found = findCourse(courseId);
    if (!found) return null;
    const list = state.days[found.dayId].courses;
    const index = list.indexOf(found.course);
    list.splice(index, 1);
    if (ui.drawer === courseId) ui.drawer = null;
    ui.forms = {};
    save();
    return { dayId: found.dayId, index: index, course: found.course };
  }

  function restoreCourse(snapshot) {
    if (!snapshot) return;
    const list = state.days[snapshot.dayId].courses;
    list.splice(clamp(snapshot.index, 0, list.length), 0, snapshot.course);
    save();
  }

  function duplicateCourse(courseId, targetDayId, targetSlot) {
    const found = findCourse(courseId);
    if (!found) return null;
    const copy = JSON.parse(JSON.stringify(found.course));
    copy.id = uid('c');
    copy.slot = targetSlot;
    copy.name = found.course.name + ' (kopya)';
    copy.createdAt = nowISO();
    copy.updatedAt = nowISO();
    state.days[targetDayId].courses.push(copy);
    save();
    return copy;
  }

  function moveCourse(courseId, targetDayId, targetSlot) {
    const found = findCourse(courseId);
    if (!found) return false;
    if (found.dayId === targetDayId && found.course.slot === targetSlot) return false;
    const list = state.days[found.dayId].courses;
    list.splice(list.indexOf(found.course), 1);
    found.course.slot = targetSlot;
    found.course.updatedAt = nowISO();
    state.days[targetDayId].courses.push(found.course);
    save();
    return true;
  }

  function dropCourse(courseId, targetDayId, targetSlot, beforeId) {
    const found = findCourse(courseId);
    if (!found) return false;
    const source = state.days[found.dayId].courses;
    const course = found.course;
    source.splice(source.indexOf(course), 1);
    course.slot = targetSlot;
    course.updatedAt = nowISO();
    const target = state.days[targetDayId].courses;
    let at = target.length;
    if (beforeId) {
      const index = target.findIndex(function (c) { return c.id === beforeId; });
      if (index >= 0) at = index;
    }
    target.splice(at, 0, course);
    save();
    return true;
  }

  function shiftCourse(courseId, delta) {
    const found = findCourse(courseId);
    if (!found) return false;
    const group = coursesOf(found.dayId, found.course.slot);
    const target = group[group.indexOf(found.course) + delta];
    if (!target) return false;
    const list = state.days[found.dayId].courses;
    const a = list.indexOf(found.course);
    const b = list.indexOf(target);
    list[a] = target;
    list[b] = found.course;
    save();
    return true;
  }

  /* --------------- Liste işlemleri (konu, ödev, not, hedef …) ------------ */
  function listAdd(courseId, key, values) {
    const found = findCourse(courseId);
    if (!found) return null;
    const item = normalizeItem(Object.assign({ id: uid('i') }, values), key);
    if (!item) return null;
    found.course[key].push(item);
    found.course.updatedAt = nowISO();
    save();
    return item;
  }

  function listUpdate(courseId, key, itemId, values) {
    const found = findCourse(courseId);
    if (!found) return null;
    const item = found.course[key].find(function (i) { return i.id === itemId; });
    if (!item) return null;
    Object.assign(item, values);
    if (key === 'goals') {
      item.target = Math.max(1, intOr(item.target, 1));
      item.done = clamp(intOr(item.done, 0), 0, item.target);
    }
    found.course.updatedAt = nowISO();
    save();
    return item;
  }

  function listToggle(courseId, key, itemId) {
    const found = findCourse(courseId);
    if (!found) return null;
    const item = found.course[key].find(function (i) { return i.id === itemId; });
    if (!item) return null;
    item.done = !item.done;
    found.course.updatedAt = nowISO();
    save();
    return item;
  }

  function listRemove(courseId, key, itemId) {
    const found = findCourse(courseId);
    if (!found) return null;
    const list = found.course[key];
    const index = list.findIndex(function (i) { return i.id === itemId; });
    if (index < 0) return null;
    const item = list.splice(index, 1)[0];
    found.course.updatedAt = nowISO();
    save();
    return { courseId: courseId, key: key, item: item, index: index };
  }

  function listRestore(snapshot) {
    if (!snapshot) return;
    const found = findCourse(snapshot.courseId);
    if (!found) return;
    found.course[snapshot.key].splice(snapshot.index, 0, snapshot.item);
    found.course.updatedAt = nowISO();
    save();
  }

  function goalStep(courseId, itemId, delta) {
    const found = findCourse(courseId);
    if (!found) return null;
    const goal = found.course.goals.find(function (g) { return g.id === itemId; });
    if (!goal) return null;
    goal.done = clamp(goal.done + delta, 0, goal.target);
    found.course.updatedAt = nowISO();
    save();
    return goal;
  }

  /* ------------------------ Arayüz durumu yardımcıları ------------------- */
  function openForm(key, values) {
    ui.forms[key] = values || {};
  }
  function closeForm(key) {
    delete ui.forms[key];
  }
  function isFormOpen(key) {
    return Object.prototype.hasOwnProperty.call(ui.forms, key);
  }
  function formKey(kind, itemId) {
    return itemId ? kind + ':' + itemId : kind;
  }
  function focusOn(selector) {
    ui.focus = selector;
  }

  /* ------------------------------ Bildirim ------------------------------- */
  let toastTimer = null;

  function toast(message, options) {
    const root = $('#toast-root');
    const opts = options || {};
    toastAction = opts.onAction || null;
    root.innerHTML =
      '<div class="toast" role="status">' +
        '<span>' + esc(message) + '</span>' +
        (opts.actionLabel
          ? '<button type="button" class="toast__action" data-action="toast-action">' + esc(opts.actionLabel) + '</button>'
          : '') +
        '<button type="button" class="toast__close" data-action="toast-close" aria-label="Kapat">' + ICONS.close + '</button>' +
      '</div>';
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      root.innerHTML = '';
      toastAction = null;
    }, opts.duration || (opts.actionLabel ? 8000 : 3200));
  }

  /* -------------------------------- Render ------------------------------- */
  function render() {
    const previousScroller = $('.drawer__body');
    const scrollTop = previousScroller ? previousScroller.scrollTop : 0;

    $$('.nav__item').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.dataset.view === ui.view);
    });
    $('#main').innerHTML = renderView();
    renderDrawer();
    renderModal();

    const nextScroller = $('.drawer__body');
    if (nextScroller && scrollTop) nextScroller.scrollTop = scrollTop;

    if (ui.focus) {
      const target = $(ui.focus);
      ui.focus = null;
      if (target) {
        target.focus();
        if (typeof target.select === 'function') { try { target.select(); } catch (e) { /* yoksay */ } }
      }
    }
  }

  function renderView() {
    if (ui.view === 'today') return viewToday();
    if (ui.view === 'school') return viewSchool();
    if (ui.view === 'study') return viewStudy();
    if (ui.view === 'settings') return viewSettings();
    return viewWeek();
  }

  /* ---------------------------- Ortak parçalar --------------------------- */
  function slotChip(slotId) {
    return '<span class="chip chip--' + slotId + '">' + SLOTS[slotId].label + '</span>';
  }

  function addCourseButton(label, dayId, slotId) {
    return '<button type="button" class="btn-add" data-action="new-course" data-day="' + esc(dayId) +
      '" data-slot="' + esc(slotId) + '">' + ICONS.plus + esc(label) + '</button>';
  }

  function renderCourseCard(course, dayId, options) {
    const opts = options || {};
    const meta = [];
    if (course.time) meta.push('<span>' + ICONS.clock + esc(course.time) + '</span>');
    if (course.teacher) meta.push('<span>' + ICONS.user + esc(course.teacher) + '</span>');
    courseSummary(course).forEach(function (part) { meta.push('<span>' + esc(part) + '</span>'); });

    return '<div class="course" draggable="true" role="button" tabindex="0"' +
        ' data-action="open-course" data-id="' + esc(course.id) +
        '" data-day="' + esc(dayId) + '" data-slot="' + esc(course.slot) + '"' +
        ' aria-label="' + esc(course.name) + ' dersinin detaylarını aç">' +
      '<span class="course__handle" aria-hidden="true">' + ICONS.drag + '</span>' +
      '<div class="course__main">' +
        '<span class="course__name">' + esc(course.name) + '</span>' +
        (meta.length ? '<span class="course__meta">' + meta.join('') + '</span>' : '') +
      '</div>' +
      (!opts.withHeaders && course.slot !== 'school' ? slotChip(course.slot) : '') +
      '<div class="course__tools">' +
        '<button type="button" class="mini" data-action="shift-course" data-id="' + esc(course.id) +
          '" data-delta="-1" title="Yukarı taşı" aria-label="Yukarı taşı">' + ICONS.up + '</button>' +
        '<button type="button" class="mini" data-action="shift-course" data-id="' + esc(course.id) +
          '" data-delta="1" title="Aşağı taşı" aria-label="Aşağı taşı">' + ICONS.down + '</button>' +
      '</div>' +
    '</div>';
  }

  function renderSlot(dayId, slotId, withHeaders) {
    const courses = coursesOf(dayId, slotId);
    const attrs = ' data-drop="slot" data-day="' + esc(dayId) + '" data-slot="' + esc(slotId) + '"';
    if (!courses.length) {
      return '<div class="slot slot--empty"' + attrs + '>' + SLOTS[slotId].label + ' bölümüne bırak</div>';
    }
    return '<div class="slot"' + attrs + '>' +
      (withHeaders ? '<div class="slot__title">' + SLOTS[slotId].label + '</div>' : '') +
      '<div class="slot__list">' +
        courses.map(function (course) {
          return renderCourseCard(course, dayId, { withHeaders: withHeaders });
        }).join('') +
      '</div>' +
    '</div>';
  }

  function renderDay(dayId, options) {
    const opts = Object.assign({
      slots: SLOT_IDS,
      withHeaders: 'auto',
      footer: 'default',
      highlightToday: false
    }, options || {});
    const present = slotsWithContent(dayId);
    const total = state.days[dayId].courses.length;
    const withHeaders = opts.withHeaders === 'auto' ? present.length > 1 : !!opts.withHeaders;
    const slots = opts.slots === 'present' ? present : opts.slots;

    const footers = [];
    if (opts.footer === 'default' || opts.footer === 'school') {
      footers.push(addCourseButton('Ders Ekle', dayId, 'school'));
    } else if (opts.footer === 'study') {
      footers.push(addCourseButton('Sabah Çalışması Ekle', dayId, 'morning'));
      footers.push(addCourseButton('Akşam Çalışması Ekle', dayId, 'evening'));
    }

    return '<article class="day' + (opts.highlightToday ? ' day--today' : '') + '" data-day="' + esc(dayId) + '">' +
      '<header class="day__head">' +
        '<h3 class="day__title">' + esc(DAY_BY_ID[dayId].label) + '</h3>' +
        (total ? '<span class="day__count">' + total + ' ders</span>' : '') +
      '</header>' +
      '<div class="day__body">' +
        slots.map(function (slotId) { return renderSlot(dayId, slotId, withHeaders); }).join('') +
      '</div>' +
      (footers.length ? '<div class="day__foot">' + footers.join('') + '</div>' : '') +
    '</article>';
  }

  /* ------------------------------ Boş durum ------------------------------ */
  function renderEmptyState() {
    return '<div class="empty">' +
      '<h3>Henüz ders eklemedin.</h3>' +
      '<p>Program tamamen boş. Hazır ders listesi yok: yalnızca senin eklediğin dersler görünür. ' +
      'İstediğin güne istediğin kadar ders ekleyebilir, her dersi konu, ödev, soru hedefi ve notlarla detaylandırabilirsin.</p>' +
      '<button type="button" class="btn btn--primary" data-action="new-course" data-day="' +
        esc(todayDayId()) + '" data-slot="school">' + ICONS.plus + 'İlk Dersi Ekle</button>' +
    '</div>';
  }

  function pendingItems(dayId) {
    const out = [];
    state.days[dayId].courses.forEach(function (course) {
      ['topics', 'homeworks', 'repeats'].forEach(function (key) {
        course[key].forEach(function (item) {
          if (!item.done) {
            out.push({ course: course, key: key, item: item });
          }
        });
      });
    });
    return out;
  }

  /* --------------------------- Haftalık görünüm -------------------------- */
  function viewWeek() {
    const todayId = todayDayId();
    const empty = !hasAnyContent();
    const total = counts().courses;
    return '<section class="page">' +
      '<div class="page__head">' +
        '<div>' +
          '<h2>Haftalık Program</h2>' +
          '<p class="page__sub">' + (empty
            ? 'Programın boş — başlamak için ilk dersini ekle.'
            : total + ' ders · ' + esc(formatLongDate(new Date()))) + '</p>' +
        '</div>' +
        '<div class="page__actions">' +
          '<button type="button" class="btn" data-action="export-json">' + ICONS.download + 'Dışa Aktar</button>' +
          '<button type="button" class="btn btn--primary" data-action="new-course" data-day="' + esc(todayId) +
            '" data-slot="school">' + ICONS.plus + 'Ders Ekle</button>' +
        '</div>' +
      '</div>' +
      (empty ? renderEmptyState() : '') +
      '<div class="week">' +
        DAYS.map(function (day) {
          return renderDay(day.id, { highlightToday: day.id === todayId });
        }).join('') +
      '</div>' +
      '<p class="hint hint--block">Ders kartına tıklayarak detayları (konu, ödev, soru hedefi, not) açabilirsin. ' +
      'Kartları sürükleyerek veya kart üzerindeki oklarla sırasını değiştirebilirsin.</p>' +
    '</section>';
  }

  /* ------------------------------ Bugün ---------------------------------- */
  function viewToday() {
    const dayId = todayDayId();
    const pending = pendingItems(dayId);
    const total = state.days[dayId].courses.length;

    const pendingPanel = pending.length
      ? '<section class="panel">' +
          '<h3>Yapılacaklar</h3>' +
          '<p class="panel__sub">Bugünkü derslerinden tamamlanmamış ' + pending.length + ' madde.</p>' +
          '<div class="list">' +
            pending.map(function (entry) {
              return '<div class="item">' +
                '<label class="item__check">' +
                  '<input class="item__input" type="checkbox" data-action="toggle-item" data-course="' +
                    esc(entry.course.id) + '" data-key="' + entry.key + '" data-id="' + esc(entry.item.id) + '">' +
                  '<span class="box">' + ICONS.check + '</span>' +
                  '<span class="item__text">' + esc(entry.item.text) +
                    ' <span class="chip">' + esc(entry.course.name) + '</span></span>' +
                '</label>' +
              '</div>';
            }).join('') +
          '</div>' +
        '</section>'
      : '';

    return '<section class="page">' +
      '<div class="page__head">' +
        '<div>' +
          '<h2>Bugün</h2>' +
          '<p class="page__sub">' + esc(formatLongDate(new Date())) + ' · ' +
            (total ? total + ' ders' : 'henüz ders eklenmedi') + '</p>' +
        '</div>' +
        '<div class="page__actions">' +
          '<button type="button" class="btn btn--primary" data-action="new-course" data-day="' + esc(dayId) +
            '" data-slot="school">' + ICONS.plus + 'Ders Ekle</button>' +
        '</div>' +
      '</div>' +
      (total ? '' : '<div class="empty"><h3>Bugün için ders yok.</h3>' +
        '<p>' + esc(DAY_BY_ID[dayId].label) + ' gününe ders eklemek için yukarıdaki butonu kullanabilirsin.</p></div>') +
      (pendingPanel ? '<div class="panels panels--stack">' + pendingPanel + '</div>' : '') +
      '<div class="week week--single mt">' +
        renderDay(dayId, { footer: 'study', highlightToday: true }) +
      '</div>' +
    '</section>';
  }

  /* --------------------------- Okul Programım ---------------------------- */
  function pageHeader(title, sub, actions) {
    return '<div class="page__head">' +
      '<div><h2>' + esc(title) + '</h2><p class="page__sub">' + esc(sub) + '</p></div>' +
      (actions ? '<div class="page__actions">' + actions + '</div>' : '') +
    '</div>';
  }

  function viewSchool() {
    const todayId = todayDayId();
    const hasAny = DAYS.some(function (day) { return coursesOf(day.id, 'school').length > 0; });
    return '<section class="page">' +
      pageHeader('Okul Programım',
        'Okulda işleyeceğin dersler. Kişisel çalışma planından ayrı tutulur.',
        '<button type="button" class="btn btn--primary" data-action="new-course" data-day="' + esc(todayId) +
          '" data-slot="school">' + ICONS.plus + 'Ders Ekle</button>') +
      (hasAny ? '' : '<div class="empty">' +
        '<h3>Okul programında henüz ders yok.</h3>' +
        '<p>Okulda gördüğün dersleri buraya ekle. Bir güne istediğin kadar ders ekleyebilirsin; her ders kendi kartında görünür.</p>' +
        '<button type="button" class="btn btn--primary" data-action="new-course" data-day="' + esc(todayId) +
          '" data-slot="school">' + ICONS.plus + 'İlk okul dersini ekle</button></div>') +
      '<div class="week">' +
        DAYS.map(function (day) {
          return renderDay(day.id, {
            slots: ['school'],
            footer: 'school',
            highlightToday: day.id === todayId
          });
        }).join('') +
      '</div>' +
    '</section>';
  }

  /* -------------------------- Çalışma Programım -------------------------- */
  function viewStudy() {
    const todayId = todayDayId();
    const hasAny = DAYS.some(function (day) {
      return coursesOf(day.id, 'morning').length > 0 || coursesOf(day.id, 'evening').length > 0;
    });
    return '<section class="page">' +
      pageHeader('Çalışma Programım',
        'Sabah: okul öncesi ön hazırlık · Okul: derslerin işlenmesi · Akşam: tekrar ve soru çözümü',
        '<button type="button" class="btn btn--primary" data-action="new-course" data-day="' + esc(todayId) +
          '" data-slot="evening">' + ICONS.plus + 'Çalışma Ekle</button>') +
      '<div class="notice">' + ICONS.info +
        '<span>Sabah bölümüne o gün okulda göreceğin derslerin ön hazırlığını, akşam bölümüne ' +
        'işlediğin derslerin tekrarını ve soru çözümünü ekle. Bu iki bölüm okul programından bağımsızdır.</span></div>' +
      (hasAny ? '' : '<div class="empty">' +
        '<h3>Çalışma planın henüz boş.</h3>' +
        '<p>Bir günün altındaki “Sabah Çalışması Ekle” veya “Akşam Çalışması Ekle” butonlarını kullanarak ' +
        'kendi çalışma düzenini oluştur.</p></div>') +
      '<div class="week mt">' +
        DAYS.map(function (day) {
          return renderDay(day.id, {
            slots: ['morning', 'evening'],
            withHeaders: true,
            footer: 'study',
            highlightToday: day.id === todayId
          });
        }).join('') +
      '</div>' +
    '</section>';
  }

  /* ------------------------------ Ayarlar -------------------------------- */
  function themeOption(value, label) {
    const active = state.settings.theme === value;
    return '<button type="button" class="segmented__item' + (active ? ' is-active' : '') +
      '" role="radio" aria-checked="' + active + '" data-action="set-theme" data-theme="' + value + '">' +
      esc(label) + '</button>';
  }

  function viewSettings() {
    const c = counts();
    let updated = '—';
    try { updated = new Date(state.updatedAt).toLocaleString('tr-TR'); } catch (e) { /* yoksay */ }

    return '<section class="page">' +
      pageHeader('Ayarlar', 'Tema, yedekleme ve bu cihazdaki veriler') +
      '<div class="panels">' +

        '<section class="panel">' +
          '<h3>Tema</h3>' +
          '<p class="panel__sub">Seçimin bu cihazda saklanır ve site yeniden açıldığında korunur.</p>' +
          '<div class="segmented" role="radiogroup" aria-label="Tema seçimi">' +
            themeOption('light', 'Açık') +
            themeOption('dark', 'Koyu') +
            themeOption('system', 'Sistem') +
          '</div>' +
        '</section>' +

        '<section class="panel">' +
          '<h3>Cihazdaki veriler</h3>' +
          '<p class="panel__sub">Bu veriler yalnızca bu tarayıcıda tutulur; başka cihazlarla paylaşılmaz.</p>' +
          '<dl class="kv">' +
            '<dt>Ders</dt><dd>' + c.courses + '</dd>' +
            '<dt>Konu</dt><dd>' + c.topics + '</dd>' +
            '<dt>Soru hedefi</dt><dd>' + c.goals + '</dd>' +
            '<dt>Ödev</dt><dd>' + c.homeworks + '</dd>' +
            '<dt>Tekrar</dt><dd>' + c.repeats + '</dd>' +
            '<dt>Not</dt><dd>' + c.notes + '</dd>' +
            '<dt>Kaynak</dt><dd>' + c.sources + '</dd>' +
            '<dt>Son değişiklik</dt><dd>' + esc(updated) + '</dd>' +
            '<dt>Saklama yeri</dt><dd>' + esc(Store.label()) + '</dd>' +
          '</dl>' +
          '<div class="notice">' + ICONS.info +
            '<span>Sunucu, hesap, bulut veya otomatik senkronizasyon yok. Uygulama internete veri göndermez; ' +
            'başka bir cihaza taşımak istersen yedek dosyasını kendin aktarmalısın.</span></div>' +
        '</section>' +

        '<section class="panel">' +
          '<h3>Yedekleme</h3>' +
          '<p class="panel__sub">Programı JSON dosyası olarak indir, gerektiğinde geri yükle veya başka cihaza taşı.</p>' +
          '<div class="rows">' +
            '<button type="button" class="btn" data-action="export-json">' + ICONS.download + 'Verilerimi dışa aktar</button>' +
            '<button type="button" class="btn" data-action="import-json">' + ICONS.upload + 'Verileri içe aktar</button>' +
          '</div>' +
          '<input type="file" id="import-input" accept="application/json,.json" hidden>' +
          '<p class="hint">İçe aktarırken dosyadaki programın mevcut verilerinle değiştirilmesini ya da birleştirilmesini seçebilirsin.</p>' +
        '</section>' +

        '<section class="panel panel--danger">' +
          '<h3>Verileri sil</h3>' +
          '<p class="panel__sub">Bu cihazdaki tüm ders, konu, ödev ve notlar silinir. Geri alınamaz.</p>' +
          '<div class="rows">' +
            '<button type="button" class="btn btn--danger" data-action="reset-all">' + ICONS.trash + 'Tüm verileri sil</button>' +
          '</div>' +
        '</section>' +

      '</div>' +
    '</section>';
  }

  /* --------------------------- Yedekleme işlemleri ----------------------- */
  function exportJSON() {
    const payload = { app: 'kisisel-ders-programi', version: 1, exportedAt: nowISO(), state: state };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'ders-programim-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
    toast('Program JSON dosyası olarak indirildi.');
  }

  function openImportPicker() {
    const input = $('#import-input');
    if (input) input.click();
  }

  function handleImportFile(input) {
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function () {
      let parsed = null;
      try { parsed = JSON.parse(String(reader.result)); } catch (e) { parsed = null; }
      const raw = parsed && parsed.state ? parsed.state : parsed;
      if (!isPlainObject(raw) || !isPlainObject(raw.days)) {
        toast('Bu dosya geçerli bir ders programı yedeği değil.');
        return;
      }
      ui.modal = { type: 'import', incoming: normalize(raw), fileName: file.name };
      render();
    };
    reader.onerror = function () { toast('Dosya okunamadı.'); };
    reader.readAsText(file);
  }

  function importCount(incoming) {
    let total = 0;
    DAYS.forEach(function (day) { total += incoming.days[day.id].courses.length; });
    return total;
  }

  function applyImportReplace(incoming) {
    state = incoming;
    ui.modal = null;
    ui.drawer = null;
    ui.forms = {};
    applyTheme();
    save();
    flushSave();
    render();
    toast('Yedek içe aktarıldı: ' + counts().courses + ' ders yüklendi.');
  }

  function applyImportMerge(incoming) {
    let added = 0;
    DAYS.forEach(function (day) {
      incoming.days[day.id].courses.forEach(function (course) {
        const copy = JSON.parse(JSON.stringify(course));
        copy.id = uid('c');
        state.days[day.id].courses.push(copy);
        added += 1;
      });
    });
    ui.modal = null;
    save();
    flushSave();
    render();
    toast('Yedek verilerinle birleştirildi: ' + added + ' ders eklendi.');
  }

  function resetAll() {
    const theme = state.settings.theme;
    state = emptyState();
    state.settings.theme = theme;
    ui.forms = {};
    ui.drawer = null;
    Store.clear().then(function () {
      save();
      flushSave();
      render();
      toast('Bu cihazdaki tüm veriler silindi.');
    });
  }

  /* --------------------------- Detay çekmecesi --------------------------- */
  function itemTools(courseId, key, itemId) {
    return '<button type="button" class="mini" data-action="edit-item" data-course="' + esc(courseId) +
        '" data-key="' + key + '" data-id="' + esc(itemId) + '" title="Düzenle" aria-label="Düzenle">' + ICONS.pencil + '</button>' +
      '<button type="button" class="mini mini--danger" data-action="delete-item" data-course="' + esc(courseId) +
        '" data-key="' + key + '" data-id="' + esc(itemId) + '" title="Sil" aria-label="Sil">' + ICONS.trash + '</button>';
  }

  function formActions(key) {
    return '<div class="form__actions">' +
      '<button type="submit" class="btn btn--primary btn--sm">Kaydet</button>' +
      '<button type="button" class="btn btn--ghost btn--sm" data-action="close-form" data-form="' + esc(key) + '">Vazgeç</button>' +
    '</div>';
  }

  const META_FIELDS = [
    { key: 'teacher', label: 'Öğretmen', add: 'Öğretmen Ekle', placeholder: 'Örn. Ahmet Yılmaz', area: false },
    { key: 'time', label: 'Saat', add: 'Saat Ekle', placeholder: 'Örn. 09:30', area: false },
    { key: 'description', label: 'Açıklama', add: 'Açıklama Ekle', placeholder: 'Kısa bir açıklama', area: true }
  ];

  function renderMetaForm(field, course) {
    const config = META_FIELDS.find(function (f) { return f.key === field; });
    const value = esc(course[field] || '');
    const input = config.area
      ? '<textarea name="value" placeholder="' + esc(config.placeholder) + '">' + value + '</textarea>'
      : '<input type="text" name="value" value="' + value + '" placeholder="' + esc(config.placeholder) + '">';
    return '<form class="form" data-action="submit-form" data-form="' + field + '" data-course="' + esc(course.id) + '">' +
      '<div class="field"><label class="field__label">' + esc(config.label) + '</label>' + input + '</div>' +
      formActions(field) +
    '</form>';
  }

  function renderMetaRow(config, course) {
    if (isFormOpen(config.key)) return renderMetaForm(config.key, course);
    return '<div class="info">' +
      '<span class="info__label">' + esc(config.label) + '</span>' +
      '<span class="info__value">' + esc(course[config.key]) + '</span>' +
      '<div class="info__tools">' +
        '<button type="button" class="mini" data-action="open-form" data-form="' + config.key +
          '" data-course="' + esc(course.id) + '" title="Düzenle" aria-label="Düzenle">' + ICONS.pencil + '</button>' +
        '<button type="button" class="mini mini--danger" data-action="clear-field" data-field="' + config.key +
          '" data-course="' + esc(course.id) + '" title="Kaldır" aria-label="Kaldır">' + ICONS.trash + '</button>' +
      '</div>' +
    '</div>';
  }

  /* Dolu alanlar bilgi satırı, açık formlar form olarak gösterilir; boş alan hiç görünmez. */
  function renderMetaInfo(course) {
    return META_FIELDS.map(function (config) {
      if (course[config.key]) return renderMetaRow(config, course);
      if (isFormOpen(config.key)) return renderMetaForm(config.key, course);
      return '';
    }).join('');
  }

  function renderQuickAdd(course) {
    const chips = [];
    Object.keys(LISTS).forEach(function (key) {
      if (course[key].length || isFormOpen(formKey(key, null))) return;
      chips.push('<button type="button" class="btn btn--soft" data-action="open-form" data-form="' + key +
        '" data-course="' + esc(course.id) + '">' + ICONS.plus + esc(LISTS[key].add) + '</button>');
    });
    META_FIELDS.forEach(function (config) {
      if (course[config.key] || isFormOpen(config.key)) return;
      chips.push('<button type="button" class="btn btn--soft" data-action="open-form" data-form="' + config.key +
        '" data-course="' + esc(course.id) + '">' + ICONS.plus + esc(config.add) + '</button>');
    });
    if (!chips.length) return '';
    return '<section class="section"><div class="quickadd">' + chips.join('') + '</div></section>';
  }

  const SINGULAR = {
    topics: 'Konu', goals: 'Soru hedefi', homeworks: 'Ödev',
    repeats: 'Tekrar', notes: 'Not', sources: 'Kaynak'
  };

  function renderForm(kind, course, item, key) {
    const config = LISTS[kind];
    let field;
    if (kind === 'goal') {
      field = '<div class="form__row">' +
        '<div class="field"><label class="field__label">Hedef (soru sayısı)</label>' +
          '<input type="number" name="target" min="1" step="1" value="' + (item ? item.target : 20) + '" required></div>' +
        '<div class="field"><label class="field__label">Etiket (isteğe bağlı)</label>' +
          '<input type="text" name="text" value="' + esc(item ? item.text : '') +
          '" placeholder="Örn. TYT matematik"></div>' +
      '</div>';
    } else if (kind === 'note') {
      field = '<div class="field"><label class="field__label">Not</label>' +
        '<textarea name="text" required placeholder="' + esc(config.placeholder) + '">' +
        esc(item ? item.text : '') + '</textarea></div>';
    } else {
      field = '<div class="field"><label class="field__label">' + esc(SINGULAR[kind]) + '</label>' +
        '<input type="text" name="text" required value="' + esc(item ? item.text : '') +
        '" placeholder="' + esc(config.placeholder) + '"></div>';
    }
    return '<form class="form" data-action="submit-form" data-form="' + esc(key) +
      '" data-course="' + esc(course.id) + '">' + field + formActions(key) + '</form>';
  }

  /* Liste bölümü: içerik yoksa başlık da gösterilmez, yalnızca “Ekle” seçeneği kalır. */
  function renderCheckList(course, key) {
    const config = LISTS[key];
    const items = course[key];
    const addKey = formKey(key, null);
    const addOpen = isFormOpen(addKey);
    if (!items.length && !addOpen) return '';

    const rows = items.map(function (item) {
      const editKey = formKey(key, item.id);
      if (isFormOpen(editKey)) return renderForm(key, course, item, editKey);
      const done = config.checkable && item.done;
      const textClass = 'item__text' + (key === 'notes' ? ' item__text--block' : '');
      const label = config.checkable
        ? '<label class="item__check">' +
            '<input class="item__input" type="checkbox"' + (done ? ' checked' : '') +
              ' data-action="toggle-item" data-course="' + esc(course.id) +
              '" data-key="' + key + '" data-id="' + esc(item.id) + '">' +
            '<span class="box">' + ICONS.check + '</span>' +
            '<span class="' + textClass + '">' + esc(item.text) + '</span>' +
          '</label>'
        : '<div class="item__check"><span class="' + textClass + '">' + esc(item.text) + '</span></div>';
      return '<div class="item' + (done ? ' is-done' : '') + '">' + label +
        '<div class="item__tools">' + itemTools(course.id, key, item.id) + '</div></div>';
    }).join('');

    const doneCount = config.checkable ? items.filter(function (i) { return i.done; }).length : 0;

    return '<section class="section">' +
      (items.length
        ? '<div class="section__head">' +
            '<span class="section__title">' + esc(config.title) + '</span>' +
            (config.checkable && items.length > 1
              ? '<span class="section__count">' + doneCount + '/' + items.length + '</span>'
              : '') +
          '</div>'
        : '') +
      (rows ? '<div class="list">' + rows + '</div>' : '') +
      (addOpen
        ? renderForm(key, course, null, addKey)
        : '<button type="button" class="btn-add btn-add--flat" data-action="open-form" data-form="' + addKey +
          '" data-course="' + esc(course.id) + '">' + ICONS.plus + esc(config.add) + '</button>') +
    '</section>';
  }

  /* Soru hedefi bölümü: hedef ve basit ilerleme takibi */
  function renderGoalList(course) {
    const goals = course.goals;
    const addKey = formKey('goals', null);
    const addOpen = isFormOpen(addKey);
    if (!goals.length && !addOpen) return '';
    const totals = goalsTotals(course);

    const cards = goals.map(function (goal) {
      const editKey = formKey('goal', goal.id);
      if (isFormOpen(editKey)) return renderForm('goal', course, goal, editKey);
      const pct = Math.round((goal.done / goal.target) * 100);
      const attrs = ' data-course="' + esc(course.id) + '" data-id="' + esc(goal.id) + '"';
      return '<div class="goal">' +
        '<div class="goal__head">' +
          '<span class="goal__label">' + esc(goal.text || 'Soru hedefi') + '</span>' +
          '<span class="goal__value">' + goal.done + ' / ' + goal.target + '</span>' +
        '</div>' +
        '<div class="progress"><span style="width:' + pct + '%"></span></div>' +
        '<div class="goal__tools">' +
          '<span class="stepper">' +
            '<button type="button" data-action="goal-step" data-delta="-1"' + attrs + ' aria-label="Bir azalt">−</button>' +
            '<button type="button" data-action="goal-step" data-delta="1"' + attrs + ' aria-label="Bir artır">+</button>' +
          '</span>' +
          '<button type="button" class="btn btn--ghost btn--sm" data-action="goal-reset"' + attrs + '>Sıfırla</button>' +
          '<button type="button" class="mini" data-action="edit-item" data-key="goals"' + attrs +
            ' title="Düzenle" aria-label="Düzenle">' + ICONS.pencil + '</button>' +
          '<button type="button" class="mini mini--danger" data-action="delete-item" data-key="goals"' + attrs +
            ' title="Sil" aria-label="Sil">' + ICONS.trash + '</button>' +
        '</div>' +
      '</div>';
    }).join('');

    return '<section class="section">' +
      (goals.length
        ? '<div class="section__head">' +
            '<span class="section__title">' + esc(LISTS.goals.title) + '</span>' +
            '<span class="section__count">' + totals.done + '/' + totals.target + ' soru</span>' +
          '</div>'
        : '') +
      (cards ? '<div class="list">' + cards + '</div>' : '') +
      (addOpen
        ? renderForm('goal', course, null, addKey)
        : '<button type="button" class="btn-add btn-add--flat" data-action="open-form" data-form="' + addKey +
          '" data-course="' + esc(course.id) + '">' + ICONS.plus + esc(LISTS.goals.add) + '</button>') +
    '</section>';
  }

  function renderDrawer() {
    const root = $('#drawer-root');
    if (!ui.drawer) { root.innerHTML = ''; return; }
    const found = findCourse(ui.drawer);
    if (!found) { ui.drawer = null; root.innerHTML = ''; return; }
    const course = found.course;

    const body = [
      renderMetaInfo(course),
      renderQuickAdd(course),
      renderCheckList(course, 'topics'),
      renderGoalList(course),
      renderCheckList(course, 'homeworks'),
      renderCheckList(course, 'repeats'),
      renderCheckList(course, 'notes'),
      renderCheckList(course, 'sources')
    ].filter(Boolean).join('');

    root.innerHTML = '<div class="drawer">' +
      '<div class="drawer__scrim" data-action="close-drawer"></div>' +
      '<aside class="drawer__panel" role="dialog" aria-modal="true" aria-label="' + esc(course.name) + ' ders detayı">' +
        '<header class="drawer__head">' +
          '<div>' +
            '<p class="drawer__eyebrow">' + esc(DAY_BY_ID[found.dayId].label) + ' · ' +
              esc(SLOTS[course.slot].label) + '</p>' +
            '<h2 class="drawer__title">' + esc(course.name) + '</h2>' +
          '</div>' +
          '<button type="button" class="btn btn--ghost btn--sm drawer__close" data-action="close-drawer">' +
            ICONS.close + 'Kapat</button>' +
        '</header>' +
        '<div class="drawer__body">' +
          (body || '<p class="hint">Bu derse henüz ayrıntı eklemedin. Yukarıdaki “＋ Ekle” seçenekleriyle konu, ' +
            'ödev, soru hedefi veya not ekleyebilirsin.</p>') +
        '</div>' +
        '<footer class="drawer__foot">' +
          '<button type="button" class="btn btn--sm" data-action="open-course-modal" data-mode="edit" data-id="' +
            esc(course.id) + '">' + ICONS.pencil + 'Düzenle</button>' +
          '<button type="button" class="btn btn--sm" data-action="open-course-modal" data-mode="copy" data-id="' +
            esc(course.id) + '">Kopyala</button>' +
          '<button type="button" class="btn btn--sm" data-action="open-course-modal" data-mode="move" data-id="' +
            esc(course.id) + '">Taşı</button>' +
          '<span class="spacer"></span>' +
          '<button type="button" class="btn btn--sm btn--danger" data-action="confirm-delete-course" data-id="' +
            esc(course.id) + '">' + ICONS.trash + 'Sil</button>' +
        '</footer>' +
      '</aside>' +
    '</div>';
  }

  /* ------------------------------- Modal'lar ----------------------------- */
  function dayOptions(selected) {
    return DAYS.map(function (day) {
      return '<option value="' + day.id + '"' + (day.id === selected ? ' selected' : '') + '>' +
        day.label + '</option>';
    }).join('');
  }
  function slotOptions(selected) {
    return SLOT_IDS.map(function (id) {
      return '<option value="' + id + '"' + (id === selected ? ' selected' : '') + '>' +
        SLOTS[id].label + '</option>';
    }).join('');
  }

  function openCourseModal(options) {
    const opts = Object.assign({ mode: 'create', dayId: todayDayId(), slot: 'school', courseId: null }, options || {});
    if (opts.courseId) {
      const found = findCourse(opts.courseId);
      if (found) {
        opts.dayId = found.dayId;
        opts.slot = found.course.slot;
      }
    }
    ui.modal = {
      type: 'course',
      mode: opts.mode,
      courseId: opts.courseId,
      dayId: DAY_BY_ID[opts.dayId] ? opts.dayId : todayDayId(),
      slot: SLOT_IDS.indexOf(opts.slot) >= 0 ? opts.slot : 'school'
    };
    render();
  }

  const MODAL_TITLES = {
    create: 'Ders Ekle',
    edit: 'Dersi Düzenle',
    copy: 'Dersi Kopyala',
    move: 'Dersi Taşı'
  };
  const MODAL_SUBMIT = { create: 'Kaydet', edit: 'Kaydet', copy: 'Kopyala', move: 'Taşı' };

  function renderCourseModal() {
    const modal = ui.modal;
    const found = modal.courseId ? findCourse(modal.courseId) : null;
    const course = found ? found.course : null;
    const mode = modal.mode;
    const simple = mode === 'copy' || mode === 'move';

    let fields;
    if (simple) {
      fields = '<p class="modal__sub">' + (mode === 'copy'
        ? '“' + esc(course ? course.name : '') + '” dersinin bir kopyası oluşturulacak.'
        : '“' + esc(course ? course.name : '') + '” dersi seçtiğin gün ve bölüme taşınacak.') + '</p>';
    } else {
      fields =
        '<div class="field"><label class="field__label">Ders adı</label>' +
          '<input type="text" name="name" required maxlength="90" value="' + esc(course ? course.name : '') +
          '" placeholder="Örn. Matematik"></div>' +
        '<div class="form__row">' +
          '<div class="field"><label class="field__label">Öğretmen (isteğe bağlı)</label>' +
            '<input type="text" name="teacher" value="' + esc(course ? course.teacher : '') +
            '" placeholder="Örn. Ahmet Yılmaz"></div>' +
          '<div class="field"><label class="field__label">Saat (isteğe bağlı)</label>' +
            '<input type="text" name="time" value="' + esc(course ? course.time : '') +
            '" placeholder="Örn. 09:30"></div>' +
        '</div>' +
        '<div class="field"><label class="field__label">Açıklama (isteğe bağlı)</label>' +
          '<textarea name="description" rows="2" placeholder="Bu dersle ilgili kısa bir not">' +
          esc(course ? course.description : '') + '</textarea></div>' +
        '<p class="hint">Boş bıraktığın alanlar ders kartında ve detayda hiç görünmez.</p>';
    }

    return '<div class="modal-wrap">' +
      '<div class="modal-wrap__scrim" data-action="close-modal"></div>' +
      '<form class="modal" data-action="submit-course" data-mode="' + mode + '"' +
        (modal.courseId ? ' data-id="' + esc(modal.courseId) + '"' : '') + '>' +
        '<div class="modal__head">' +
          '<h2 class="modal__title">' + esc(MODAL_TITLES[mode] || 'Ders') + '</h2>' +
          '<button type="button" class="mini drawer__close" data-action="close-modal" aria-label="Kapat">' +
            ICONS.close + '</button>' +
        '</div>' +
        '<div class="modal__body">' +
          fields +
          '<div class="form__row">' +
            '<div class="field"><label class="field__label">Gün</label><select name="day">' +
              dayOptions(modal.dayId) + '</select></div>' +
            '<div class="field"><label class="field__label">Bölüm</label><select name="slot">' +
              slotOptions(modal.slot) + '</select></div>' +
          '</div>' +
        '</div>' +
        '<div class="modal__foot">' +
          '<button type="button" class="btn btn--ghost" data-action="close-modal">Vazgeç</button>' +
          '<button type="submit" class="btn btn--primary">' + esc(MODAL_SUBMIT[mode] || 'Kaydet') + '</button>' +
        '</div>' +
      '</form>' +
    '</div>';
  }

  function renderImportModal() {
    const incoming = ui.modal.incoming;
    const total = importCount(incoming);
    const c = counts();
    let incomingItems = 0;
    DAYS.forEach(function (day) {
      incoming.days[day.id].courses.forEach(function (course) {
        Object.keys(LISTS).forEach(function (key) { incomingItems += course[key].length; });
      });
    });
    return '<div class="modal-wrap">' +
      '<div class="modal-wrap__scrim" data-action="close-modal"></div>' +
      '<div class="modal modal--sm" role="dialog" aria-modal="true">' +
        '<div class="modal__head">' +
          '<h2 class="modal__title">Verileri içe aktar</h2>' +
          '<button type="button" class="mini drawer__close" data-action="close-modal" aria-label="Kapat">' +
            ICONS.close + '</button>' +
        '</div>' +
        '<div class="modal__body">' +
          '<p class="modal__sub">“' + esc(ui.modal.fileName) + '” dosyasında <strong>' + total +
            ' ders</strong> ve <strong>' + incomingItems + ' ayrıntı kaydı</strong> bulundu.<br>' +
            'Bu cihazda şu an ' + c.courses + ' ders var.</p>' +
          '<p class="hint">Yüklenen dosya internete gönderilmez; yalnızca bu cihazda işlenir.</p>' +
        '</div>' +
        '<div class="modal__foot">' +
          '<button type="button" class="btn btn--ghost" data-action="close-modal">Vazgeç</button>' +
          '<button type="button" class="btn btn--danger" data-action="import-replace">Mevcut verilerin yerine koy</button>' +
          '<button type="button" class="btn btn--primary" data-action="import-merge">Birleştir</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function renderConfirmModal() {
    const data = pendingConfirm;
    return '<div class="modal-wrap">' +
      '<div class="modal-wrap__scrim" data-action="confirm-cancel"></div>' +
      '<div class="modal modal--sm" role="alertdialog" aria-modal="true">' +
        '<div class="modal__head">' +
          '<h2 class="modal__title">' + esc(data.title) + '</h2>' +
          '<button type="button" class="mini drawer__close" data-action="confirm-cancel" aria-label="Kapat">' +
            ICONS.close + '</button>' +
        '</div>' +
        (data.text ? '<p class="modal__sub">' + esc(data.text) + '</p>' : '') +
        '<div class="modal__foot">' +
          '<button type="button" class="btn btn--ghost" data-action="confirm-cancel">Vazgeç</button>' +
          '<button type="button" class="btn btn--danger" data-action="confirm-ok">' +
            esc(data.label || 'Evet') + '</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function requestConfirm(options) {
    pendingConfirm = options;
    render();
  }
  function closeConfirm(execute) {
    const data = pendingConfirm;
    pendingConfirm = null;
    if (execute && data && typeof data.onConfirm === 'function') {
      data.onConfirm();
    } else {
      render();
    }
  }

  function renderModal() {
    const root = $('#modal-root');
    if (pendingConfirm) { root.innerHTML = renderConfirmModal(); return; }
    if (!ui.modal) { root.innerHTML = ''; return; }
    if (ui.modal.type === 'import') { root.innerHTML = renderImportModal(); return; }
    root.innerHTML = renderCourseModal();
  }

  /* ------------------------- Form gönderim işlemleri --------------------- */
  function closeForms() {
    ui.forms = {};
  }

  function handleFormSubmit(form) {
    const key = form.dataset.form || '';
    const courseId = form.dataset.course || '';
    const found = findCourse(courseId);
    if (!found) return;
    const data = new FormData(form);
    const parts = key.split(':');
    /* Soru hedefi formu 'goals' anahtarıyla açılır ama liste adı 'goals', form türü 'goal'. */
    const kind = parts[0] === 'goals' ? 'goal' : parts[0];
    const listKey = kind === 'goal' ? 'goals' : kind;
    const itemId = parts[1] || null;

    const meta = META_FIELDS.find(function (f) { return f.key === kind; });
    if (meta) {
      const value = String(data.get('value') || '').trim();
      const patch = {};
      patch[kind] = value;
      updateCourse(courseId, patch);
      closeForm(kind);
      render();
      toast(value ? meta.label + ' kaydedildi.' : meta.label + ' kaldırıldı.');
      return;
    }

    if (!LISTS[listKey]) return;

    if (kind === 'goal') {
      const target = Math.max(1, intOr(data.get('target'), 1));
      const text = String(data.get('text') || '').trim();
      if (itemId) {
        listUpdate(courseId, 'goals', itemId, { target: target, text: text });
      } else {
        listAdd(courseId, 'goals', { target: target, text: text });
      }
      closeForm(key);
      render();
      toast(itemId ? 'Soru hedefi güncellendi.' : 'Soru hedefi eklendi: ' + target + ' soru.');
      return;
    }

    const text = String(data.get('text') || '').trim();
    if (!text) return;
    if (itemId) {
      listUpdate(courseId, listKey, itemId, { text: text });
    } else {
      listAdd(courseId, listKey, { text: text });
    }
    closeForm(key);
    render();
    toast(itemId ? SINGULAR[listKey] + ' güncellendi.' : SINGULAR[listKey] + ' eklendi.');
  }

  function handleCourseSubmit(form) {
    const mode = form.dataset.mode || 'create';
    const courseId = form.dataset.id || null;
    const data = new FormData(form);
    const dayId = String(data.get('day') || '');
    const slot = String(data.get('slot') || '');
    if (!DAY_BY_ID[dayId] || SLOT_IDS.indexOf(slot) < 0) {
      toast('Gün veya bölüm seçilemedi.');
      return;
    }

    if (mode === 'copy') {
      const copy = duplicateCourse(courseId, dayId, slot);
      ui.modal = null;
      closeForms();
      render();
      if (copy) toast(copy.name + ' oluşturuldu.');
      return;
    }

    if (mode === 'move') {
      const moved = moveCourse(courseId, dayId, slot);
      ui.modal = null;
      render();
      toast(moved ? 'Ders taşındı.' : 'Ders zaten o gün ve bölümde.');
      return;
    }

    const name = String(data.get('name') || '').trim();
    if (!name) return;
    const patch = {
      name: name,
      teacher: String(data.get('teacher') || '').trim(),
      time: String(data.get('time') || '').trim(),
      description: String(data.get('description') || '').trim()
    };

    if (mode === 'edit' && courseId && findCourse(courseId)) {
      updateCourse(courseId, patch);
      moveCourse(courseId, dayId, slot);
      ui.modal = null;
      render();
      toast('Ders güncellendi.');
      return;
    }

    const created = addCourse(dayId, Object.assign({ slot: slot }, patch));
    ui.modal = null;
    render();
    if (created) toast('“' + name + '” eklendi.');
  }

  /* ------------------------------ Olaylar -------------------------------- */
  function itemKind(key) {
    return key === 'goals' ? 'goal' : key;
  }

  function clearToast() {
    const root = $('#toast-root');
    if (root) root.innerHTML = '';
    toastAction = null;
    if (toastTimer) { window.clearTimeout(toastTimer); toastTimer = null; }
  }

  function onClick(event) {
    const trigger = event.target.closest ? event.target.closest('[data-action]') : null;
    if (!trigger) return;
    const action = trigger.dataset.action;
    const courseId = trigger.dataset.course || trigger.dataset.id || null;
    if (handleCourseAction(action, trigger, courseId)) return;
    handleAppAction(action, trigger, courseId);
  }

  /* Ders kartı ve detay çekmecesi işlemleri */
  function handleCourseAction(action, trigger, courseId) {
    switch (action) {
      case 'open-course':
        ui.drawer = trigger.dataset.id;
        closeForms();
        render();
        return true;

      case 'close-drawer':
        ui.drawer = null;
        closeForms();
        render();
        return true;

      case 'shift-course':
        if (shiftCourse(trigger.dataset.id, intOr(trigger.dataset.delta, 0))) render();
        return true;

      case 'open-form': {
        const key = trigger.dataset.form;
        openForm(key);
        ui.focus = 'form[data-form="' + key + '"] input, form[data-form="' + key + '"] textarea';
        render();
        return true;
      }

      case 'close-form':
        closeForm(trigger.dataset.form);
        render();
        return true;

      case 'toggle-item':
        listToggle(trigger.dataset.course, trigger.dataset.key, trigger.dataset.id);
        render();
        return true;

      case 'edit-item': {
        const key = formKey(itemKind(trigger.dataset.key), trigger.dataset.id);
        openForm(key);
        ui.focus = 'form[data-form="' + key + '"] input, form[data-form="' + key + '"] textarea';
        render();
        return true;
      }

      case 'delete-item': {
        const key = trigger.dataset.key;
        const label = SINGULAR[key] || 'Kayıt';
        const snapshot = listRemove(trigger.dataset.course, key, trigger.dataset.id);
        if (!snapshot) return true;
        closeForm(formKey(itemKind(key), trigger.dataset.id));
        render();
        toast(label + ' silindi.', {
          actionLabel: 'Geri al',
          onAction: function () {
            listRestore(snapshot);
            closeForms();
            render();
            toast(label + ' geri alındı.');
          }
        });
        return true;
      }

      case 'clear-field': {
        const field = trigger.dataset.field;
        const patch = {};
        patch[field] = '';
        updateCourse(courseId, patch);
        closeForm(field);
        render();
        toast('Alan kaldırıldı.');
        return true;
      }

      case 'goal-step':
        if (goalStep(courseId, trigger.dataset.id, intOr(trigger.dataset.delta, 1))) render();
        return true;

      case 'goal-reset':
        listUpdate(courseId, 'goals', trigger.dataset.id, { done: 0 });
        render();
        return true;

      case 'confirm-delete-course': {
        const found = findCourse(trigger.dataset.id);
        if (!found) return true;
        const name = found.course.name;
        requestConfirm({
          title: '“' + name + '” dersini silmek istediğine emin misin?',
          text: 'Bu dersin konuları, ödevleri, soru hedefleri, tekrarları ve notları da silinir.',
          label: 'Evet, sil',
          onConfirm: function () {
            const snapshot = removeCourse(trigger.dataset.id);
            closeForms();
            render();
            toast('“' + name + '” silindi.', {
              actionLabel: 'Geri al',
              onAction: function () {
                restoreCourse(snapshot);
                render();
                toast('Ders geri alındı.');
              }
            });
          }
        });
        return true;
      }

      case 'new-course':
        openCourseModal({ mode: 'create', dayId: trigger.dataset.day, slot: trigger.dataset.slot });
        return true;

      case 'open-course-modal':
        openCourseModal({
          mode: trigger.dataset.mode || 'edit',
          courseId: trigger.dataset.id,
          dayId: trigger.dataset.day,
          slot: trigger.dataset.slot
        });
        return true;

      default:
        return false;
    }
  }

  /* Genel uygulama işlemleri (görünüm, tema, yedekleme, onay) */
  function handleAppAction(action, trigger) {
    switch (action) {
      case 'set-view':
        ui.view = trigger.dataset.view;
        ui.drawer = null;
        ui.modal = null;
        closeForms();
        render();
        break;

      case 'set-theme': {
        const theme = trigger.dataset.theme;
        if (THEMES.indexOf(theme) < 0) break;
        state.settings.theme = theme;
        applyTheme();
        save();
        render();
        break;
      }

      case 'toggle-theme':
        state.settings.theme = resolveTheme() === 'dark' ? 'light' : 'dark';
        applyTheme();
        save();
        render();
        break;

      case 'close-modal':
        ui.modal = null;
        render();
        break;

      case 'confirm-ok':
        closeConfirm(true);
        break;

      case 'confirm-cancel':
        closeConfirm(false);
        break;

      case 'export-json':
        exportJSON();
        break;

      case 'import-json':
        openImportPicker();
        break;

      case 'import-replace':
        if (ui.modal && ui.modal.incoming) applyImportReplace(ui.modal.incoming);
        break;

      case 'import-merge':
        if (ui.modal && ui.modal.incoming) applyImportMerge(ui.modal.incoming);
        break;

      case 'reset-all':
        requestConfirm({
          title: 'Tüm verileri silmek istediğine emin misin?',
          text: 'Bu cihazdaki bütün dersler, konular, ödevler, hedefler ve notlar silinir. Bu işlem geri alınamaz. ' +
            'Yedek almak istersen önce “Verilerimi dışa aktar” seçeneğini kullanabilirsin.',
          label: 'Evet, tüm verileri sil',
          onConfirm: resetAll
        });
        break;

      case 'toast-action': {
        const run = toastAction;
        clearToast();
        if (typeof run === 'function') run();
        break;
      }

      case 'toast-close':
        clearToast();
        break;

      default:
        break;
    }
  }

  function onSubmit(event) {
    const form = event.target;
    if (!form || !form.dataset) return;
    if (form.dataset.action === 'submit-course') {
      event.preventDefault();
      handleCourseSubmit(form);
    } else if (form.dataset.action === 'submit-form') {
      event.preventDefault();
      handleFormSubmit(form);
    }
  }

  function onKeyDown(event) {
    if (event.key === 'Escape') {
      if (pendingConfirm) { closeConfirm(false); return; }
      if (ui.modal) { ui.modal = null; render(); return; }
      if (ui.drawer) { ui.drawer = null; closeForms(); render(); return; }
      return;
    }
    const card = event.target && event.target.closest ? event.target.closest('.course') : null;
    if (card && event.target === card && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      ui.drawer = card.dataset.id;
      closeForms();
      render();
    }
  }

  /* ------------------------- Sürükle & bırak ----------------------------- */
  let draggedId = null;

  function nearestZone(target) {
    return target && target.closest ? target.closest('[data-drop="slot"]') : null;
  }

  function clearDragState() {
    draggedId = null;
    ui.drag = null;
    document.body.classList.remove('is-dragging');
    $$('.is-dragging').forEach(function (el) { el.classList.remove('is-dragging'); });
    $$('.drop-target').forEach(function (el) { el.classList.remove('drop-target'); });
  }

  function onDragStart(event) {
    const card = event.target.closest ? event.target.closest('.course') : null;
    if (!card) return;
    draggedId = card.dataset.id;
    ui.drag = { id: draggedId };
    card.classList.add('is-dragging');
    document.body.classList.add('is-dragging');
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      try { event.dataTransfer.setData('text/plain', draggedId); } catch (e) { /* yoksay */ }
    }
  }

  function onDragOver(event) {
    if (!draggedId) return;
    const zone = nearestZone(event.target);
    if (!zone) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    $$('.drop-target').forEach(function (el) { el.classList.remove('drop-target'); });
    zone.classList.add('drop-target');
    const card = event.target.closest ? event.target.closest('.course') : null;
    if (card && card.dataset.id !== draggedId) card.classList.add('drop-target');
  }

  function onDrop(event) {
    if (!draggedId) return;
    const zone = nearestZone(event.target);
    if (!zone) { clearDragState(); return; }
    event.preventDefault();

    const targetDay = zone.dataset.day;
    const targetSlot = zone.dataset.slot;
    const card = event.target.closest ? event.target.closest('.course') : null;
    let beforeId = null;

    if (card && card.dataset.id !== draggedId) {
      const rect = card.getBoundingClientRect();
      if (event.clientY > rect.top + rect.height / 2) {
        const list = coursesOf(targetDay, targetSlot);
        const index = list.findIndex(function (c) { return c.id === card.dataset.id; });
        const next = list[index + 1];
        beforeId = next ? next.id : null; // kartın altına bırakıldı
      } else {
        beforeId = card.dataset.id; // kartın üstüne bırakıldı
      }
    }

    const id = draggedId;
    clearDragState();
    if (dropCourse(id, targetDay, targetSlot, beforeId)) render();
  }

  /* -------------------------------- Başlat ------------------------------- */
  function init() {
    document.addEventListener('click', onClick);
    document.addEventListener('submit', onSubmit);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('dragstart', onDragStart);
    document.addEventListener('dragover', onDragOver);
    document.addEventListener('drop', onDrop);
    document.addEventListener('dragend', clearDragState);
    document.addEventListener('change', function (event) {
      if (event.target && event.target.id === 'import-input') handleImportFile(event.target);
    });

    if (window.matchMedia) {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const onSchemeChange = function () {
        if (state.settings.theme !== 'system') return;
        applyTheme();
        render();
      };
      if (typeof mq.addEventListener === 'function') mq.addEventListener('change', onSchemeChange);
      else if (typeof mq.addListener === 'function') mq.addListener(onSchemeChange);
    }

    window.addEventListener('beforeunload', function () { flushSave(); });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') flushSave();
    });

    applyTheme();
    /* Önce boş iskelet (yedi gün) hemen çizilir; ardından cihazdaki veriler yüklenir.
       Böylece depolama erişimi yavaş olsa bile arayüz beklemede kalmaz. */
    render();

    /* Veri yalnızca bu cihazdan okunur. */
    Store.read().then(function (raw) {
      if (touchedByUser) return; // kullanıcı bu sırada veri ekledi; üzerine yazma
      state = normalize(raw);
      applyTheme();
      render();
    });
  }

  init();



















})();
