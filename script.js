'use strict';

/* ══════════════════════════════════════════════════════════════
   نووا گیم — script.js v6.0
   تغییرات نسخه ۶:
   - فیکس باگ فرمت (ZWSP)
   - seed کاربران تستی همیشه‌حاضر
   - آیکون thumbs (بدون ایموجی)
   - لوگو کلیک به خانه
   - فیکس باگ ریپلای تودرتوی گروه
   - تب‌های PM (دریافت/ارسال/گروهی)
   - پیام سراسری
   - حذف PM از نوار بالا
   ══════════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════════
   ۱. ابزارهای پایه
   ══════════════════════════════════════════════════════════════ */
const $ = (s, c) => (c || document).querySelector(s);
const $$ = (s, c) => Array.from((c || document).querySelectorAll(s));

const store = {
    get(k, fb) { try { const v = localStorage.getItem(k); return v === null ? fb : v; } catch (e) { return fb; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* حافظه پر یا غیرفعال */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} },
    json(k, fb) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch (e) { return fb; } }
};

function faNum(n) { return String(n == null ? 0 : n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]); }
function uid(p) { return (p || '') + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function esc(s) { const d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML; }
function stripHtml(h) { const d = document.createElement('div'); d.innerHTML = h || ''; return d.textContent || ''; }

function timeAgo(ts) {
    const d = (Date.now() - ts) / 1000;
    if (d < 60) return 'همین الان';
    if (d < 3600) return faNum(Math.floor(d / 60)) + ' دقیقه پیش';
    if (d < 86400) return faNum(Math.floor(d / 3600)) + ' ساعت پیش';
    if (d < 604800) return faNum(Math.floor(d / 86400)) + ' روز پیش';
    try { return new Date(ts).toLocaleDateString('fa-IR'); } catch (e) { return ''; }
}

/* منشن — امن‌تر: فقط بعد از ابتدا/فاصله/کاراکتر باز */
function parseMentions(t) {
    if (!t) return '';
    return t.replace(/(^|[\s(>])@([a-zA-Z][a-zA-Z0-9_]{2,19})\b/g,
        (m, pre, u) => pre + '<span class="mention" data-username="' +
                       u.toLowerCase() + '">@' + u + '</span>');
}

/* fileToBase64 با validation نوع فایل */
async function uploadImage(file) {
    if (!file) throw new Error('فایلی انتخاب نشد');
    if (!/^image\/(png|jpe?g|gif|webp)$/.test(file.type)) throw new Error('فقط عکس (PNG / JPG / GIF / WebP) مجاز است');
    if (file.size > 3 * 1024 * 1024) throw new Error('حجم فایل زیاده (بیشتر از ۳ مگابایت)');
    return API.upload(file);
}

/* آیکون‌های SVG — thumbs بدون ایموجی */
const ICON = {
    thumbUp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"/></svg>',
    thumbDown: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 14V2"/><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z"/></svg>'
};

/* ─── Toast با صف ─── */
const _toastQueue = [];
let _toastActive = false;
let _toastTimer;
function toast(msg, d) {
    _toastQueue.push({ msg, d: d || 2200 });
    if (!_toastActive) _showNextToast();
}
function _showNextToast() {
    if (!_toastQueue.length) { _toastActive = false; return; }
    _toastActive = true;
    const { msg, d } = _toastQueue.shift();
    const el = $('#toast');
    if (!el) { _toastActive = false; return; }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => {
        el.classList.remove('show');
        setTimeout(_showNextToast, 250);
    }, d);
}

const isLowEnd = () => {
    try {
        return (navigator.hardwareConcurrency || 4) <= 4 ||
               (navigator.deviceMemory || 4) <= 2;
    } catch (e) { return false; }
};

/* ══════════════════════════════════════════════════════════════
   ۲. موتور ویرایش — Range-based + ZWSP fix
   ══════════════════════════════════════════════════════════════ */

const EMOJI_RE = /\p{Extended_Pictographic}/u;

function splitByEmoji(text) {
    if (!text) return [{ text: '', emoji: false }];
    const parts = [];
    let last = 0;
    const re = /\p{Extended_Pictographic}/gu;
    let m;
    while ((m = re.exec(text)) !== null) {
        if (m.index > last) parts.push({ text: text.slice(last, m.index), emoji: false });
        let end = m.index + m[0].length;
        while (end < text.length) {
            const code = text.codePointAt(end);
            if (code === 0xFE0F || code === 0x200D) { end += (code === 0x200D ? 2 : 1); continue; }
            if (code >= 0x1F3FB && code <= 0x1F3FF) { end += 2; continue; }
            break;
        }
        parts.push({ text: text.slice(m.index, end), emoji: true });
        last = end;
        re.lastIndex = end;
    }
    if (last < text.length) parts.push({ text: text.slice(last), emoji: false });
    return parts.length ? parts : [{ text, emoji: false }];
}

function wrapNodesWithoutEmoji(node, makeWrapper) {
    const frag = document.createDocumentFragment();
    const children = Array.from(node.childNodes);
    for (const child of children) {
        if (child.nodeType === 3) {
            const parts = splitByEmoji(child.textContent);
            for (const part of parts) {
                if (!part.text) continue;
                if (part.emoji) {
                    frag.appendChild(document.createTextNode(part.text));
                } else {
                    const w = makeWrapper();
                    w.textContent = part.text;
                    frag.appendChild(w);
                }
            }
        } else if (child.nodeType === 1) {
            const tagName = child.tagName.toLowerCase();
            if (tagName === 'script' || tagName === 'style') {
                frag.appendChild(child.cloneNode(true));
                continue;
            }
            const clone = child.cloneNode(false);
            const inner = wrapNodesWithoutEmoji(child, makeWrapper);
            clone.appendChild(inner);
            frag.appendChild(clone);
        } else {
            frag.appendChild(child.cloneNode(true));
        }
    }
    return frag;
}

/* ═══ اعمال استایل + ZWSP برای جلوگیری از ادامه فرمت ═══ */
function applyToSelection(makeWrapper) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return false;
    const range = sel.getRangeAt(0);
    if (range.collapsed) return false;

    let node = range.startContainer;
    if (node.nodeType === 3) node = node.parentElement;
    const editable = node && node.closest('[contenteditable="true"]');
    if (!editable) return false;
    if (!editable.contains(range.commonAncestorContainer) &&
        !editable.contains(range.startContainer)) return false;

    const frag = range.extractContents();
    const wrapped = wrapNodesWithoutEmoji(frag, makeWrapper);
    const children = Array.from(wrapped.childNodes);
    range.insertNode(wrapped);

    /* FIX: بعد از insert، caret را بیرون wrapper با ZWSP قرار بده
       این مانع می‌شود که کاربر ادامه متن را با همان فرمت بنویسد */
    if (children.length) {
        const lastChild = children[children.length - 1];
        if (lastChild.parentNode) {
            const spacer = document.createTextNode('\u200B');
            lastChild.parentNode.insertBefore(spacer, lastChild.nextSibling);
            try {
                const nr = document.createRange();
                nr.setStart(spacer, 1);
                nr.collapse(true);
                sel.removeAllRanges();
                sel.addRange(nr);
            } catch (e) { /* ignore */ }
        }
    }
    return true;
}

/* پاک کردن ZWSPهایی که تنها محتوای یک textNode هستند */
function cleanupZWSP(root) {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const toRemove = [];
    let n;
    while ((n = walker.nextNode())) {
        if (n.textContent === '\u200B') toRemove.push(n);
    }
    /* فقط بعد از بسته شدن ادیتور یا blur پاک می‌کنیم تا caret نشکند */
    toRemove.forEach(node => {
        if (node.parentNode) node.parentNode.removeChild(node);
    });
}

const Ed = {
    bold() { return applyToSelection(() => { const s = document.createElement('strong'); s.style.fontWeight = '800'; return s; }); },
    italic() { return applyToSelection(() => { const s = document.createElement('em'); s.style.fontStyle = 'italic'; return s; }); },
    underline() { return applyToSelection(() => { const s = document.createElement('u'); s.style.textDecoration = 'underline'; return s; }); },
    color(color) { return applyToSelection(() => { const s = document.createElement('span'); s.style.color = color; return s; }); },
    rainbow() { return applyToSelection(() => { const s = document.createElement('span'); s.className = 'rainbow-text'; return s; }); },
    spoiler() {
        return applyToSelection(() => {
            const s = document.createElement('span');
            s.className = 'spoiler';
            return s;
        });
    },
    link() { return applyToSelection(() => { const s = document.createElement('a'); s.style.color = 'var(--accent)'; s.style.textDecoration = 'underline'; return s; }); },
    code() { return applyToSelection(() => { const s = document.createElement('code'); return s; }); }
};

/* ══════════════════════════════════════════════════════════════
   ۳. DB
   ══════════════════════════════════════════════════════════════ */
/* ══════════════════════════════════════════════════════════════
   ۳. ارتباط با سرور — API + کش state (جایگزین localStorage)
   ══════════════════════════════════════════════════════════════ */
const API = {
    async call(method, url, body) {
        let r;
        try {
            r = await fetch(url, {
                method, credentials: 'same-origin',
                headers: Object.assign({ 'X-Requested-With': 'nova' }, body !== undefined ? { 'Content-Type': 'application/json' } : {}),
                body: body !== undefined ? JSON.stringify(body) : undefined
            });
        } catch (e) { throw new Error('ارتباط با سرور برقرار نشد'); }
        let data = null;
        try { data = await r.json(); } catch (_) {}
        if (!r.ok) {
            const err = new Error((data && data.error) || 'خطا در ارتباط با سرور');
            err.status = r.status;
            throw err;
        }
        return data;
    },
    get(u) { return API.call('GET', u); },
    post(u, b) { return API.call('POST', u, b === undefined ? {} : b); },
    put(u, b) { return API.call('PUT', u, b); },
    patch(u, b) { return API.call('PATCH', u, b); },
    del(u) { return API.call('DELETE', u); },
    async upload(blob) {
        let r;
        try {
            r = await fetch('/api/upload', {
                method: 'POST', credentials: 'same-origin', body: blob,
                headers: { 'X-Requested-With': 'nova', 'Content-Type': blob.type || 'application/octet-stream' }
            });
        } catch (e) { throw new Error('ارتباط با سرور برقرار نشد'); }
        let data = null;
        try { data = await r.json(); } catch (_) {}
        if (!r.ok) throw new Error((data && data.error) || 'آپلود ناموفق بود');
        return data.url;
    }
};

const ST = {
    me: null, users: [], posts: [], groups: [], activity: [], actLikes: {}, actComments: [],
    notifs: [], pm: [], blocks: {}, broadcast: null, pending: [], gmsgs: {}
};

const DB = {
    getUsers() { return ST.users; },
    getPosts() { return ST.posts; },
    getGroups() { return ST.groups; },
    getNotifs() { return ST.notifs; },
    getPM() { return ST.pm; },
    getActivity() { return ST.activity; },
    getActivityLikes() { return ST.actLikes; },
    getActivityComments() { return ST.actComments; },
    getBlocks() { return ST.blocks; },
    getPending() { return ST.pending; },
    getBroadcast() { return ST.broadcast; }
};

function applyState(d) {
    Object.keys(d).forEach(k => { ST[k] = d[k]; });
    if (!d.pending && d.posts) ST.pending = [];
    if (ST.me) {
        const i = ST.users.findIndex(u => u.id === ST.me.id);
        if (i > -1) ST.users[i] = Object.assign({}, ST.users[i], ST.me);
    }
    S.user = ST.me;
}

/* parts: users, posts, groups, activity, private, broadcast — خالی = همه */
async function sync(parts) {
    const qs = parts && parts.length ? '?parts=' + parts.join(',') : '';
    applyState(await API.get('/api/state' + qs));
}

/* اجرای یک عملیات سروری + همگام‌سازی + نمایش خطا */
async function act(fn, parts) {
    try {
        const r = await fn();
        if (parts !== false) await sync(parts);
        return r === undefined ? true : r;
    } catch (e) {
        if (e.status === 401 && S.user) {
            try { await sync(); updateAuthUI(); } catch (_) {}
        }
        toast(e.message || 'خطا');
        return false;
    }
}

async function loadGroupMessages(gid) {
    try { ST.gmsgs[gid] = (await API.get('/api/groups/' + gid + '/messages')).messages; }
    catch (e) { ST.gmsgs[gid] = []; }
}

/* حرف اول امن برای آواتار (escape شده) */
function ini(s, fb) {
    const ch = Array.from(String(s == null || s === '' ? (fb || '?') : s))[0] || '?';
    return esc(ch.toUpperCase());
}

