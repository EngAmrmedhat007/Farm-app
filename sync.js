/* مزامنة Firebase: تسجيل الدخول + حفظ البيانات على السحابة.
   التطبيق يفضل شغال من التخزين المحلي حتى من غير نت، والمزامنة بتتم في الخلفية. */
const CFG = {
  apiKey: "AIzaSyB6bFSV5oOF2jUcY0r-F1P5GbOyVmEFsWw",
  authDomain: "minya-farm-3-007.firebaseapp.com",
  projectId: "minya-farm-3-007",
  storageBucket: "minya-farm-3-007.firebasestorage.app",
  messagingSenderId: "608361914612",
  appId: "1:608361914612:web:9b74551d2fb7abca1bfea1"
};
const B = 'https://www.gstatic.com/firebasejs/10.14.1/';
const COL = 'farm';
const OBJK = ['days', 'eve', 'todo', 'feedEng', 'feedCrew', 'crewMod', 'evx', 'copied', 'handover']; // كلها مفاتيحها تبدأ بتاريخ
const LISTK = ['treat', 'alerts', 'issues'];
const LOCAL_SET = ['pin', 'pinQ', 'pinA', 'lastBackup', 'sound', 'wake']; // إعدادات خاصة بكل جهاز (و fired كمان محلي)
const LSK = 'farm_sync_v1', BKK = 'farm_prelink_backup_v1';

/* ---------- أدوات ---------- */
const canon = v => {
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  const s = JSON.stringify(v); return s === undefined ? 'null' : s;
};
const dateOf = k => (String(k).match(/^\d{4}-\d{2}-\d{2}/) || ['_'])[0];
function build(S) {
  const out = {};
  for (const k of OBJK) {
    const o = S[k] || {};
    for (const key of Object.keys(o)) {
      const id = 'd_' + dateOf(key);
      const sh = out[id] || (out[id] = {});
      (sh[k] || (sh[k] = {}))[key] = o[key];
    }
  }
  const set = {}; for (const k in S.settings) if (!LOCAL_SET.includes(k)) set[k] = S.settings[k];
  out.settings = set;
  const l = {}; LISTK.forEach(k => l[k] = S[k] || []); out.lists = l;
  const sig = {}; for (const id in out) sig[id] = canon(out[id]);
  return sig;
}
function applyShard(S, id, obj) {
  if (id === 'settings') { for (const k in obj) if (!LOCAL_SET.includes(k)) S.settings[k] = obj[k]; return; }
  if (id === 'lists') { LISTK.forEach(k => { if (Array.isArray(obj[k])) S[k] = obj[k]; }); return; }
  const d = id.slice(2);
  for (const k of OBJK) {
    const tgt = S[k] || (S[k] = {});
    for (const key of Object.keys(tgt)) if (dateOf(key) === d) delete tgt[key];
    const src = obj[k] || {};
    for (const key in src) tgt[key] = src[key];
  }
}
const rd = () => { try { return JSON.parse(localStorage.getItem(LSK)) || {}; } catch (e) { return {}; } };
const wr = o => { try { localStorage.setItem(LSK, JSON.stringify(o)); } catch (e) {} };

