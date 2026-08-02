// @ts-check
/* ════════════════════════════════════════════════════════
   shared/download.js — единственный путь «текст → файл на диск»
   ────────────────────────────────────────────────────────
   До этого выгрузка была прошита трижды (JSON в profile.js, CSV в
   csv-export.js, каждый со своим набором мелочей: кто-то ревокал URL,
   кто-то нет). Одна реализация — один режим отказа.
   ════════════════════════════════════════════════════════ */

/**
 * Скачать текстовое содержимое файлом.
 * @param {string} text
 * @param {string} filename
 * @param {string} [mime]
 */
export function downloadText(text, filename, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Ревок откладываем: Safari на iOS успевает отменить скачивание, если
  // объект-URL освободить синхронно сразу после click().
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/**
 * Датированное имя файла экспорта: `athlete-pro-<what>-2026-08-02.<ext>`.
 * @param {string} what
 * @param {string} ext
 * @param {Date} [now]
 * @returns {string}
 */
export function exportFilename(what, ext, now = new Date()) {
  return `athlete-pro-${what}-${now.toISOString().split('T')[0]}.${ext}`;
}