/* ─── رویدادهای زنده (SSE) ─── */
let _es = null, _evParts = new Set(), _evGid = null, _evTimer = null;
function connectEvents() {
    closeEvents();
    if (typeof EventSource === 'undefined') return;
    try {
        _es = new EventSource('/api/events');
        _es.onmessage = e => {
            let ev; try { ev = JSON.parse(e.data); } catch (_) { return; }
            (ev.parts || []).forEach(p => _evParts.add(p));
            if (ev.gid) _evGid = ev.gid;
            if (ev.resync && S.page === 'group') _evGid = S.pageData;   /* بعد از قطع طولانی، چت گروهِ باز هم دوباره بارگذاری شود */
            clearTimeout(_evTimer);
            _evTimer = setTimeout(runLiveRefresh, 350);
        };
    } catch (e) { /* ignore */ }
}
function closeEvents() { if (_es) { try { _es.close(); } catch (_) {} _es = null; } }

function isTyping() {
    const a = document.activeElement;
    if (a && a.isContentEditable && a.textContent.replace(/\u200B/g, '').trim()) return true;
    if (a && (a.tagName === 'TEXTAREA' || a.tagName === 'INPUT') && a.type !== 'checkbox' && a.type !== 'radio' && a.value) return true;
    const rm = $('#replyModal');
    if (rm && !rm.hidden) return true;
    const ef = $('#editorFullscreen');
    if (ef && !ef.hidden) return true;
    return false;
}

async function runLiveRefresh() {
    const parts = Array.from(_evParts).filter(p => p !== 'group');
    const gid = _evGid;
    _evParts.clear(); _evGid = null;
    try {
        if (parts.length) await sync(parts);
        if (S.page === 'group' && gid && S.pageData === gid) await loadGroupMessages(gid);
    } catch (e) { return; }
    rerenderCurrent();
}

function rerenderCurrent() {
    updateAuthUI();
    renderBroadcast();
    if (isTyping()) return;
    const p = S.page;
    const pmFocused = document.activeElement && document.activeElement.id === 'pmInput';
    if (p === 'home') renderHome();
    else if (p === 'post') renderPostPage(S.pageData);
    else if (p === 'groups') renderGroupsPage();
    else if (p === 'group') renderGroupPage(S.pageData);
    else if (p === 'pm' && S.user) {
        renderPMChatList();
        if (S.pmActiveUser) {
            renderPMConversation(S.pmActiveUser);
            if (pmFocused) { const i = $('#pmInput'); if (i) i.focus(); }
            const unread = DB.getPM().some(m => m.from === S.pmActiveUser && m.to === S.user.id && !m.read);
            if (unread) API.post('/api/pm/read', { from: S.pmActiveUser }).catch(() => {});
        }
    }
    else if (p === 'users') renderUsersPage();
    else if (p === 'activity') renderActivityPage();
    else if (p === 'profile') renderProfilePage(S.pageData);
    const panel = $('#userPanel');
    if (panel && panel.classList.contains('on') && S.user && !S.upTarget && S.upTab && S.upTab !== 'profile') {
        renderUserPanelBody(S.upTab);
    }
}

/* وقتی تب دوباره فعال شد داده‌ها را تازه کن */
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && ST.users.length) {
        sync().then(rerenderCurrent).catch(() => {});
    }
});

async function openGroupPage(gid) {
    const box = $('#groupContent');
    if (box) box.innerHTML = '<div class="empty-state"><p>در حال بارگذاری…</p></div>';
    try { await sync(['groups']); } catch (e) {}
    await loadGroupMessages(gid);
    if (S.page === 'group' && S.pageData === gid) renderGroupPage(gid);
}

function markActivePMRead() {
    if (!S.user || !S.pmActiveUser) return;
    const unread = ST.pm.some(m => m.from === S.pmActiveUser && m.to === S.user.id && !m.read);
    if (!unread) return;
    const from = S.pmActiveUser;
    API.post('/api/pm/read', { from }).then(() => sync(['private'])).then(() => { updateBadges(); if (S.page === 'pm') renderPMChatList(); }).catch(() => {});
}

function refreshStaffPanels() {
    const vis = id => { const p = $(id); return p && !p.hidden; };
    if (vis('#adminPanel')) renderAdminTab(S.adminTab);
    if (vis('#editorPanel')) renderEditorTab(S.editorTab);
    if (vis('#authorPanel')) renderAuthorTab(S.authorTab);
}

/* گزینه‌های «انتخاب سردبیر/پین» فقط برای سردبیر و مدیر */
function applyEditorRoleUI() {
    const staff = !!S.user && (S.user.role === 'editor' || S.user.role === 'admin');
    ['#editorChoice', '#editorPinned'].forEach(id => {
        const el = $(id);
        const grp = el && (el.closest('.form-group') || el.parentElement);
        if (grp) grp.hidden = !staff;
    });
}

/* داده‌های localStorage نسخه‌ی قدیمی همین مرورگر (برای انتقال) */
function collectLegacyLocal() {
    const g = (k, fb) => store.json('nova.' + k, fb);
    const users = g('users', []);
    if (!users.length) return null;
    return {
        users, posts: g('posts', []), groups: g('groups', []), pm: g('pm', []), notifs: g('notifs', []),
        activity: g('activity', []), blocks: g('blocks', {}), pending: g('pending', []),
        actLikes: g('actLikes', {}), actComments: g('actComments', []), broadcast: g('broadcast', null)
    };
}

/* ══════════════════════════════════════════════════════════════
   ۴. State
   ══════════════════════════════════════════════════════════════ */
const S = {
    theme: store.get('nova.theme', 'light'),
    user: null,
    page: 'home',
    pageData: null,
    postFilter: 'all',
    timeFilter: 'day',
    groupFilter: 'all',
    adminTab: 'stats',
    editorTab: 'myposts',
    authorTab: 'myposts',
    cropMode: null, cropTarget: null, cropImg: null,
    cropZoom: 1, cropRotate: 0,
    editingPostId: null,
    pmActiveUser: null,
    pmTab: 'received', /* received | sent | groups */
    replyContext: null,
    _submitting: false
};

const _sessionViews = new Set();

/* ══════════════════════════════════════════════════════════════
   ۶. تم
   ══════════════════════════════════════════════════════════════ */