/* ---------- واجهة ---------- */
const css = document.createElement('style');
css.textContent = `
#syncPill{position:fixed;z-index:35;bottom:calc(env(safe-area-inset-bottom) + 76px);left:8px;font:600 11px var(--font);padding:3px 9px;border-radius:99px;background:var(--surface);color:var(--muted);border:1px solid var(--line);opacity:.92;cursor:pointer}
#syncPill.ok{color:var(--ok)}#syncPill.sync{color:var(--info)}#syncPill.bad{color:var(--warn)}
#syncLogin{position:fixed;inset:0;z-index:250;background:var(--bg);display:grid;place-items:center;padding:24px;font-family:var(--font);color:var(--fg)}
#syncLogin form,#syncAcc .box{width:min(380px,100%);display:grid;gap:12px;background:var(--surface);border:1px solid var(--line);border-radius:var(--r);padding:22px}
#syncLogin h2,#syncAcc h2{margin:0;font-family:var(--display);font-size:24px;text-align:center}
#syncLogin input{font:inherit;padding:12px;border-radius:12px;border:1px solid var(--line);background:var(--bg);color:var(--fg);width:100%;box-sizing:border-box;direction:ltr;text-align:left}
#syncLogin button,#syncAcc button{font:700 16px var(--font);padding:12px;border-radius:12px;border:0;background:var(--brand);color:var(--brand-fg);cursor:pointer}
#syncLogin button.alt,#syncAcc button.alt{background:transparent;color:var(--muted);font-weight:500;font-size:14px}
#syncLogin .err{color:var(--bad);font-size:14px;min-height:18px;text-align:center}
#syncAcc{position:fixed;inset:0;z-index:240;background:rgba(0,0,0,.45);display:grid;place-items:center;padding:24px;font-family:var(--font);color:var(--fg)}
#syncAcc .em{direction:ltr;text-align:center;color:var(--muted);font-size:14px;word-break:break-all}
`;
document.head.appendChild(css);
const pill = document.createElement('div'); pill.id = 'syncPill'; document.body.appendChild(pill);
let state = 'off', user = null, dirty = new Set(), signOutFn = null, openLogin = () => {};
function paint() {
  let t, c = '';
  if (state === 'nosdk') { t = '⚠ بدون مزامنة (لا يوجد اتصال)'; c = 'bad'; }
  else if (!user) { t = '☁ غير مسجّل، اضغط للدخول'; c = 'bad'; }
  else if (!navigator.onLine) { t = '⚠ أوفلاين، محفوظ على الجهاز'; c = 'bad'; }
  else if (state === 'sync' || dirty.size) { t = '↻ جاري المزامنة'; c = 'sync'; }
  else if (state === 'err') { t = '⚠ تعذّرت المزامنة'; c = 'bad'; }
  else { t = '☁ متزامن ✓'; c = 'ok'; }
  pill.textContent = t; pill.className = c;
}
addEventListener('online', paint); addEventListener('offline', paint);
const errAr = e => {
  const c = (e && e.code) || '';
  if (/invalid-credential|wrong-password|user-not-found|invalid-email/.test(c)) return 'الإيميل أو كلمة السر غلط';
  if (/network/.test(c)) return 'مفيش اتصال بالإنترنت';
  if (/too-many/.test(c)) return 'محاولات كتير، استنى شوية وجرّب تاني';
  if (/user-disabled/.test(c)) return 'الحساب ده متوقف';
  return 'تعذّر تسجيل الدخول (' + (c || 'خطأ') + ')';
};

