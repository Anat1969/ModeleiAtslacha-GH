/*
 * <ai-menu> - the A&I logo button of Anat Stiebelman's apps.
 *
 * One button in the top bar ("אד' ענת שטיבלמן", mark A&I). Everything that
 * concerns building and editing the app lives inside it, never loose in the bar:
 * copy link, development chat, research project, install, and the app's own
 * editing actions.
 *
 * Use in any app (static, Vite, React):
 *   <script src="https://appofapp-gh.vercel.app/ai-menu.js"></script>
 *   <ai-menu chat="https://claude.ai/code/session_..." research="https://claude.ai/project/..."></ai-menu>
 * Without a top bar, add data-auto to the script tag and the button mounts itself
 * at the top left corner.
 *
 * Municipal apps (Anat, 2026-10-27): brand="ashdod" shows the Ashdod Municipality logo
 * instead of the A&I mark; the menu inside is the same.
 *   <ai-menu brand="ashdod" chat="..."></ai-menu>
 *
 * App editing actions (optional):
 *   menu.items = [{ label: 'מצב עריכה', pressed: true, onSelect() {...} }, ...]
 *   menu.status = 'נשמר'   // short state shown under the name
 */
(function () {
  if (customElements.get('ai-menu')) return;
  const BASE = (document.currentScript && document.currentScript.src) || 'https://appofapp-gh.vercel.app/ai-menu.js';
  const ASHDOD_LOGO = new URL('ashdod-logo.png', BASE).href;

  // Chrome fires this once, early; keep it for the install item.
  let installEvent = null;
  const listeners = new Set();
  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installEvent = e;
    listeners.forEach((f) => f());
  });
  addEventListener('appinstalled', () => {
    installEvent = null;
    listeners.forEach((f) => f());
  });

  const CSS = `
    :host *, :host *::before { box-sizing: border-box; }
    :host { position: relative; display: inline-flex; flex: 0 0 auto; font-family: inherit; direction: rtl; }
    :host([data-floating]) { position: fixed; top: 12px; left: 12px; z-index: 2147483000; }
    button { font: inherit; color: inherit; cursor: pointer; }
    .logo {
      display: inline-flex; align-items: center; gap: 10px; padding: 4px 4px 4px 12px;
      border: 1px solid rgba(23, 25, 28, 0.18); border-radius: 0;
      background: linear-gradient(180deg, #fbfaf8, #ecebe7);
      box-shadow: 0 1px 0 rgba(255, 255, 255, 0.8) inset, 0 1px 2px rgba(20, 22, 26, 0.08), 0 6px 16px -8px rgba(20, 22, 26, 0.35);
      transition: box-shadow 0.25s, transform 0.25s;
    }
    .logo:hover, .logo[aria-expanded='true'] { transform: translateY(-1px); box-shadow: 0 1px 0 rgba(255,255,255,.8) inset, 0 2px 4px rgba(20,22,26,.1), 0 14px 28px -10px rgba(20,22,26,.45); }
    .logo:focus-visible { outline: 2px solid #22324f; outline-offset: 2px; }
    .mark {
      order: 2; display: grid; place-items: center; width: 36px; height: 36px; border-radius: 0;
      background: linear-gradient(160deg, #34383e, #121417); color: #f4f3f0;
      font-family: 'IBM Plex Mono', ui-monospace, monospace; font-size: 12px; font-weight: 500; letter-spacing: 0.02em;
      box-shadow: 0 1px 0 rgba(255,255,255,.15) inset, -3px 3px 0 -1px #c9c6bf;
    }
    .text { order: 1; display: grid; text-align: right; line-height: 1.15; }
    .name { font-size: 13.5px; font-weight: 500; color: #17191c; white-space: nowrap; }
    .status { font-family: 'IBM Plex Mono', ui-monospace, monospace; font-size: 10.5px; letter-spacing: .04em; color: #5a5f66; white-space: nowrap; }
    .status:empty { display: none; }
    .panel {
      position: fixed; top: 0; left: 0; z-index: 2147483001; width: 290px; max-width: calc(100vw - 24px);
      background: #f7f6f3; color: #17191c; border: 1px solid #cfccc5; border-radius: 0; padding: 8px;
      box-shadow: 0 4px 6px rgba(20,22,26,.06), 0 18px 36px rgba(20,22,26,.14), 0 48px 96px -24px rgba(20,22,26,.35);
      transform-origin: top left; animation: open .18s cubic-bezier(.2,.7,.2,1);
    }
    .panel[hidden] { display: none; }
    @keyframes open { from { opacity: 0; transform: translateY(-6px) scale(.98); } }
    .head { display: flex; align-items: center; gap: 10px; padding: 8px 8px 12px; border-bottom: 1px solid #e2dfd9; margin-bottom: 6px; }
    .head .mark { order: 0; width: 30px; height: 30px; font-size: 11px; }
    .head b { font-weight: 500; font-size: 14px; }
    .head div span { display: block; font-family: 'IBM Plex Mono', ui-monospace, monospace; font-size: 10px; letter-spacing: .14em; color: #6b7077; }
    .group { padding: 6px 0; }
    .group + .group { border-top: 1px solid #e2dfd9; }
    .label { padding: 4px 10px 6px; font-family: 'IBM Plex Mono', ui-monospace, monospace; font-size: 10.5px; letter-spacing: .16em; color: #6b7077; }
    .item {
      display: flex; width: 100%; align-items: center; justify-content: space-between; gap: 10px;
      padding: 9px 10px; border: 0; border-radius: 0; background: none; text-align: right; font-size: 14px; color: #17191c; text-decoration: none;
    }
    .item:hover:not(:disabled), .item:focus-visible { background: #e9e7e2; outline: none; }
    .item:disabled { opacity: .45; cursor: default; }
    .item small { font-family: 'IBM Plex Mono', ui-monospace, monospace; font-size: 10.5px; color: #6b7077; }
    .item[aria-pressed='true'] { background: #17191c; color: #f4f3f0; }
    .item[aria-pressed='true'] small { color: #b9bcc0; }
    .item.solid { background: linear-gradient(180deg, #2a2d32, #17191c); color: #f4f3f0; }
    .note { padding: 6px 10px 4px; font-size: 12.5px; color: #2f5d46; }
    .note:empty { display: none; }
    .brandimg { display: block; height: 36px; width: auto; }
    :host([brand='ashdod']) .logo { padding: 4px 8px; background: #fff; }
    .head .brandimg { height: 30px; }
    @media (max-width: 700px) {
      .brandimg { height: 30px; }
      .text { display: none; }
      .logo { padding: 3px; }
    }
  `;

  class AIMenu extends HTMLElement {
    constructor() {
      super();
      this._items = [];
      this._status = '';
      this._open = false;
      this._onDoc = (e) => {
        if (this._open && !e.composedPath().includes(this)) this.close();
      };
      this._onKey = (e) => {
        if (e.key === 'Escape' && this._open) {
          this.close();
          this._btn.focus();
        }
      };
      this._onInstall = () => this._render();
      const root = this.attachShadow({ mode: 'open' });
      root.innerHTML = `<style>${CSS}</style>
        <button class="logo" part="button" aria-haspopup="menu" aria-expanded="false" title="אד' ענת שטיבלמן A&I">
          <span class="mark" aria-hidden="true">A&amp;I</span>
          <span class="text"><span class="name">אד' ענת שטיבלמן</span><span class="status"></span></span>
        </button>
        <div class="panel" role="menu" hidden></div>`;
      this._btn = root.querySelector('.logo');
      this._panel = root.querySelector('.panel');
      this._statusEl = root.querySelector('.status');
      this._btn.addEventListener('click', () => (this._open ? this.close() : this.openMenu()));
      this._applyBrand();
    }

    static get observedAttributes() { return ['brand']; }
    attributeChangedCallback() { this._applyBrand(); }
    get _ashdod() { return this.getAttribute('brand') === 'ashdod'; }
    _applyBrand() {
      if (!this._btn) return;
      if (this._ashdod) {
        this._btn.title = 'עיריית אשדוד';
        this._btn.innerHTML = `<img class="brandimg" src="${ASHDOD_LOGO}" alt="עיריית אשדוד"><span class="status" hidden></span>`;
      } else {
        this._btn.title = "אד' ענת שטיבלמן A&I";
        this._btn.innerHTML = `<span class="mark" aria-hidden="true">A&amp;I</span><span class="text"><span class="name">אד' ענת שטיבלמן</span><span class="status"></span></span>`;
      }
      this._statusEl = this.shadowRoot.querySelector('.status');
      if (this._statusEl) this._statusEl.textContent = this._status || '';
      if (this._open) this._render();
    }

    connectedCallback() {
      // Values set before the element was defined (React refs) shadow the setters.
      for (const p of ['items', 'status']) {
        if (Object.prototype.hasOwnProperty.call(this, p)) {
          const v = this[p];
          delete this[p];
          this[p] = v;
        }
      }
      document.addEventListener('pointerdown', this._onDoc, true);
      document.addEventListener('keydown', this._onKey);
      addEventListener('resize', this._place = () => this._open && this._position());
      listeners.add(this._onInstall);
    }

    disconnectedCallback() {
      document.removeEventListener('pointerdown', this._onDoc, true);
      document.removeEventListener('keydown', this._onKey);
      removeEventListener('resize', this._place);
      listeners.delete(this._onInstall);
    }

    get items() { return this._items; }
    set items(v) { this._items = Array.isArray(v) ? v : []; if (this._open) this._render(); }
    get status() { return this._status; }
    set status(v) { this._status = v || ''; this._statusEl.textContent = this._status; }

    openMenu() {
      this._open = true;
      this._note = '';
      this._render();
      this._panel.hidden = false;
      this._btn.setAttribute('aria-expanded', 'true');
      this._position();
      this._panel.querySelector('.item')?.focus();
    }

    close() {
      this._open = false;
      this._panel.hidden = true;
      this._btn.setAttribute('aria-expanded', 'false');
    }

    _position() {
      const r = this._btn.getBoundingClientRect();
      const vw = document.documentElement.clientWidth;
      const w = this._panel.offsetWidth;
      const left = Math.max(12, Math.min(r.left, vw - w - 12));
      this._panel.style.top = `${r.bottom + 8}px`;
      this._panel.style.left = `${left}px`;
    }

    _render() {
      const chat = this.getAttribute('chat');
      const research = this.getAttribute('research');
      const standalone = matchMedia('(display-mode: standalone)').matches;
      const groups = [];
      if (this._items.length) groups.push({ label: 'עריכת האפליקציה', items: this._items });
      const dev = [{ label: 'העתקת קישור', hint: 'למצב הנוכחי', onSelect: () => this._copy() }];
      if (chat) dev.push({ label: 'שיחת הפיתוח', href: chat });
      if (research) dev.push({ label: 'פרויקט המחקר', href: research });
      if (installEvent) dev.push({ label: 'התקנת האפליקציה', solid: true, onSelect: () => this._install() });
      else if (!standalone) dev.push({ label: 'התקנת האפליקציה', hint: 'דרך תפריט Chrome', disabled: true });
      groups.push({ label: 'שיתוף ופיתוח', items: dev });

      const p = this._panel;
      p.replaceChildren();
      const head = document.createElement('div');
      head.className = 'head';
      head.innerHTML = this._ashdod
        ? `<img class="brandimg" src="${ASHDOD_LOGO}" alt=""><div><b>עיריית אשדוד</b><span>ASHDOD MUNICIPALITY</span></div>`
        : `<span class="mark" aria-hidden="true">A&amp;I</span><div><b>אד' ענת שטיבלמן</b><span>ARCHITECTURE &amp; INTELLIGENCE</span></div>`;
      p.append(head);
      for (const g of groups) {
        const box = document.createElement('div');
        box.className = 'group';
        box.setAttribute('role', 'group');
        box.setAttribute('aria-label', g.label);
        const lab = document.createElement('div');
        lab.className = 'label';
        lab.textContent = g.label;
        box.append(lab);
        for (const it of g.items) {
          const el = document.createElement(it.href ? 'a' : 'button');
          el.className = `item${it.solid ? ' solid' : ''}`;
          el.setAttribute('role', 'menuitem');
          if (it.href) {
            el.href = it.href;
            el.target = '_blank';
            el.rel = 'noopener noreferrer';
            el.addEventListener('click', () => this.close());
          } else {
            el.type = 'button';
            el.disabled = !!it.disabled;
            if (typeof it.pressed === 'boolean') el.setAttribute('aria-pressed', String(it.pressed));
            el.addEventListener('click', async () => {
              const keep = await it.onSelect?.();
              if (keep !== true && !this._note) this.close();
            });
          }
          const t = document.createElement('span');
          t.textContent = it.label;
          el.append(t);
          if (it.hint) {
            const s = document.createElement('small');
            s.textContent = it.hint;
            el.append(s);
          }
          box.append(el);
        }
        p.append(box);
      }
      const note = document.createElement('div');
      note.className = 'note';
      note.setAttribute('role', 'status');
      note.textContent = this._note || '';
      p.append(note);
    }

    async _copy() {
      const url = location.href;
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        const ta = document.createElement('textarea');
        ta.value = url;
        document.body.append(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
      this._note = 'הקישור הועתק';
      this._render();
      setTimeout(() => {
        this._note = '';
        this.close();
      }, 900);
      this.dispatchEvent(new CustomEvent('ai-copied', { detail: url, bubbles: true, composed: true }));
    }

    async _install() {
      if (!installEvent) return;
      await installEvent.prompt();
      await installEvent.userChoice;
      installEvent = null;
      this._render();
    }
  }

  customElements.define('ai-menu', AIMenu);

  const me = document.currentScript;
  if (me && me.hasAttribute('data-auto')) {
    const mount = () => {
      if (document.querySelector('ai-menu')) return;
      const el = document.createElement('ai-menu');
      el.setAttribute('data-floating', '');
      for (const a of ['chat', 'research']) if (me.dataset[a]) el.setAttribute(a, me.dataset[a]);
      document.body.append(el);
    };
    document.readyState === 'loading' ? addEventListener('DOMContentLoaded', mount) : mount();
  }
})();