function applyTheme(theme) {
    let final = theme;
    if (theme === 'auto') {
        const h = new Date().getHours();
        final = (h >= 7 && h < 19) ? 'light' : 'dark';
    }
    document.documentElement.dataset.theme = final;
    S.theme = theme;
    store.set('nova.theme', theme);

    const icon = $('#themeIcon');
    if (icon) {
        if (theme === 'light') {
            icon.innerHTML = '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>';
        } else if (theme === 'dark') {
            icon.innerHTML = '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>';
        } else {
            icon.innerHTML = '<circle cx="12" cy="12" r="9"/><path d="M12 3v18"/>';
        }
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = final === 'dark' ? '#0e1116' : '#f5f3ee';
    $$('[data-theme-set]').forEach(b => {
        const on = b.dataset.themeSet === theme;
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
}

function flipTheme() {
    const order = ['light', 'dark', 'auto'];
    const idx = order.indexOf(S.theme);
    const next = order[(idx + 1) % order.length];
    applyTheme(next);
    toast({ light: 'حالت روز', dark: 'حالت شب', auto: 'حالت خودکار' }[next]);
}
setInterval(() => { if (S.theme === 'auto') applyTheme('auto'); }, 60000);

/* ══════════════════════════════════════════════════════════════
   ۷. کاربر
   ══════════════════════════════════════════════════════════════ */
function getCurrentUser() { return ST.me || null; }
function getUserById(id) { return ST.users.find(u => u.id === id) || null; }

function badgesHtml(u) {
    if (!u) return '';
    let html = '';
    if (u.role === 'admin') html += '<svg class="badge-icon badge-crown-admin" viewBox="0 0 24 24" fill="currentColor"><path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5z"/></svg>';
    if (u.role === 'editor') html += '<svg class="badge-icon badge-tick-editor" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3 6.5L22 9.5l-5 4.5L18.5 22 12 18l-6.5 4L7 14 2 9.5l7-1z"/></svg>';
    if (u.tick === 'blue') html += '<svg class="badge-icon badge-tick-blue" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm-1.5 14.5l-4-4L8 11l2.5 2.5L16 8l1.5 1.5-7 7z"/></svg>';
    if (u.tick === 'gold') html += '<svg class="badge-icon badge-tick-gold" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm-1.5 14.5l-4-4L8 11l2.5 2.5L16 8l1.5 1.5-7 7z"/></svg>';
    return html ? '<span class="name-badge">' + html + '</span>' : '';
}

function updateAuthUI() {
    const u = S.user;
    const loginBtn = $('#loginBtn'), userBtn = $('#userBtn');
    const navAvatar = $('#navAvatar');
    const drawerUser = $('#drawerUser'), drawerAvatar = $('#drawerAvatar');
    const drawerName = $('#drawerName'), drawerUsername = $('#drawerUsername');
    const drawerLoginBtn = $('#drawerLoginBtn'), drawerNewPost = $('#drawerNewPost');
    const drawerAdminBtn = $('#drawerAdminBtn'), drawerEditorBtn = $('#drawerEditorBtn');
    const drawerAuthorBtn = $('#drawerAuthorBtn');
    const heroNewPost = $('#heroNewPost'), createGroupBtn = $('#createGroupBtn');

    if (!loginBtn || !userBtn) return;

    if (u) {
        loginBtn.hidden = true;
        userBtn.hidden = false;
        const initial = ini(u.displayName, 'U');
        if (navAvatar) navAvatar.innerHTML = u.avatar ? '<img src="' + u.avatar + '" alt="">' : initial;
        if (drawerUser) drawerUser.hidden = false;
        if (drawerAvatar) drawerAvatar.innerHTML = u.avatar ? '<img src="' + u.avatar + '" alt="">' : initial;
        if (drawerName) drawerName.innerHTML = esc(u.displayName) + badgesHtml(u);
        if (drawerUsername) drawerUsername.textContent = '@' + u.username;
        if (drawerLoginBtn) drawerLoginBtn.hidden = true;

        const canPost = u.role === 'admin' || u.role === 'editor' || u.role === 'author';
        if (drawerNewPost) drawerNewPost.hidden = !canPost;
        if (heroNewPost) heroNewPost.hidden = !canPost;
        if (createGroupBtn) createGroupBtn.hidden = u.role !== 'admin';
        if (drawerAdminBtn) drawerAdminBtn.hidden = u.role !== 'admin';
        if (drawerEditorBtn) drawerEditorBtn.hidden = !(u.role === 'admin' || u.role === 'editor');
        if (drawerAuthorBtn) drawerAuthorBtn.hidden = !(u.role === 'admin' || u.role === 'editor' || u.role === 'author');
    } else {
        loginBtn.hidden = false;
        userBtn.hidden = true;
        if (drawerUser) drawerUser.hidden = true;
        if (drawerLoginBtn) drawerLoginBtn.hidden = false;
        if (drawerNewPost) drawerNewPost.hidden = true;
        if (heroNewPost) heroNewPost.hidden = true;
        if (createGroupBtn) createGroupBtn.hidden = true;
        if (drawerAdminBtn) drawerAdminBtn.hidden = true;
        if (drawerEditorBtn) drawerEditorBtn.hidden = true;
        if (drawerAuthorBtn) drawerAuthorBtn.hidden = true;
    }
    updateBadges();
    /* بعد از ورود، بنر را دوباره ارزیابی کن */
    renderBroadcast();
}

function updateBadges() {
    if (!S.user) return;
    const notifs = DB.getNotifs().filter(n => n.userId === S.user.id && !n.read);
    const msgs = DB.getPM().filter(m => m.to === S.user.id && !m.read);
    const reqs = (S.user.friendRequests || []).length;
    const counts = {
        notif: notifs.length,
        msg: msgs.length,
        friend: S.user.friendsCount != null ? S.user.friendsCount : (S.user.friends || []).length,
        group: (S.user.groups || []).length
    };
    $$('[data-badge]').forEach(el => {
        const n = counts[el.dataset.badge] || 0;
        el.hidden = n === 0;
        el.textContent = faNum(n);
    });
    const navDot = $('#navNotifDot');
    if (navDot) navDot.hidden = (notifs.length === 0 && msgs.length === 0 && reqs === 0);
}

async function logoutUser() {
    try { await API.post('/api/logout'); } catch (e) { /* ignore */ }
    store.del('nova.draft.content'); store.del('nova.draft.title'); store.del('nova.draft.ts');
    S.user = null; ST.me = null;
    try { await sync(); } catch (e) {}
    closeEvents(); connectEvents();
    updateAuthUI();
    closeUserPanel();
    toast('خارج شدی');
    if (['pm', 'groups', 'group'].includes(S.page)) showPage('home'); else rerenderCurrent();
}

/* ══════════════════════════════════════════════════════════════
   ۸. Blocks
   ══════════════════════════════════════════════════════════════ */
function isBlocked(ownerId, targetId) {
    const b = DB.getBlocks();
    return !!(b[ownerId] && b[ownerId].indexOf(targetId) > -1);
}
function hasBlockedMe(meId, otherId) { return isBlocked(otherId, meId); }
async function blockUser(tid) {
    if (!S.user || tid === S.user.id) return false;
    const ok = await act(() => API.post('/api/blocks/' + tid), ['private', 'users']);
    if (ok) toast('بلاک شد');
    return !!ok;
}
async function unblockUser(tid) {
    if (!S.user) return false;
    const ok = await act(() => API.del('/api/blocks/' + tid), ['private']);
    if (ok) toast('رفع بلاک شد');
    return !!ok;
}

/* ══════════════════════════════════════════════════════════════
   ۹. Router
   ══════════════════════════════════════════════════════════════ */
function showPage(page, data) {
    S.upTarget = null;
    if (page === 'profile') S.profileTab = 'about';
    $$('.page').forEach(p => p.classList.remove('active'));
    const el = document.getElementById('page-' + page);
    if (el) el.classList.add('active');
    S.page = page;
    S.pageData = data || null;
    window.scrollTo(0, 0);

    const titles = {
        home: 'نووا گیم', post: 'پست', groups: 'گروه‌ها', group: 'چت',
        pm: 'پیام‌ها', users: 'کاربران', activity: 'فعالیت‌ها',
        about: 'درباره ما', cinema: 'سینما', games: 'بازی', profile: 'پروفایل'
    };
    document.title = (titles[page] || 'نووا گیم') + ' | Nova Game';

    if (page === 'home') renderHome();
    if (page === 'post') renderPostPage(data, true);
    if (page === 'groups') renderGroupsPage();
    S.groupAll = null;
    if (page === 'group') openGroupPage(data);
    if (page === 'pm') { renderPMPage(); markActivePMRead(); }
    if (page === 'users') renderUsersPage();
    if (page === 'activity') renderActivityPage();
    if (page === 'profile') renderProfilePage(data);
}

/* ══════════════════════════════════════════════════════════════
   ۱۰. Home
   ══════════════════════════════════════════════════════════════ */
function renderHome() {
    renderPosts();
    renderTrending();
    renderHomeGroups();
}

function getFilteredPosts() {
    let posts = DB.getPosts().filter(p => p.status === 'published');
    if (S.postFilter === 'editor') posts = posts.filter(p => p.editorChoice === true);
    else if (S.postFilter === 'discussed') posts.sort((a, b) => ((b.comments || []).length) - ((a.comments || []).length));
    else if (S.postFilter === 'popular') posts.sort((a, b) => (b.views || 0) - (a.views || 0));
    else posts.sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return b.createdAt - a.createdAt;
    });
    return posts;
}

function renderPosts() {
    const grid = $('#postsGrid');
    if (!grid) return;
    const posts = getFilteredPosts();
    if (!posts.length) {
        grid.innerHTML = '<div class="empty-state"><h3>هنوز پستی نیست</h3><p>وقتی اولین پست منتشر بشه، اینجا نشون داده می‌شه</p></div>';
        return;
    }
    grid.innerHTML = '';
    posts.slice(0, 9).forEach(p => grid.appendChild(createPostCard(p)));
}

function createPostCard(post) {
    const card = document.createElement('article');
    card.className = 'post-card';
    const catLabel = { news: 'خبر', review: 'نقد', guide: 'راهنما', cinema: 'سینما', game: 'بازی' }[post.category] || 'خبر';
    const coverHtml = post.cover ? '<img src="' + post.cover + '" alt="" loading="lazy" decoding="async">' : '';
    const pinHtml = post.pinned ? '<span class="post-card-pin">پین</span>' : '';
    card.innerHTML =
        '<div class="post-card-cover" style="' + (post.cover ? '' : 'background:linear-gradient(135deg,var(--accent),var(--accent-2));') + '">' +
            coverHtml + '<span class="post-card-badge">' + catLabel + '</span>' + pinHtml +
        '</div>' +
        '<div class="post-card-body">' +
            '<h3 class="post-card-title">' + esc(post.title) + '</h3>' +
            '<p class="post-card-excerpt">' + esc(post.excerpt || stripHtml(post.content).slice(0, 120)) + '</p>' +
            '<div class="post-card-meta">' +
                '<span>' + timeAgo(post.createdAt) + '</span><span>·</span>' +
                '<span>' + faNum(post.views || 0) + ' بازدید</span>' +
            '</div>' +
        '</div>';
    card.addEventListener('click', () => showPage('post', post.id));
    return card;
}

function renderTrending() {
    const grid = $('#trendingGrid');
    if (!grid) return;
    let posts = DB.getPosts().filter(p => p.status === 'published');
    const now = Date.now();
    const ranges = { day: 86400000, week: 604800000, month: 2592000000 };
    const range = ranges[S.timeFilter] || ranges.day;
    posts = posts.filter(p => (now - p.createdAt) < range);
    posts.sort((a, b) => (b.views || 0) - (a.views || 0));
    if (!posts.length) {
        grid.innerHTML = '<div class="empty-state"><h3>چیزی برای نمایش نیست</h3></div>';
        return;
    }
    grid.innerHTML = '';
    posts.slice(0, 6).forEach(p => grid.appendChild(createPostCard(p)));
}

function renderHomeGroups() {
    const grid = $('#homeGroupsGrid');
    if (!grid) return;
    const groups = DB.getGroups().filter(g => g.type === 'public').slice(0, 3);
    if (!groups.length) {
        grid.innerHTML = '<div class="empty-state"><h3>هنوز گروهی نیست</h3></div>';
        return;
    }
    grid.innerHTML = '';
    groups.forEach(g => grid.appendChild(createGroupCard(g)));
}

/* ══════════════════════════════════════════════════════════════
   ۱۱. Post Page
   ══════════════════════════════════════════════════════════════ */
function renderPostPage(postId, isNewVisit) {
    const box = $('#postContent');
    if (!box) return;

    const scrollY = window.scrollY;
    const prevDraft = ($('#commentEditor') || {}).innerHTML || '';
    const wasPostPage = S.page === 'post';

    const posts = DB.getPosts();
    const post = posts.find(p => p.id === postId);
    if (!post) {
        box.innerHTML = '<div class="empty-state"><h3>پست پیدا نشد</h3></div>';
        return;
    }

    if (isNewVisit && !_sessionViews.has(postId)) {
        _sessionViews.add(postId);
        API.post('/api/posts/' + postId + '/view').then(r => {
            if (r && r.counted) { post.views = r.views; const el = $('#postViews'); if (el) el.textContent = faNum(r.views); }
        }).catch(() => {});
    }

    const author = getUserById(post.authorId);
    const catLabel = { news: 'خبر', review: 'نقد', guide: 'راهنما', cinema: 'سینما', game: 'بازی' }[post.category] || 'خبر';
    const coverHtml = post.cover ? '<div class="post-page-cover"><img src="' + post.cover + '" alt="" loading="lazy" decoding="async"></div>' : '';
    const editedHtml = post.edited ? '<span class="edited-tag">(ویرایش‌شده)</span>' : '';
    const canEdit = S.user && (S.user.id === post.authorId || S.user.role === 'admin' || S.user.role === 'editor');
    const canDelete = S.user && (S.user.id === post.authorId || S.user.role === 'admin');

    let actionsHtml = '';
    if (canEdit || canDelete) {
        actionsHtml = '<div class="post-page-actions">';
        if (canEdit) actionsHtml += '<button class="btn-ghost small" id="editPostBtn" type="button">ویرایش پست</button>';
        if (canDelete) actionsHtml += '<button class="btn-ghost small danger" id="deletePostBtn" type="button">حذف پست</button>';
        actionsHtml += '</div>';
    }

    const metaCat = catLabel + (post.score ? ' · ' + faNum(post.score) + '/۱۰' : '') + (post.editorChoice ? ' · انتخاب سردبیر' : '');

    let commentFormHtml = '';
    if (S.user) {
        commentFormHtml =
            '<div class="comment-form">' +
                '<div class="comment-editor" id="commentEditor" contenteditable="true" data-placeholder="نظرت رو بنویس"></div>' +
                '<div class="comment-toolbar">' +
                    '<button type="button" data-cmd="bold"><b>B</b></button>' +
                    '<button type="button" data-cmd="italic"><i>I</i></button>' +
                    '<button type="button" data-cmd="underline"><u>U</u></button>' +
                    '<span class="sep"></span>' +
                    '<button type="button" id="btnSpoiler">اسپویلر</button>' +
                    '<button type="button" id="btnMention">@</button>' +
                    '<button type="button" id="btnColorPicker">رنگ</button>' +
                    '<button type="button" id="btnRainbow">رقص نور</button>' +
                '</div>' +
                '<div class="color-picker" id="colorPicker" hidden>' +
                    '<input type="color" id="customColor">' +
                    '<div class="color-dot" style="background:#c9635d" data-color="#c9635d"></div>' +
                    '<div class="color-dot" style="background:#d99073" data-color="#d99073"></div>' +
                    '<div class="color-dot" style="background:#6b9b7a" data-color="#6b9b7a"></div>' +
                    '<div class="color-dot" style="background:#5b6eae" data-color="#5b6eae"></div>' +
                    '<div class="color-dot" style="background:#8b7eb8" data-color="#8b7eb8"></div>' +
                    '<div class="color-dot" style="background:#b0a4d4" data-color="#b0a4d4"></div>' +
                '</div>' +
                '<div class="comment-actions">' +
                    '<small style="font-size:11px;color:var(--tx-mute);"><span id="charCount">۰</span> کاراکتر</small>' +
                    '<button class="btn-primary small" id="submitComment" type="button">ارسال</button>' +
                '</div>' +
            '</div>';
    } else {
        commentFormHtml =
            '<div class="comment-form" style="text-align:center;padding:24px;">' +
                '<p style="font-size:13px;color:var(--tx-mute);margin-bottom:10px;">برای کامنت گذاشتن اول وارد شو</p>' +
                '<button class="btn-primary small" id="loginToComment" type="button">ورود</button>' +
            '</div>';
    }

    let comments = post.comments || [];
    if (S.user) comments = comments.filter(c => !isBlocked(S.user.id, c.userId));
    comments = comments.filter(c => c.status !== 'pending' ||
        (S.user && (c.userId === S.user.id || S.user.role === 'admin')));

    const commentsHtml = comments.length
        ? comments.map(c => renderComment(c, post.id, 0)).join('')
        : '<p style="text-align:center;color:var(--tx-mute);padding:20px;font-size:13px;">هنوز نظری نیست. اولین نفر باش</p>';

    box.innerHTML = coverHtml +
        '<div class="post-page-header">' +
            '<span class="post-page-cat">' + metaCat + '</span>' +
            '<h1 class="post-page-title">' + esc(post.title) + '</h1>' +
            '<div class="post-page-meta">' +
                '<div class="author">' +
                    '<div class="user-avatar">' + (post.authorAvatar ? '<img src="' + post.authorAvatar + '" alt="">' : (ini(post.authorName, 'N'))) + '</div>' +
                    '<strong>' + esc(post.authorName || 'ناشناس') + '</strong>' + (author ? badgesHtml(author) : '') +
                '</div>' +
                '<span>·</span><span>' + timeAgo(post.createdAt) + ' ' + editedHtml + '</span>' +
                '<span>·</span><span>' + faNum(post.views) + ' بازدید</span>' +
            '</div>' + actionsHtml +
        '</div>' +
        '<div class="post-page-body">' + post.content + '</div>' +
        '<div class="comments-section">' +
            '<div class="comments-head"><h3>نظرات <span>(' + faNum(comments.length) + ')</span></h3></div>' +
            commentFormHtml +
            '<div class="comment-list" id="commentList">' + commentsHtml + '</div>' +
        '</div>';

    initCommentEditor(post.id);

    const editBtn = $('#editPostBtn');
    if (editBtn) editBtn.addEventListener('click', () => openEditor(post.id));
    const delBtn = $('#deletePostBtn');
    if (delBtn) delBtn.addEventListener('click', () => {
        if (!confirm('پست حذف بشه؟')) return;
        act(() => API.del('/api/posts/' + post.id), ['posts']).then(ok => { if (ok) { toast('حذف شد'); showPage('home'); } });
    });

    /* بازیابی draft و اسکرول */
    const newEditor = $('#commentEditor');
    if (newEditor && prevDraft && wasPostPage) {
        newEditor.innerHTML = prevDraft;
        const cc = $('#charCount');
        if (cc) cc.textContent = faNum(newEditor.textContent.length);
    }

    /* انیمیشن پاک کردن will-change بعد از اجرا */
    box.querySelectorAll('.edited-tag').forEach(tag => {
        tag.addEventListener('animationend', () => tag.classList.add('animated'), { once: true });
    });
}

function renderComment(comment, postId, level) {
    const user = getUserById(comment.userId);
    const name = user ? user.displayName : (comment.userName || 'ناشناس');
    const avatar = user ? user.avatar : comment.userAvatar;
    const initial = ini(name);
    const likes = comment.likes || [];
    const dislikes = comment.dislikes || [];
    const userLiked = S.user && likes.indexOf(S.user.id) > -1;
    const userDisliked = S.user && dislikes.indexOf(S.user.id) > -1;

    let reactionsHtml = '';
    if (likes.length || dislikes.length) {
        const users = DB.getUsers();
        let avatars = '';
        likes.slice(0, 5).forEach(lid => {
            const lu = users.find(u => u.id === lid);
            if (lu) {
                const init = ini(lu.displayName, 'U');
                avatars += '<div class="reaction-avatar" title="' + esc(lu.displayName) + '">' +
                    (lu.avatar ? '<img src="' + lu.avatar + '" alt="">' : init) + '</div>';
            }
        });
        reactionsHtml = '<div class="reactions-list">' + avatars +
            (likes.length > 5 ? '<span class="reaction-count">+' + faNum(likes.length - 5) + '</span>' : '') +
            (likes.length ? '<span class="reaction-count">' + faNum(likes.length) + ' لایک</span>' : '') +
            '</div>';
    }

    const age = (Date.now() - comment.createdAt) / 1000;
    const editLimit = (user && user.tick === 'gold') ? Infinity : 120;
    const canEdit = S.user && S.user.id === comment.userId && age < editLimit;
    const canDelete = S.user && (S.user.id === comment.userId || S.user.role === 'admin');

    const pendingBadge = comment.status === 'pending' ? '<span class="comment-pending-badge">در انتظار تأیید</span>' : '';
    const editedTag = comment.edited ? '<span class="edited-tag">(ویرایش‌شده)</span>' : '';

    let repliesHtml = '';
    if (comment.replies && comment.replies.length && level < 5) {
        repliesHtml = '<div class="comment-replies">' +
            comment.replies.filter(r => !(S.user && isBlocked(S.user.id, r.userId))).map(r => renderComment(r, postId, level + 1)).join('') + '</div>';
    }

    return '<div class="comment-item ' + (comment.status === 'pending' ? 'pending' : '') + '" data-comment-id="' + comment.id + '">' +
        '<div class="comment-item-header">' +
            '<div class="user-avatar">' + (avatar ? '<img src="' + avatar + '" alt="">' : initial) + '</div>' +
            '<div class="user-name">' +
                '<strong>' + esc(name) + (user ? badgesHtml(user) : '') + '</strong>' +
                '<small>@' + esc(user ? user.username : 'user') + '</small>' +
            '</div>' +
            '<span class="time">' + timeAgo(comment.createdAt) + ' ' + editedTag + '</span>' + pendingBadge +
        '</div>' +
        '<div class="comment-item-body">' + comment.content + '</div>' +
        '<div class="comment-item-footer">' +
            '<button class="comment-btn ' + (userLiked ? 'liked' : '') + '" data-like="' + comment.id + '" type="button">' + ICON.thumbUp + ' ' + faNum(likes.length) + '</button>' +
            '<button class="comment-btn ' + (userDisliked ? 'disliked' : '') + '" data-dislike="' + comment.id + '" type="button">' + ICON.thumbDown + ' ' + faNum(dislikes.length) + '</button>' +
            (level < 5 ? '<button class="comment-btn" data-reply="' + comment.id + '" type="button">پاسخ</button>' : '') +
            (canEdit ? '<button class="comment-btn" data-edit-comment="' + comment.id + '" type="button">ویرایش</button>' : '') +
            (canDelete ? '<button class="comment-btn" data-delete="' + comment.id + '" type="button">حذف</button>' : '') +
        '</div>' + reactionsHtml + repliesHtml +
    '</div>';
}

function findComment(list, id) {
    for (let i = 0; i < list.length; i++) {
        if (list[i].id === id) return list[i];
        if (list[i].replies && list[i].replies.length) {
            const f = findComment(list[i].replies, id);
            if (f) return f;
        }
    }
    return null;
}

function initCommentEditor(postId) {
    const editor = $('#commentEditor');
    if (!editor) {
        const lb = $('#loginToComment');
        if (lb) lb.addEventListener('click', () => openModal('authOverlay'));
        return;
    }

    /* ZWSP cleanup روی beforeinput — تمیزکاری قبل از تایپ */
    editor.addEventListener('beforeinput', () => {
        const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
        const toRemove = [];
        let n;
        while ((n = walker.nextNode())) {
            if (n.textContent === '\u200B') toRemove.push(n);
        }
        toRemove.forEach(node => {
            if (node.parentNode && document.activeElement === editor) {
                try { node.parentNode.removeChild(node); } catch (e) {}
            }
        });
    });

    $$('.comment-toolbar button[data-cmd]').forEach(btn => {
        btn.addEventListener('mousedown', e => e.preventDefault());
        btn.addEventListener('click', e => {
            e.preventDefault();
            const cmd = btn.dataset.cmd;
            if (cmd === 'bold') Ed.bold();
            else if (cmd === 'italic') Ed.italic();
            else if (cmd === 'underline') Ed.underline();
            editor.focus();
        });
    });

    const bS = $('#btnSpoiler');
    if (bS) {
        bS.addEventListener('mousedown', e => e.preventDefault());
        bS.addEventListener('click', e => { e.preventDefault(); Ed.spoiler(); editor.focus(); });
    }

    const bM = $('#btnMention');
    if (bM) {
        bM.addEventListener('mousedown', e => e.preventDefault());
        bM.addEventListener('click', e => {
            e.preventDefault();
            const users = DB.getUsers().slice(0, 10).map(u => u.username).join('، ');
            const u = prompt('نام کاربری:\n' + users);
            if (u) {
                const span = document.createElement('span');
                span.className = 'mention';
                span.setAttribute('data-username', u.toLowerCase());
                span.textContent = '@' + u + ' ';
                const sel = window.getSelection();
                if (sel && sel.rangeCount) sel.getRangeAt(0).insertNode(span);
            }
            editor.focus();
        });
    }

    const bCP = $('#btnColorPicker');
    if (bCP) {
        bCP.addEventListener('mousedown', e => e.preventDefault());
        bCP.addEventListener('click', e => {
            e.preventDefault();
            const cp = $('#colorPicker');
            if (cp) cp.hidden = !cp.hidden;
        });
    }

    const cc = $('#customColor');
    if (cc) {
        cc.addEventListener('mousedown', e => e.preventDefault());
        cc.addEventListener('input', () => Ed.color(cc.value));
    }

    $$('#colorPicker .color-dot').forEach(dot => {
        dot.addEventListener('mousedown', e => e.preventDefault());
        dot.addEventListener('click', e => {
            e.preventDefault();
            Ed.color(dot.dataset.color);
            const cp = $('#colorPicker');
            if (cp) cp.hidden = true;
            editor.focus();
        });
    });

    const bR = $('#btnRainbow');
    if (bR) {
        bR.addEventListener('mousedown', e => e.preventDefault());
        bR.addEventListener('click', e => { e.preventDefault(); Ed.rainbow(); editor.focus(); });
    }

    editor.addEventListener('input', () => {
        const charCount = $('#charCount');
        if (charCount) charCount.textContent = faNum(editor.textContent.length);
    });

    const submitBtn = $('#submitComment');
    if (submitBtn) submitBtn.addEventListener('click', () => {
        const content = editor.innerHTML.trim();
        if (!content || editor.textContent.trim().length < 2) { toast('نظرت خیلی کوتاهه'); return; }
        addComment(postId, content);
    });

    const list = $('#commentList');
    if (list) {
        list.addEventListener('click', e => {
            const like = e.target.closest('[data-like]');
            const dislike = e.target.closest('[data-dislike]');
            const reply = e.target.closest('[data-reply]');
            const del = e.target.closest('[data-delete]');
            const editBtn = e.target.closest('[data-edit-comment]');
            if (like) toggleCommentReaction(postId, like.dataset.like, 'like');
            if (dislike) toggleCommentReaction(postId, dislike.dataset.dislike, 'dislike');
            if (reply) openReplyModal({ mode: 'reply', postId, commentId: reply.dataset.reply });
            if (editBtn) openReplyModal({ mode: 'edit-comment', postId, commentId: editBtn.dataset.editComment });
            if (del && confirm('حذف بشه؟')) deleteComment(postId, del.dataset.delete);
        });
    }
}

async function addComment(postId, content) {
    if (!S.user) { toast('اول وارد شو'); return false; }
    if (S._cmtBusy) return false;
    S._cmtBusy = true;
    try {
        const r = await act(() => API.post('/api/posts/' + postId + '/comments', { content }), ['posts', 'activity']);
        if (!r) return false;
        const ed = $('#commentEditor'); if (ed) ed.innerHTML = '';
        const cc = $('#charCount'); if (cc) cc.textContent = '۰';
        toast(r.status === 'pending' ? 'نظرت ثبت شد و بعد از تأیید مدیر برای همه دیده می‌شه' : 'نظرت ثبت شد');
        renderPostPage(postId);
        return true;
    } finally { S._cmtBusy = false; }
}

async function toggleCommentReaction(postId, commentId, type) {
    if (!S.user) { toast('اول وارد شو'); return false; }
    const ok = await act(() => API.post('/api/posts/' + postId + '/comments/' + commentId + '/react', { type }), ['posts']);
    if (ok) renderPostPage(postId);
    return !!ok;
}

async function updateCommentContent(postId, commentId, newHtml) {
    const ok = await act(() => API.patch('/api/posts/' + postId + '/comments/' + commentId, { content: newHtml }), ['posts']);
    if (ok) renderPostPage(postId);
    return !!ok;
}

async function addReplyToComment(postId, commentId, text) {
    if (!S.user) return false;
    const ok = await act(() => API.post('/api/posts/' + postId + '/comments/' + commentId + '/replies', { content: text }), ['posts']);
    if (ok) renderPostPage(postId);
    return !!ok;
}

async function deleteComment(postId, commentId) {
    const ok = await act(() => API.del('/api/posts/' + postId + '/comments/' + commentId), ['posts']);
    if (ok) { renderPostPage(postId); toast('حذف شد'); }
    return !!ok;
}

/* ══════════════════════════════════════════════════════════════
   ۱۲. Reply Modal
   ══════════════════════════════════════════════════════════════ */
function openReplyModal(ctx) {
    if (!S.user) { toast('اول وارد شو'); return; }
    S.replyContext = ctx;
    const modal = $('#replyModal');
    if (!modal) return;

    const titleEl = $('#replyModalTitle');
    const quotedEl = $('#replyModalQuoted');
    const editor = $('#replyModalEditor');

    if (ctx.mode === 'edit-comment') {
        if (titleEl) titleEl.textContent = 'ویرایش نظر';
        const post = DB.getPosts().find(p => p.id === ctx.postId);
        const c = findComment(post ? post.comments || [] : [], ctx.commentId);
        if (editor) editor.innerHTML = c ? c.content : '';
        if (quotedEl) quotedEl.hidden = true;
    } else if (ctx.mode === 'edit-message') {
        if (titleEl) titleEl.textContent = 'ویرایش پیام';
        const g = DB.getGroups().find(x => x.id === ctx.groupId);
        const m = g ? (ST.gmsgs[g.id] || []).find(mm => mm.id === ctx.messageId) : null;
        if (editor) editor.innerHTML = m ? m.content : '';
        if (quotedEl) quotedEl.hidden = true;
    } else if (ctx.mode === 'edit-reply') {
        if (titleEl) titleEl.textContent = 'ویرایش پاسخ';
        const g = DB.getGroups().find(x => x.id === ctx.groupId);
        const r = g ? findReplyInGroup(g, ctx.replyId) : null;
        if (editor) editor.innerHTML = r ? r.content : '';
        if (quotedEl) quotedEl.hidden = true;
    } else if (ctx.mode === 'reply') {
        if (titleEl) titleEl.textContent = 'پاسخ';
        const post = DB.getPosts().find(p => p.id === ctx.postId);
        const c = findComment(post ? post.comments || [] : [], ctx.commentId);
        if (quotedEl && c) {
            const u = getUserById(c.userId);
            quotedEl.innerHTML = '<strong>' + esc(u ? u.displayName : (c.userName || 'کاربر')) + '</strong>' +
                stripHtml(c.content).slice(0, 140);
            quotedEl.hidden = false;
        }
        if (editor) editor.innerHTML = '';
    } else if (ctx.mode === 'reply-message') {
        if (titleEl) titleEl.textContent = 'پاسخ';
        const g = DB.getGroups().find(x => x.id === ctx.groupId);
        const m = g ? (ST.gmsgs[g.id] || []).find(mm => mm.id === ctx.messageId) : null;
        if (quotedEl && m) {
            const u = getUserById(m.userId);
            quotedEl.innerHTML = '<strong>' + esc(u ? u.displayName : (m.userName || 'کاربر')) + '</strong>' +
                stripHtml(m.content || 'پیام تصویری').slice(0, 140);
            quotedEl.hidden = false;
        }
        if (editor) editor.innerHTML = '';
    } else if (ctx.mode === 'reply-reply') {
        if (titleEl) titleEl.textContent = 'پاسخ به پاسخ';
        const g = DB.getGroups().find(x => x.id === ctx.groupId);
        const r = g ? findReplyInGroup(g, ctx.replyId) : null;
        if (quotedEl && r) {
            const u = getUserById(r.userId);
            quotedEl.innerHTML = '<strong>' + esc(u ? u.displayName : (r.userName || 'کاربر')) + '</strong>' +
                stripHtml(r.content).slice(0, 140);
            quotedEl.hidden = false;
        }
        if (editor) editor.innerHTML = '';
    } else if (ctx.mode === 'activity-comment') {
        if (titleEl) titleEl.textContent = 'نظر';
        if (quotedEl) quotedEl.hidden = true;
        if (editor) editor.innerHTML = '';
    } else if (ctx.mode === 'activity-reply') {
        if (titleEl) titleEl.textContent = 'پاسخ';
        if (quotedEl) quotedEl.hidden = true;
        if (editor) editor.innerHTML = '';
    }

    modal.hidden = false;
    requestAnimationFrame(() => {
        modal.classList.add('on');
        if (editor) {
            editor.focus();
            const r = document.createRange();
            r.selectNodeContents(editor);
            r.collapse(false);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(r);
        }
    });
    document.body.classList.add('locked');
}

function closeReplyModal() {
    const modal = $('#replyModal');
    if (!modal) return;
    modal.classList.remove('on');
    setTimeout(() => {
        modal.hidden = true;
        if (!document.querySelector('.modal-overlay.on') &&
            !document.querySelector('.side-modal:not([hidden])') &&
            !document.querySelector('.user-panel.on')) {
            document.body.classList.remove('locked');
        }
    }, 220);
    S.replyContext = null;
}

async function submitReplyModal() {
    if (S._submitting) return;
    const editor = $('#replyModalEditor');
    if (!editor || !S.replyContext) return;
    const html = editor.innerHTML.trim();
    if (!html || editor.textContent.trim().length < 1) { toast('متن خالیه'); return; }

    S._submitting = true;
    const ctx = S.replyContext;
    let ok = false;
    try {
        if (ctx.mode === 'reply') ok = await addReplyToComment(ctx.postId, ctx.commentId, html);
        else if (ctx.mode === 'edit-comment') ok = await updateCommentContent(ctx.postId, ctx.commentId, html);
        else if (ctx.mode === 'reply-message') ok = await addReplyToMessage(ctx.groupId, ctx.messageId, html);
        else if (ctx.mode === 'edit-message') ok = await updateMessageContent(ctx.groupId, ctx.messageId, html);
        else if (ctx.mode === 'reply-reply') ok = await addReplyToReply(ctx.groupId, ctx.replyId, html);
        else if (ctx.mode === 'edit-reply') ok = await updateReplyContent(ctx.groupId, ctx.replyId, html);
        else if (ctx.mode === 'activity-comment') ok = await submitActivityComment(ctx.activityId, html);
        else if (ctx.mode === 'activity-reply') ok = await submitActivityReply(ctx.commentId, html);
    } finally { S._submitting = false; }
    if (ok) { closeReplyModal(); toast('ثبت شد'); }
}

function initReplyModal() {
    const modal = $('#replyModal');
    if (!modal) return;
    const editor = $('#replyModalEditor');

    $$('.reply-modal-toolbar button[data-reply-cmd]').forEach(btn => {
        btn.addEventListener('mousedown', e => e.preventDefault());
        btn.addEventListener('click', e => {
            e.preventDefault();
            const cmd = btn.dataset.replyCmd;
            if (cmd === 'bold') Ed.bold();
            else if (cmd === 'italic') Ed.italic();
            else if (cmd === 'underline') Ed.underline();
            editor.focus();
        });
    });

    const sp = $('#replySpoiler');
    if (sp) {
        sp.addEventListener('mousedown', e => e.preventDefault());
        sp.addEventListener('click', e => { e.preventDefault(); Ed.spoiler(); editor.focus(); });
    }

    const rb = $('#replyRainbow');
    if (rb) {
        rb.addEventListener('mousedown', e => e.preventDefault());
        rb.addEventListener('click', e => { e.preventDefault(); Ed.rainbow(); editor.focus(); });
    }

    const cb = $('#replyColorBtn');
    if (cb) {
        cb.addEventListener('mousedown', e => e.preventDefault());
        cb.addEventListener('click', e => {
            e.preventDefault();
            const p = $('#replyColorPicker');
            if (p) p.hidden = !p.hidden;
        });
    }

    const cc = $('#replyCustomColor');
    if (cc) {
        cc.addEventListener('mousedown', e => e.preventDefault());
        cc.addEventListener('input', () => Ed.color(cc.value));
    }

    $$('#replyColorPicker .color-dot').forEach(dot => {
        dot.addEventListener('mousedown', e => e.preventDefault());
        dot.addEventListener('click', e => {
            e.preventDefault();
            Ed.color(dot.dataset.color);
            const p = $('#replyColorPicker');
            if (p) p.hidden = true;
            editor.focus();
        });
    });

    const mb = $('#replyMention');
    if (mb) {
        mb.addEventListener('mousedown', e => e.preventDefault());
        mb.addEventListener('click', e => {
            e.preventDefault();
            const u = prompt('نام کاربری برای منشن:');
            if (u) {
                const span = document.createElement('span');
                span.className = 'mention';
                span.setAttribute('data-username', u.toLowerCase());
                span.textContent = '@' + u + ' ';
                const sel = window.getSelection();
                if (sel && sel.rangeCount) sel.getRangeAt(0).insertNode(span);
                editor.focus();
            }
        });
    }

    const send = $('#replyModalSend');
    if (send) send.addEventListener('click', submitReplyModal);
    const cancel = $('#replyModalCancel');
    if (cancel) cancel.addEventListener('click', closeReplyModal);

    modal.addEventListener('click', e => {
        if (e.target.closest('[data-close="replyModal"]')) closeReplyModal();
    });

    if (editor) editor.addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            submitReplyModal();
        }
    });
}