/* ---------- التشغيل ---------- */
(async function () {
  const F = window.FARM;
  if (!F) return;
  const store = rd();
  dirty = new Set(store.dirty || []);
  let sent = build(F.get()), cur = sent;
  for (const id of [...dirty]) if (!(id in cur)) dirty.delete(id);
  const save = () => { store.dirty = [...dirty]; wr(store); };

  let M;
  try {
    M = await Promise.all([import(B + 'firebase-app.js'), import(B + 'firebase-auth.js'), import(B + 'firebase-firestore.js')]);
  } catch (e) { state = 'nosdk'; paint(); F.onSave = () => { cur = build(F.get()); for (const id in cur) if (cur[id] !== sent[id]) dirty.add(id); save(); }; return; }
  const [A, AU, FS] = M;
  const app = A.initializeApp(CFG);
  const auth = AU.getAuth(app);
  let db;
  try { db = FS.initializeFirestore(app, { localCache: FS.persistentLocalCache({ tabManager: FS.persistentMultipleTabManager() }) }); }
  catch (e) { db = FS.getFirestore(app); }

  let ready = false, unsub = null, timer = null;
  const inflight = {};

  F.onSave = () => {
    const n = build(F.get());
    for (const id in n) if (n[id] !== sent[id]) dirty.add(id);
    for (const id in sent) if (!(id in n) && sent[id] !== '{}') dirty.add(id);
    cur = n; save(); paint();
    clearTimeout(timer); timer = setTimeout(flush, 1200);
  };

  function flush() {
    if (!ready || !user) return;
    for (const id of [...dirty]) {
      const sig = cur[id] === undefined ? '{}' : cur[id];
      if (inflight[id] === sig) continue;
      inflight[id] = sig;
      FS.setDoc(FS.doc(db, COL, id), { json: sig, by: user.email || user.uid, ts: FS.serverTimestamp() }).then(() => {
        if (inflight[id] === sig) delete inflight[id];
        sent[id] = sig;
        if ((cur[id] === undefined ? '{}' : cur[id]) === sig) dirty.delete(id);
        state = 'ok'; save(); paint();
      }).catch(e => { delete inflight[id]; console.warn('sync write failed', id, e); state = 'err'; paint(); });
    }
    paint();
  }

  function pullInto(S, id, json) {
    let o; try { o = JSON.parse(json); } catch (e) { return false; }
    applyShard(S, id, o); return true;
  }

  function reconcile(snap) {
    const S = F.get();
    const cloud = {}; snap.forEach(d => { const j = d.data().json; if (typeof j === 'string') cloud[d.id] = j; });
    if (!store.linked && Object.keys(cloud).length && Object.keys(S.days || {}).length) {
      try { localStorage.setItem(BKK, JSON.stringify(S)); } catch (e) {}
    }
    let changed = false;
    for (const id in cloud) {
      if (dirty.has(id) && id in cur) continue;                 // تعديل محلي لم يُرفع: يفوز المحلي
      const local = cur[id] === undefined ? '{}' : cur[id];
      if (local !== cloud[id] && pullInto(S, id, cloud[id])) changed = true;
    }
    cur = build(S);
    for (const id in cur) if (!(id in cloud)) dirty.add(id);    // أول ربط، أو تعديل أوفلاين: ارفعه
    for (const id in cloud) if (!dirty.has(id)) sent[id] = cur[id] === undefined ? '{}' : cur[id];
    for (const id in cur) if (!dirty.has(id)) sent[id] = cur[id];
    store.linked = true; save();
    if (changed) F.refresh();
    ready = true; state = 'ok'; paint(); flush();
  }

  function listen() {
    state = 'sync'; paint();
    unsub = FS.onSnapshot(FS.collection(db, COL), { includeMetadataChanges: true }, snap => {
      if (!ready) { if (!snap.metadata.fromCache) reconcile(snap); return; }
      const S = F.get(); let changed = false;
      snap.docChanges().forEach(ch => {
        if (ch.type === 'removed' || ch.doc.metadata.hasPendingWrites) return;
        const id = ch.doc.id, j = ch.doc.data().json;
        if (typeof j !== 'string' || dirty.has(id)) return;
        if ((cur[id] === undefined ? '{}' : cur[id]) === j) return;
        if (pullInto(S, id, j)) { changed = true; cur = build(S); sent[id] = cur[id] === undefined ? '{}' : cur[id]; }
      });
      if (changed) F.refresh();
      paint();
    }, e => { console.warn('sync listen failed', e); state = 'err'; paint(); });
  }

  function stop() { if (unsub) unsub(); unsub = null; ready = false; }

  /* شاشة الدخول */
  function showLogin() {
    if (document.getElementById('syncLogin')) return;
    const el = document.createElement('div'); el.id = 'syncLogin';
    el.innerHTML = '<form><h2>🌿 متابعة المزرعة</h2><div class="small" style="text-align:center;color:var(--muted)">سجّل دخولك عشان البيانات تتحفظ وتظهر على كل الأجهزة</div>' +
      '<input type="email" id="sEm" placeholder="الإيميل" autocomplete="username" required><input type="password" id="sPw" placeholder="كلمة السر" autocomplete="current-password" required>' +
      '<div class="err" id="sErr"></div><button type="submit">دخول</button><button type="button" class="alt" id="sSkip">متابعة بدون مزامنة</button></form>';
    document.body.appendChild(el);
    el.querySelector('form').addEventListener('submit', async ev => {
      ev.preventDefault();
      const b = el.querySelector('button[type=submit]'), er = el.querySelector('#sErr');
      b.disabled = true; b.textContent = 'جاري الدخول...'; er.textContent = '';
      try { await AU.signInWithEmailAndPassword(auth, el.querySelector('#sEm').value.trim(), el.querySelector('#sPw').value); }
      catch (e) { er.textContent = errAr(e); b.disabled = false; b.textContent = 'دخول'; }
    });
    el.querySelector('#sSkip').addEventListener('click', () => el.remove());
    setTimeout(() => { const i = el.querySelector('#sEm'); if (i) i.focus(); }, 60);
  }
  openLogin = showLogin;
  const hideLogin = () => { const e = document.getElementById('syncLogin'); if (e) e.remove(); };

  function showAcc() {
    const el = document.createElement('div'); el.id = 'syncAcc';
    el.innerHTML = '<div class="box"><h2>الحساب</h2><div class="em"></div><button class="alt" id="aClose">إغلاق</button><button id="aOut" style="background:var(--bad);color:#fff">تسجيل الخروج</button></div>';
    el.querySelector('.em').textContent = user.email || '';
    el.addEventListener('click', e => { if (e.target === el || e.target.id === 'aClose') el.remove(); });
    el.querySelector('#aOut').addEventListener('click', async () => { el.remove(); try { await AU.signOut(auth); } catch (e) {} });
    document.body.appendChild(el);
  }
  pill.addEventListener('click', () => { if (user) showAcc(); else showLogin(); });

  AU.onAuthStateChanged(auth, u => {
    user = u || null;
    if (user) { hideLogin(); stop(); listen(); }
    else { stop(); state = 'off'; paint(); showLogin(); }
    paint();
  });
  paint();
})();
