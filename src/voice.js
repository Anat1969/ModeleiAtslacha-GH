// הקלטה ותמלול לכל שדה כתיבה (כלל ענת, 02.11.2026: "תמיד שיש צורך לכתוב, תאפשר הקלטה ותמלול").
// משתמש ב-Web Speech API של הדפדפן, בעברית. התמלול נכנס לשדה תוך כדי דיבור, ושומר כמו הקלדה (אירוע input).
// בדפדפן בלי תמיכה: הכפתור מסביר איך להכתיב במקלדת של המכשיר, ולא נעלם בשקט.
const Rec = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
export const voiceSupported = () => !!Rec;

let active = null; // הקלטה אחת בכל רגע

export function attachVoice(field, { lang = 'he-IL' } = {}) {
  if (!field || field.dataset.voice) return;
  field.dataset.voice = '1';
  const wrap = document.createElement('div');
  wrap.className = 'voice';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'press voice-btn';
  btn.setAttribute('aria-pressed', 'false');
  btn.innerHTML = '<span class="voice-dot" aria-hidden="true"></span><span class="voice-t">הקלטה</span>';
  const note = document.createElement('span');
  note.className = 'voice-note';
  note.setAttribute('aria-live', 'polite');
  wrap.append(btn, note);
  field.after(wrap);

  if (!Rec) {
    btn.title = 'הדפדפן הזה לא מתמלל';
    btn.addEventListener('click', () => { note.textContent = 'הדפדפן הזה לא מתמלל. אפשר ללחוץ על המיקרופון במקלדת של הטלפון ולהכתיב.'; });
    return;
  }

  let rec = null, base = '';
  const stop = () => { if (rec) rec.stop(); };
  const set = (on) => {
    btn.setAttribute('aria-pressed', String(on));
    btn.querySelector('.voice-t').textContent = on ? 'עצירה' : 'הקלטה';
    note.textContent = on ? 'מקליטה ומתמללת. לחצי שוב לעצירה.' : '';
  };
  btn.addEventListener('click', () => {
    if (rec) { stop(); return; }
    if (active) active();
    rec = new Rec();
    rec.lang = lang; rec.continuous = true; rec.interimResults = true;
    base = field.value ? field.value.replace(/\s*$/, ' ') : '';
    rec.onresult = (e) => {
      let finalText = '', interim = '';
      for (let i = 0; i < e.results.length; i++) (e.results[i].isFinal ? (finalText += e.results[i][0].transcript) : (interim += e.results[i][0].transcript));
      field.value = (base + finalText + interim).replace(/\s+/g, ' ').trimStart();
      field.dispatchEvent(new Event('input', { bubbles: true }));
    };
    rec.onerror = (e) => { note.textContent = e.error === 'not-allowed' ? 'אין הרשאה למיקרופון. אפשר לאשר בסרגל הכתובת של הדפדפן.' : 'התמלול נעצר. אפשר לנסות שוב.'; };
    rec.onend = () => { rec = null; active = null; set(false); field.dispatchEvent(new Event('change', { bubbles: true })); };
    active = stop;
    try { rec.start(); set(true); } catch { rec = null; note.textContent = 'לא הצלחתי להפעיל הקלטה. אפשר לנסות שוב.'; }
  });
}