function findInList(list, id) {
    for (let i = 0; i < list.length; i++) {
        if (list[i].id === id) return list[i];
        if (list[i].replies && list[i].replies.length) {
            const f = findInList(list[i].replies, id);
            if (f) return f;
        }
    }
    return null;
}

/* FIX: پیدا کردن یک reply در کل گروه (نه فقط پیام‌های top-level) */
function findReplyInGroup(group, replyId) {
    for (const m of (ST.gmsgs[group.id] || [])) {
        const r = findInList(m.replies || [], replyId);
        if (r) return r;
    }
    return null;
}

/* ══════════════════════════════════════════════════════════════
   ۱۳. Activity
   ══════════════════════════════════════════════════════════════ */
function renderActivityPage() {
    const list = $('#activityList');
    if (!list) return;
    const activities = DB.getActivity().slice().reverse();
    if (!activities.length) {
        list.innerHTML = '<div class="empty-state"><h3>هنوز فعالیتی نیست</h3></div>';
        return;
    }

    const icons = { post: 'پ', comment: 'ن', chat: 'چ', like: 'ل', friend: 'د', group: 'گ' };
    const likes = DB.getActivityLikes();
    const comments = DB.getActivityComments();

    list.innerHTML = '';
    activities.forEach(a => {
        const item = document.createElement('div');
        item.className = 'activity-item';
        item.dataset.activityId = a.id;

        const likeUsers = likes[a.id] || [];
        const userLiked = S.user && likeUsers.indexOf(S.user.id) > -1;
        const activityComments = comments.filter(c => c.activityId === a.id);
        const actor = a.userId ? getUserById(a.userId) : null;

        let userLine = '';
        if (actor) {
            const init = ini(actor.displayName, 'U');
            userLine = '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">' +
                '<div class="user-avatar" style="width:28px;height:28px;font-size:11px;">' +
                    (actor.avatar ? '<img src="' + actor.avatar + '" alt="">' : init) +
                '</div>' +
                '<strong style="font-size:13px;color:var(--tx);">' + esc(actor.displayName) + '</strong>' +
                badgesHtml(actor) +
            '</div>';
        }

        let commentsHtml = '';
        activityComments.forEach(c => {
            const cu = getUserById(c.userId);
            const cin = ini(cu ? cu.displayName : 'ناشناس');
            commentsHtml += '<div class="activity-comment" data-comment-id="' + c.id + '">' +
                '<div class="user-avatar">' + (cu && cu.avatar ? '<img src="' + cu.avatar + '" alt="">' : cin) + '</div>' +
                '<div class="activity-comment-body">' +
                    '<strong>' + esc(cu ? cu.displayName : 'ناشناس') + '</strong>' +
                    '<p>' + c.content + '</p>' +
                    '<div class="meta">' + timeAgo(c.ts) +
                        ' · <button class="activity-reply-btn" data-reply-activity="' + c.id + '" type="button">پاسخ</button>' +
                    '</div>' +
                    renderActivityReplies(c) +
                '</div>' +
            '</div>';
        });

        item.innerHTML =
            userLine +
            '<div class="activity-head">' +
                '<div class="activity-icon">' + (icons[a.type] || '?') + '</div>' +
                '<div class="activity-body">' +
                    '<p>' + esc(a.text) + '</p>' +
                    '<small>' + timeAgo(a.ts) + '</small>' +
                '</div>' +
            '</div>' +
            '<div class="activity-actions">' +
                '<button class="activity-action-btn ' + (userLiked ? 'liked' : '') + '" data-act-like="' + a.id + '" type="button">' +
                    ICON.thumbUp + ' ' + faNum(likeUsers.length) +
                '</button>' +
                '<button class="activity-action-btn" data-act-comment="' + a.id + '" type="button">' +
                    '💬 کامنت ' + faNum(activityComments.length) +
                '</button>' +
            '</div>' +
            (activityComments.length ? '<div class="activity-comments">' + commentsHtml + '</div>' : '');

        list.appendChild(item);
    });

    /* استفاده از addEventListener با flag برای جلوگیری از دوباره‌bind */
    if (list._handler) list.removeEventListener('click', list._handler);
    list._handler = function(e) {
        const like = e.target.closest('[data-act-like]');
        const comment = e.target.closest('[data-act-comment]');
        const replyAct = e.target.closest('[data-reply-activity]');
        if (like) toggleActivityLike(like.dataset.actLike);
        if (comment) addActivityComment(comment.dataset.actComment);
        if (replyAct) replyToActivityComment(replyAct.dataset.replyActivity);
    };
    list.addEventListener('click', list._handler);
}

async function toggleActivityLike(activityId) {
    if (!S.user) { toast('اول وارد شو'); return; }
    const ok = await act(() => API.post('/api/activity/' + activityId + '/like'), ['activity']);
    if (ok) renderActivityPage();
}

function addActivityComment(activityId) {
    if (!S.user) { toast('اول وارد شو'); return; }
    openReplyModal({ mode: 'activity-comment', activityId });
}

function replyToActivityComment(commentId) {
    if (!S.user) { toast('اول وارد شو'); return; }
    openReplyModal({ mode: 'activity-reply', commentId });
}

async function submitActivityComment(activityId, html) {
    const ok = await act(() => API.post('/api/activity/' + activityId + '/comments', { content: html }), ['activity']);
    if (ok) renderActivityPage();
    return !!ok;
}

async function submitActivityReply(commentId, html) {
    const ok = await act(() => API.post('/api/activity-comments/' + commentId + '/replies', { content: html }), ['activity']);
    if (ok) renderActivityPage();
    return !!ok;
}

function renderActivityReplies(comment) {
    if (!comment.replies || !comment.replies.length) return '';
    let html = '<div class="activity-comment-replies">';
    comment.replies.forEach(r => {
        const ru = getUserById(r.userId);
        const rin = ini(ru ? ru.displayName : 'ناشناس');
        html += '<div class="activity-comment-reply">' +
            '<div class="user-avatar">' + (ru && ru.avatar ? '<img src="' + ru.avatar + '" alt="">' : rin) + '</div>' +
            '<div style="flex:1;min-width:0;">' +
                '<strong>' + esc(ru ? ru.displayName : 'ناشناس') + '</strong>' +
                '<p>' + r.content + '</p>' +
                '<div class="meta" style="font-size:10px;color:var(--tx-mute);margin-top:2px;">' + timeAgo(r.ts) + '</div>' +
            '</div>' +
        '</div>';
    });
    html += '</div>';
    return html;
}

/* ══════════════════════════════════════════════════════════════
   ۱۴. Groups
   ══════════════════════════════════════════════════════════════ */
function renderGroupsPage() {
    const grid = $('#groupsGrid');
    if (!grid) return;
    let groups = DB.getGroups();
    if (S.groupFilter === 'public') groups = groups.filter(g => g.type === 'public');
    else if (S.groupFilter === 'private') groups = groups.filter(g => g.type === 'private');
    else if (S.groupFilter === 'mine') {
        if (!S.user) groups = [];
        else groups = groups.filter(g => (S.user.groups || []).indexOf(g.id) > -1);
    }
    if (!groups.length) {
        grid.innerHTML = '<div class="empty-state"><h3>گروهی نیست</h3></div>';
        return;
    }
    grid.innerHTML = '';
    groups.forEach(g => grid.appendChild(createGroupCard(g)));
}

function createGroupCard(group) {
    const card = document.createElement('div');
    card.className = 'group-card';
    const typeLabel = group.type === 'public' ? 'عمومی' : 'خصوصی';
    let coverStyle = 'background:linear-gradient(135deg,var(--accent),var(--accent-2));';
    if (group.cover) coverStyle = "background:url('" + group.cover + "') center/cover;";
    card.innerHTML = '<div class="group-card-cover" style="' + coverStyle + '">' +
            '<span class="group-card-type ' + group.type + '">' + typeLabel + '</span>' +
        '</div>' +
        '<div class="group-card-body">' +
            '<div class="group-card-avatar">' +
                (group.avatar ? '<img src="' + group.avatar + '" alt="">' : ini(group.name, 'G')) +
            '</div>' +
            '<div class="group-card-info">' +
                '<h3>' + esc(group.name) + '</h3>' +
                '<p>' +
                    '<span>' + faNum(group.memberCount) + ' عضو</span>' +
                    '<span>·</span>' +
                    '<span>' + faNum((ST.gmsgs[group.id] || []).length) + ' پیام</span>' +
                '</p>' +
            '</div>' +
        '</div>';
    card.addEventListener('click', () => showPage('group', group.id));
    return card;
}

function renderGroupPage(groupId) {
    const box = $('#groupContent');
    if (!box) return;
    const group = DB.getGroups().find(g => g.id === groupId);
    if (!group) { box.innerHTML = '<div class="empty-state"><h3>گروه پیدا نشد</h3></div>'; return; }

    const u = S.user;
    const myId = u ? u.id : null;
    const isMember = myId && (group.members || []).indexOf(myId) > -1;
    const isOwner = myId && group.ownerId === myId;
    const isAdmin = myId && (group.admins || []).indexOf(myId) > -1;
    const isMod = myId && (group.mods || []).indexOf(myId) > -1;
    const isBanned = myId && (group.banned || []).indexOf(myId) > -1;
    const isSiteAdmin = u && u.role === 'admin';

    if (group.type === 'private' && !isMember && !isOwner && !isAdmin && !isMod && !isSiteAdmin) {
        if (isBanned) { box.innerHTML = '<div class="empty-state"><h3>از این گروه بن شدی</h3></div>'; return; }
        box.innerHTML = '<div class="empty-state">' +
                '<h3>گروه خصوصی</h3><p>برای ورود درخواست بده</p>' +
                '<button class="btn-primary" id="requestJoinBtn" type="button" style="margin-top:14px;">درخواست عضویت</button>' +
            '</div>';
        const rj = $('#requestJoinBtn');
        if (rj) rj.addEventListener('click', () => requestJoinGroup(groupId));
        return;
    }

    const users = DB.getUsers();
    const owner = users.find(x => x.id === group.ownerId);

    let ownerHtml = '';
    if (owner) {
        ownerHtml = '<div class="team-member owner" data-user-id="' + owner.id + '">' +
            '<div class="user-avatar">' + (owner.avatar ? '<img src="' + owner.avatar + '" alt="">' : ini(owner.displayName)) + '</div>' +
            '<svg class="team-role-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5z"/></svg>' +
            '<span class="team-name">' + esc(owner.displayName) + '</span>' +
        '</div>';
    }

    let adminsHtml = '';
    (group.admins || []).forEach(aid => {
        const au = users.find(x => x.id === aid);
        if (!au) return;
        adminsHtml += '<div class="team-member admin" data-user-id="' + au.id + '">' +
            '<div class="user-avatar">' + (au.avatar ? '<img src="' + au.avatar + '" alt="">' : ini(au.displayName)) + '</div>' +
            '<svg class="team-role-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3 6.5L22 9.5l-5 4.5L18.5 22 12 18l-6.5 4L7 14 2 9.5l7-1z"/></svg>' +
            '<span class="team-name">' + esc(au.displayName) + '</span>' +
        '</div>';
    });

    let modsHtml = '';
    (group.mods || []).forEach(mid => {
        const mu = users.find(x => x.id === mid);
        if (!mu) return;
        modsHtml += '<div class="team-member mod" data-user-id="' + mu.id + '">' +
            '<div class="user-avatar">' + (mu.avatar ? '<img src="' + mu.avatar + '" alt="">' : ini(mu.displayName)) + '</div>' +
            '<span class="team-name">' + esc(mu.displayName) + '</span>' +
        '</div>';
    });

    let teamSection = '';
    if (ownerHtml || adminsHtml || modsHtml) {
        teamSection = '<div class="group-team-section">' +
            '<div class="group-team-title">تیم مدیریت</div>' +
            (ownerHtml ? '<div class="team-row">' + ownerHtml + '</div>' : '') +
            (adminsHtml ? '<div class="team-row">' + adminsHtml + '</div>' : '') +
            (modsHtml ? '<div class="team-row">' + modsHtml + '</div>' : '') +
        '</div>';
    }

    let messages = ST.gmsgs[group.id] || [];
    if (myId) messages = messages.filter(m => !isBlocked(myId, m.userId));
    const visible = S.groupAll === groupId ? messages : messages.slice(-20);
    let messagesHtml = '';
    if (messages.length > 20 && S.groupAll !== groupId) messagesHtml += '<button class="chat-load-more" id="loadMoreMsgs" type="button">نمایش پیام‌های قدیمی‌تر</button>';
    messagesHtml += visible.map(m => renderChatMessage(m, group, 0)).join('');
    if (!visible.length) messagesHtml += '<p style="text-align:center;color:var(--tx-mute);padding:30px;font-size:13px;">هنوز پیامی نیست</p>';

    let actionsHtml = '';
    if (isOwner || isAdmin || isMod || isSiteAdmin) {
        actionsHtml += '<button class="btn-ghost small" id="groupSettingsBtn" type="button">تنظیمات گروه</button>';
    }
    if (!isMember && group.type === 'public' && !isBanned) {
        actionsHtml += '<button class="btn-primary small" id="joinGroupBtn" type="button">عضویت در گروه</button>';
    }
    if ((isMember || isOwner || isAdmin || isMod) && !isOwner) {
        actionsHtml += '<button class="btn-ghost small danger" id="leaveGroupBtn" type="button">خروج از گروه</button>';
    }
    if (isBanned) {
        actionsHtml += '<span class="role-badge" style="background:rgba(201,99,93,.15);color:var(--bad);padding:6px 12px;border-radius:100px;font-size:11px;">بن شده</span>';
    }

    let inputHtml = '';
    if (isMember || isOwner || isAdmin || isMod) {
        inputHtml = '<div class="chat-input-wrap">' +
            '<div class="chat-editor" id="chatEditor" contenteditable="true" data-placeholder="پیامت رو بنویس"></div>' +
            '<div class="chat-toolbar">' +
                '<div class="chat-toolbar-left">' +
                    '<button type="button" data-chat-cmd="bold"><b>B</b></button>' +
                    '<button type="button" data-chat-cmd="italic"><i>I</i></button>' +
                    '<button type="button" id="chatSpoiler">اسپویلر</button>' +
                    '<button type="button" id="chatColor">رنگ</button>' +
                    '<button type="button" id="chatRainbow">رقص نور</button>' +
                    '<button type="button" id="chatImage">تصویر</button>' +
                '</div>' +
                '<div class="chat-toolbar-right">' +
                    '<button type="button" class="chat-send-btn" id="chatSend">ارسال</button>' +
                '</div>' +
            '</div>' +
            '<div class="color-picker" id="chatColorPicker" hidden style="margin-top:8px;">' +
                '<input type="color" id="chatCustomColor">' +
                '<div class="color-dot" style="background:#c9635d" data-color="#c9635d"></div>' +
                '<div class="color-dot" style="background:#d99073" data-color="#d99073"></div>' +
                '<div class="color-dot" style="background:#6b9b7a" data-color="#6b9b7a"></div>' +
                '<div class="color-dot" style="background:#5b6eae" data-color="#5b6eae"></div>' +
                '<div class="color-dot" style="background:#8b7eb8" data-color="#8b7eb8"></div>' +
            '</div>' +
        '</div>';
    } else {
        inputHtml = '<div class="chat-input-wrap" style="text-align:center;padding:16px;">' +
            '<p style="font-size:12px;color:var(--tx-mute);">' +
                (isBanned ? 'تو بن شدی، نمی‌تونی پیام بفرستی' : 'برای ارسال پیام، عضو گروه شو') +
            '</p>' +
        '</div>';
    }

    const groupCoverStyle = group.cover ? '' : 'background:linear-gradient(135deg,var(--accent),var(--accent-2),var(--accent-3));';
    const groupAvatarHtml = group.avatar
        ? '<img src="' + group.avatar + '" alt="">'
        : ini(group.name, 'G');

    box.innerHTML =
        '<div class="group-hero">' +
            '<div class="group-hero-cover" style="' + groupCoverStyle + '">' +
                (group.cover ? '<img src="' + group.cover + '" alt="" loading="lazy">' : '') +
            '</div>' +
            '<div class="group-hero-content">' +
                '<div class="group-hero-avatar">' + groupAvatarHtml + '</div>' +
                '<h1 class="group-hero-name">' + esc(group.name) + '</h1>' +
                (group.description ? '<p class="group-hero-desc">' + esc(group.description) + '</p>' : '') +
                '<div class="group-hero-stats">' +
                    '<div class="group-hero-stat"><strong>' + faNum(group.memberCount) + '</strong><span>عضو</span></div>' +
                    '<div class="group-hero-stat"><strong>' + faNum(messages.length) + '</strong><span>پیام</span></div>' +
                    '<div class="group-hero-stat"><strong>' + (group.type === 'public' ? 'عمومی' : 'خصوصی') + '</strong><span>نوع</span></div>' +
                '</div>' +
            '</div>' +
        '</div>' +
        teamSection +
        (actionsHtml ? '<div class="group-actions-bar">' + actionsHtml + '</div>' : '') +
        '<div class="chat-box">' +
            '<div class="chat-messages" id="chatMessages">' + messagesHtml + '</div>' +
            inputHtml +
        '</div>';

    initChat(groupId, group);

    const lm = $('#loadMoreMsgs');
    if (lm) lm.addEventListener('click', () => { S.groupAll = groupId; renderGroupPage(groupId); });

    const gsb = $('#groupSettingsBtn');
    if (gsb) gsb.addEventListener('click', () => openGroupSettings(groupId));
    const jb = $('#joinGroupBtn');
    if (jb) jb.addEventListener('click', () => joinGroup(groupId));
    const lb = $('#leaveGroupBtn');
    if (lb) lb.addEventListener('click', () => leaveGroup(groupId));

    box.querySelectorAll('.team-member[data-user-id]').forEach(el => {
        el.addEventListener('click', () => showPage('profile', el.dataset.userId));
    });

    setTimeout(() => {
        const cm = $('#chatMessages');
        if (cm) cm.scrollTop = cm.scrollHeight;
    }, 60);
}

function renderChatMessage(msg, group, level) {
    const user = getUserById(msg.userId);
    const name = user ? user.displayName : (msg.userName || 'ناشناس');
    const avatar = user ? user.avatar : msg.userAvatar;
    const initial = ini(name);

    let roleBadge = '';
    if (group.ownerId === msg.userId) roleBadge = '<span class="role-badge owner">مدیر</span>';
    else if ((group.admins || []).indexOf(msg.userId) > -1) roleBadge = '<span class="role-badge admin">ادمین</span>';
    else if ((group.mods || []).indexOf(msg.userId) > -1) roleBadge = '<span class="role-badge mod">ناظر</span>';

    const userLiked = S.user && (msg.likes || []).indexOf(S.user.id) > -1;
    const userDisliked = S.user && (msg.dislikes || []).indexOf(S.user.id) > -1;
    const imageHtml = msg.image ? '<img src="' + msg.image + '" class="chat-msg-image" loading="lazy" alt="">' : '';
    const age = (Date.now() - msg.createdAt) / 1000;
    const canEdit = S.user && S.user.id === msg.userId && age < 600;
    const canDelete = S.user && (
        S.user.id === msg.userId ||
        group.ownerId === S.user.id ||
        (group.admins || []).indexOf(S.user.id) > -1 ||
        (group.mods || []).indexOf(S.user.id) > -1
    );

    let repliesHtml = '';
    if (msg.replies && msg.replies.length && level < 5) {
        repliesHtml = '<div class="chat-replies">' +
            msg.replies.map(r => renderChatReply(r, group, level + 1, msg.id)).join('') + '</div>';
    }

    const editedTag = msg.edited ? '<span class="edited-tag">(ویرایش‌شده)</span>' : '';

    return '<div class="chat-msg" data-msg-id="' + msg.id + '">' +
        '<div class="user-avatar" data-user-id="' + msg.userId + '">' +
            (avatar ? '<img src="' + avatar + '" alt="">' : initial) +
        '</div>' +
        '<div class="chat-msg-content">' +
            '<div class="chat-msg-head">' +
                '<strong data-user-id="' + msg.userId + '">' + esc(name) + '</strong>' +
                (user ? badgesHtml(user) : '') + roleBadge +
                '<span class="time">' + timeAgo(msg.createdAt) + ' ' + editedTag + '</span>' +
            '</div>' +
            '<div class="chat-msg-body">' + (msg.content || '') + '</div>' + imageHtml +
            '<div class="chat-msg-actions">' +
                '<button class="chat-msg-btn ' + (userLiked ? 'liked' : '') + '" data-msg-like="' + msg.id + '" type="button">' + ICON.thumbUp + ' ' + faNum((msg.likes || []).length) + '</button>' +
                '<button class="chat-msg-btn ' + (userDisliked ? 'disliked' : '') + '" data-msg-dislike="' + msg.id + '" type="button">' + ICON.thumbDown + ' ' + faNum((msg.dislikes || []).length) + '</button>' +
                '<button class="chat-msg-btn" data-msg-reply="' + msg.id + '" type="button">پاسخ</button>' +
                (canEdit ? '<button class="chat-msg-btn" data-msg-edit="' + msg.id + '" type="button">ویرایش</button>' : '') +
                (canDelete ? '<button class="chat-msg-btn" data-msg-del="' + msg.id + '" type="button">حذف</button>' : '') +
            '</div>' + repliesHtml +
        '</div>' +
    '</div>';
}

function renderChatReply(reply, group, level, parentMsgId) {
    const user = getUserById(reply.userId);
    const name = user ? user.displayName : (reply.userName || 'ناشناس');
    const avatar = user ? user.avatar : reply.userAvatar;
    const initial = ini(name);
    const userLiked = S.user && (reply.likes || []).indexOf(S.user.id) > -1;
    const userDisliked = S.user && (reply.dislikes || []).indexOf(S.user.id) > -1;
    const age = (Date.now() - reply.createdAt) / 1000;
    const canEdit = S.user && S.user.id === reply.userId && age < 600;
    const canDelete = S.user && (
        S.user.id === reply.userId ||
        group.ownerId === S.user.id ||
        (group.admins || []).indexOf(S.user.id) > -1 ||
        (group.mods || []).indexOf(S.user.id) > -1
    );

    let nestedHtml = '';
    if (reply.replies && reply.replies.length && level < 5) {
        nestedHtml = '<div class="chat-replies">' +
            reply.replies.map(r => renderChatReply(r, group, level + 1, reply.id)).join('') + '</div>';
    }
    const editedTag = reply.edited ? '<span class="edited-tag">(ویرایش‌شده)</span>' : '';

    return '<div class="chat-reply" data-reply-id="' + reply.id + '" data-parent-id="' + parentMsgId + '">' +
        '<div class="chat-reply-header">' +
            '<div class="user-avatar" data-user-id="' + reply.userId + '">' +
                (avatar ? '<img src="' + avatar + '" alt="">' : initial) +
            '</div>' +
            '<strong data-user-id="' + reply.userId + '">' + esc(name) + '</strong>' +
            (user ? badgesHtml(user) : '') +
            '<span class="time">' + timeAgo(reply.createdAt) + ' ' + editedTag + '</span>' +
        '</div>' +
        '<div class="chat-reply-body">' + (reply.content || '') + '</div>' +
        '<div class="chat-reply-actions">' +
            '<button class="chat-reply-btn ' + (userLiked ? 'liked' : '') + '" data-reply-like="' + reply.id + '" data-parent="' + parentMsgId + '" type="button">' + ICON.thumbUp + ' ' + faNum((reply.likes || []).length) + '</button>' +
            '<button class="chat-reply-btn ' + (userDisliked ? 'disliked' : '') + '" data-reply-dislike="' + reply.id + '" data-parent="' + parentMsgId + '" type="button">' + ICON.thumbDown + '</button>' +
            (level < 5 ? '<button class="chat-reply-btn" data-reply-reply="' + reply.id + '" type="button">پاسخ</button>' : '') +
            (canEdit ? '<button class="chat-reply-btn" data-reply-edit="' + reply.id + '" type="button">ویرایش</button>' : '') +
            (canDelete ? '<button class="chat-reply-btn" data-reply-del="' + reply.id + '" data-parent="' + parentMsgId + '" type="button">حذف</button>' : '') +
        '</div>' + nestedHtml +
    '</div>';
}

function initChat(groupId, group) {
    const editor = $('#chatEditor');
    if (editor) {
        editor.addEventListener('beforeinput', () => {
            const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
            const toRemove = [];
            let n;
            while ((n = walker.nextNode())) {
                if (n.textContent === '\u200B') toRemove.push(n);
            }
            toRemove.forEach(node => {
                if (node.parentNode && document.activeElement === editor) {
                    try { node.parentNode.removeChild(node); } catch (e) {}
                }
            });
        });

        $$('.chat-toolbar button[data-chat-cmd]').forEach(btn => {
            btn.addEventListener('mousedown', e => e.preventDefault());
            btn.addEventListener('click', e => {
                e.preventDefault();
                const cmd = btn.dataset.chatCmd;
                if (cmd === 'bold') Ed.bold();
                else if (cmd === 'italic') Ed.italic();
                editor.focus();
            });
        });

        const cs = $('#chatSpoiler');
        if (cs) {
            cs.addEventListener('mousedown', e => e.preventDefault());
            cs.addEventListener('click', e => { e.preventDefault(); Ed.spoiler(); editor.focus(); });
        }

        const cc = $('#chatColor');
        if (cc) {
            cc.addEventListener('mousedown', e => e.preventDefault());
            cc.addEventListener('click', e => {
                e.preventDefault();
                const p = $('#chatColorPicker');
                if (p) p.hidden = !p.hidden;
            });
        }

        const customC = $('#chatCustomColor');
        if (customC) {
            customC.addEventListener('mousedown', e => e.preventDefault());
            customC.addEventListener('input', () => Ed.color(customC.value));
        }

        $$('#chatColorPicker .color-dot').forEach(d => {
            d.addEventListener('mousedown', e => e.preventDefault());
            d.addEventListener('click', e => {
                e.preventDefault();
                Ed.color(d.dataset.color);
                const p = $('#chatColorPicker');
                if (p) p.hidden = true;
                editor.focus();
            });
        });

        const rb = $('#chatRainbow');
        if (rb) {
            rb.addEventListener('mousedown', e => e.preventDefault());
            rb.addEventListener('click', e => { e.preventDefault(); Ed.rainbow(); editor.focus(); });
        }

        const ci = $('#chatImage');
        if (ci) ci.addEventListener('click', () => {
            const inp = document.createElement('input');
            inp.type = 'file'; inp.accept = 'image/*';
            inp.onchange = async () => {
                try {
                    const url = await uploadImage(inp.files[0]);
                    sendChatMessage(groupId, null, url);
                } catch (err) { toast(err.message || String(err)); }
            };
            inp.click();
        });

        const csend = $('#chatSend');
        if (csend) csend.addEventListener('click', () => {
            const content = editor.innerHTML.trim();
            if (!content || editor.textContent.trim().length < 1) return;
            sendChatMessage(groupId, content);
        });

        editor.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                const b = $('#chatSend');
                if (b) b.click();
            }
        });
    }

    const chatBox = $('#chatMessages');
    if (chatBox) {
        /* با flag از دوباره‌bind شدن جلوگیری می‌کنیم */
        chatBox.addEventListener('click', e => {
            const userTrigger = e.target.closest('[data-user-id]');
            if (userTrigger && !e.target.closest('button')) {
                const uidAttr = userTrigger.dataset.userId;
                if (uidAttr) { showPage('profile', uidAttr); return; }
            }

            const like = e.target.closest('[data-msg-like]');
            const dislike = e.target.closest('[data-msg-dislike]');
            const reply = e.target.closest('[data-msg-reply]');
            const editMsg = e.target.closest('[data-msg-edit]');
            const del = e.target.closest('[data-msg-del]');
            const rLike = e.target.closest('[data-reply-like]');
            const rDislike = e.target.closest('[data-reply-dislike]');
            const rReply = e.target.closest('[data-reply-reply]');
            const rEdit = e.target.closest('[data-reply-edit]');
            const rDel = e.target.closest('[data-reply-del]');

            if (like) toggleMsgReaction(groupId, like.dataset.msgLike, 'like');
            if (dislike) toggleMsgReaction(groupId, dislike.dataset.msgDislike, 'dislike');
            if (reply) openReplyModal({ mode: 'reply-message', groupId, messageId: reply.dataset.msgReply });
            if (editMsg) openReplyModal({ mode: 'edit-message', groupId, messageId: editMsg.dataset.msgEdit });
            if (del && confirm('حذف بشه؟')) deleteMessage(groupId, del.dataset.msgDel);
            if (rLike) toggleReplyReaction(groupId, rLike.dataset.parent, rLike.dataset.replyLike, 'like');
            if (rDislike) toggleReplyReaction(groupId, rDislike.dataset.parent, rDislike.dataset.replyDislike, 'dislike');
            if (rReply) openReplyModal({ mode: 'reply-reply', groupId, replyId: rReply.dataset.replyReply });
            if (rEdit) openReplyModal({ mode: 'edit-reply', groupId, replyId: rEdit.dataset.replyEdit });
            if (rDel && confirm('حذف بشه؟')) deleteReply(groupId, rDel.dataset.replyDel);
        });
    }
}

async function sendChatMessage(groupId, content, image) {
    if (!S.user) { toast('اول وارد شو'); return false; }
    if (S._chatBusy) return false;
    S._chatBusy = true;
    try {
        const ok = await act(() => API.post('/api/groups/' + groupId + '/messages', { content: content || '', image: image || null }), ['groups', 'activity']);
        if (ok) { await loadGroupMessages(groupId); renderGroupPage(groupId); }
        return !!ok;
    } finally { S._chatBusy = false; }
}

/* اجرای یک عملیات روی گروه و تازه‌سازی صفحه */
async function groupAct(groupId, fn, parts) {
    const ok = await act(fn, parts || ['groups']);
    await loadGroupMessages(groupId);
    if (S.page === 'group' && S.pageData === groupId) renderGroupPage(groupId);
    return !!ok;
}

function toggleMsgReaction(groupId, msgId, type) {
    if (!S.user) { toast('اول وارد شو'); return Promise.resolve(false); }
    return groupAct(groupId, () => API.post('/api/groups/' + groupId + '/items/' + msgId + '/react', { type }));
}

function toggleReplyReaction(groupId, parentId, replyId, type) {
    return toggleMsgReaction(groupId, replyId, type);
}

function addReplyToMessage(groupId, msgId, html) {
    if (!S.user) return Promise.resolve(false);
    return groupAct(groupId, () => API.post('/api/groups/' + groupId + '/items/' + msgId + '/replies', { content: html }));
}

/* FIX: از replyId تنها استفاده کن — دیگر به data-parent وابسته نباش */
function addReplyToReply(groupId, replyId, html) {
    if (!S.user) return Promise.resolve(false);
    return groupAct(groupId, () => API.post('/api/groups/' + groupId + '/items/' + replyId + '/replies', { content: html }));
}

function updateMessageContent(groupId, msgId, html) {
    return groupAct(groupId, () => API.patch('/api/groups/' + groupId + '/items/' + msgId, { content: html }));
}

/* FIX: از replyId تنها استفاده کن */
function updateReplyContent(groupId, replyId, html) {
    return updateMessageContent(groupId, replyId, html);
}

async function deleteMessage(groupId, msgId) {
    const ok = await groupAct(groupId, () => API.del('/api/groups/' + groupId + '/items/' + msgId));
    if (ok) toast('حذف شد');
    return ok;
}

function deleteReply(groupId, replyId) { return deleteMessage(groupId, replyId); }

async function joinGroup(groupId) {
    if (!S.user) { toast('اول وارد شو'); return; }
    const ok = await groupAct(groupId, () => API.post('/api/groups/' + groupId + '/join'), ['groups', 'users']);
    if (ok) toast('عضو شدی');
}

async function leaveGroup(groupId) {
    if (!S.user) return;
    if (!confirm('از گروه خارج بشی؟')) return;
    const ok = await act(() => API.post('/api/groups/' + groupId + '/leave'), ['groups', 'users']);
    if (ok) { toast('از گروه خارج شدی'); showPage('groups'); }
}

async function requestJoinGroup(groupId) {
    if (!S.user) { toast('اول وارد شو'); return; }
    const ok = await groupAct(groupId, () => API.post('/api/groups/' + groupId + '/request'));
    if (ok) toast('درخواستت ارسال شد');
}

function openGroupSettings(groupId) {
    if (!S.user) return;
    const g = DB.getGroups().find(x => x.id === groupId);
    if (!g) return;
    const isOwner = g.ownerId === S.user.id;
    const isAdmin = (g.admins || []).indexOf(S.user.id) > -1;
    const isMod = (g.mods || []).indexOf(S.user.id) > -1;
    const isSiteAdmin = S.user.role === 'admin';
    if (!isOwner && !isAdmin && !isMod && !isSiteAdmin) { toast('دسترسی نداری'); return; }

    const box = $('#groupSettingsBody');
    if (!box) return;

    const users = DB.getUsers();
    const membersHtml = (g.members || []).map(mid => {
        const u = users.find(x => x.id === mid);
        if (!u) return '';
        const isOwnerM = g.ownerId === mid;
        const isAdminM = (g.admins || []).indexOf(mid) > -1;
        const isModM = (g.mods || []).indexOf(mid) > -1;
        let roleLabel = '';
        if (isOwnerM) roleLabel = '<span class="role-badge owner">مدیر</span>';
        else if (isAdminM) roleLabel = '<span class="role-badge admin">ادمین</span>';
        else if (isModM) roleLabel = '<span class="role-badge mod">ناظر</span>';
        let btns = '';
        if (!isOwnerM && (isOwner || isAdmin || isSiteAdmin)) {
            if (isOwner || isSiteAdmin) btns += '<button class="btn-ghost small" data-promote-admin="' + mid + '" data-on="' + (isAdminM ? 1 : 0) + '" type="button">' + (isAdminM ? 'عزل ادمین' : 'ادمین') + '</button>';
            btns += '<button class="btn-ghost small" data-promote-mod="' + mid + '" data-on="' + (isModM ? 1 : 0) + '" type="button">' + (isModM ? 'عزل ناظر' : 'ناظر') + '</button>';
            btns += '<button class="btn-ghost small danger" data-ban-member="' + mid + '" type="button">بن</button>';
        }
        return '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--bd);gap:10px;flex-wrap:wrap;">' +
            '<div style="display:flex;align-items:center;gap:10px;min-width:0;">' +
                '<div class="user-avatar" style="width:32px;height:32px;font-size:12px;">' +
                    (u.avatar ? '<img src="' + u.avatar + '" alt="">' : ini(u.displayName)) +
                '</div>' +
                '<div style="min-width:0;">' +
                    '<strong style="font-size:13px;">' + esc(u.displayName) + '</strong> ' + roleLabel +
                    '<div style="font-size:11px;color:var(--tx-mute);direction:ltr;">@' + esc(u.username) + '</div>' +
                '</div>' +
            '</div>' +
            '<div style="display:flex;gap:4px;flex-wrap:wrap;">' + btns + '</div>' +
        '</div>';
    }).join('');

    let requestsHtml = '';
    if ((g.joinRequests || []).length) {
        requestsHtml = '<h4 style="font-size:14px;font-weight:800;margin:16px 0 10px;">درخواست‌های عضویت</h4>' +
            g.joinRequests.map(mid => {
                const u = users.find(x => x.id === mid);
                if (!u) return '';
                return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;">' +
                    '<strong>' + esc(u.displayName) + '</strong>' +
                    '<div style="display:flex;gap:4px;">' +
                        '<button class="btn-primary small" data-accept-join="' + mid + '" type="button">قبول</button>' +
                        '<button class="btn-ghost small" data-reject-join="' + mid + '" type="button">رد</button>' +
                    '</div>' +
                '</div>';
            }).join('');
    }

    let bannedHtml = '';
    if ((g.banned || []).length && (isOwner || isAdmin || isSiteAdmin)) {
        bannedHtml = '<h4 style="font-size:14px;font-weight:800;margin:16px 0 10px;">بن‌شده‌ها</h4>' +
            g.banned.map(mid => {
                const u = users.find(x => x.id === mid);
                return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;">' +
                    '<strong>' + esc(u ? u.displayName : 'کاربر') + '</strong>' +
                    '<button class="btn-ghost small" data-unban="' + mid + '" type="button">رفع بن</button></div>';
            }).join('');
    }

    let siteAdminControls = '';
    if (isSiteAdmin) {
        siteAdminControls = '<div style="padding:14px;border-radius:14px;background:rgba(201,99,93,.06);border:1px solid rgba(201,99,93,.2);margin-bottom:14px;">' +
            '<h4 style="font-size:13px;font-weight:800;margin-bottom:10px;color:var(--bad);">کنترل مدیر سایت</h4>' +
            '<button class="btn-ghost small danger full" id="deleteGroupBtn" type="button">حذف کامل گروه</button>' +
        '</div>';
    }

    box.innerHTML = siteAdminControls +
    '<div style="text-align:center;margin-bottom:16px;">' +
        '<div class="group-card-avatar" style="margin:0 auto 10px;" id="groupAvatarPreview">' +
            (g.avatar ? '<img src="' + g.avatar + '" alt="">' : ini(g.name, 'G')) +
        '</div>' +
        '<div class="form-group" style="margin-top:10px;">' +
            '<label>لینک تصویر آواتار گروه (https://...)</label>' +
            '<input type="url" id="gAvatar" value="' + esc(g.avatar || '') + '" placeholder="https://example.com/group.png" dir="ltr">' +
        '</div>' +
    '</div>' +
    '<div class="form-group" style="margin-bottom:14px;">' +
        '<label>اسم گروه</label>' +
        '<input type="text" id="gName" value="' + esc(g.name) + '">' +
    '</div>' +
        '<div class="form-group" style="margin-bottom:14px;">' +
            '<label>توضیحات</label>' +
            '<textarea id="gDesc">' + esc(g.description || '') + '</textarea>' +
        '</div>' +
        '<button class="btn-primary full" id="gSave" type="button" style="margin-bottom:20px;">ذخیره تغییرات</button>' +
        '<h4 style="font-size:14px;font-weight:800;margin-bottom:10px;">اعضا (' + faNum(g.memberCount) + ')</h4>' +
        '<div style="max-height:300px;overflow-y:auto;">' + membersHtml + '</div>' +
        requestsHtml + bannedHtml;

    openModal('groupSettingsOverlay');

    const refreshSettings = async () => {
        await sync(['groups', 'users']);
        await loadGroupMessages(groupId);
        if (S.page === 'group' && S.pageData === groupId) renderGroupPage(groupId);
        openGroupSettings(groupId);
    };

    const avatarInp = $('#gAvatar');
const avatarPreview = $('#groupAvatarPreview');
if (avatarInp && avatarPreview) {
    avatarInp.addEventListener('input', () => {
        const v = avatarInp.value.trim();
        if (v && /^https:\/\//i.test(v)) {
            avatarPreview.innerHTML = '<img src="' + v + '" alt="" onerror="this.style.display=\'none\'">';
        } else {
            avatarPreview.innerHTML = ini(g.name, 'G');
        }
    });
}

const saveBtn = $('#gSave');
if (saveBtn) saveBtn.addEventListener('click', async () => {
    const newName = $('#gName').value.trim();
    if (!newName) { toast('اسم گروه لازمه'); return; }
    const body = { name: newName, description: $('#gDesc').value.trim() };
    const av = $('#gAvatar'); if (av) body.avatar = av.value.trim() || null;
    const ok = await groupAct(groupId, () => API.patch('/api/groups/' + groupId, body), ['groups']);
    if (ok) { toast('ذخیره شد'); closeModal('groupSettingsOverlay'); }
});

    const delGroup = $('#deleteGroupBtn');
    if (delGroup) delGroup.addEventListener('click', async () => {
        if (!confirm('گروه به طور کامل حذف بشه؟')) return;
        const ok = await act(() => API.del('/api/groups/' + groupId), ['groups', 'users']);
        if (ok) { toast('گروه حذف شد'); closeModal('groupSettingsOverlay'); showPage('groups'); }
    });

    /* فقط یک شنونده (باگ نسخه‌ی قبل: با هر باز شدن یکی اضافه می‌شد) */
    if (box._h) box.removeEventListener('click', box._h);
    box._h = async e => {
        const pa = e.target.closest('[data-promote-admin]');
        const pm = e.target.closest('[data-promote-mod]');
        const ban = e.target.closest('[data-ban-member]');
        const unban = e.target.closest('[data-unban]');
        const acc = e.target.closest('[data-accept-join]');
        const rej = e.target.closest('[data-reject-join]');
        let uidv = null, action = null, msg = '';
        if (pa) { uidv = pa.dataset.promoteAdmin; action = pa.dataset.on === '1' ? 'unadmin' : 'admin'; msg = action === 'admin' ? 'ادمین شد' : 'عزل شد'; }
        else if (pm) { uidv = pm.dataset.promoteMod; action = pm.dataset.on === '1' ? 'unmod' : 'mod'; msg = action === 'mod' ? 'ناظر شد' : 'عزل شد'; }
        else if (ban) { if (!confirm('بن بشه؟')) return; uidv = ban.dataset.banMember; action = 'ban'; msg = 'بن شد'; }
        else if (unban) { uidv = unban.dataset.unban; action = 'unban'; msg = 'رفع بن شد'; }
        else if (acc) { uidv = acc.dataset.acceptJoin; action = 'accept'; msg = 'قبول شد'; }
        else if (rej) { uidv = rej.dataset.rejectJoin; action = 'reject'; msg = 'رد شد'; }
        if (!action) return;
        const ok = await act(() => API.post('/api/groups/' + groupId + '/members/' + uidv, { action }), ['groups', 'users']);
        if (ok) { toast(msg); await refreshSettings(); }
    };
    box.addEventListener('click', box._h);
}

/* ══════════════════════════════════════════════════════════════
   ۱۵. PM — با تب‌های دریافت/ارسال/گروهی
   ══════════════════════════════════════════════════════════════ */
function renderPMPage() {
    cons
