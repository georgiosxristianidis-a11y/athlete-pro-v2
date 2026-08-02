/* ════════════════════════════════════════════════════════
   theme-boot.js — тема ДО первой отрисовки
   ────────────────────────────────────────────────────────
   Классический синхронный скрипт (не module): module отложен до
   разбора документа, и экран моргнул бы тёмным перед светлой темой.
   Инлайн тоже нельзя — курс на выпил `unsafe-inline` из CSP.

   Логика продублирована из `js/shared/theme.js` осознанно: сюда
   нельзя импортировать (classic script). Совпадение ключа и развилки
   сторожит `test/theme.test.js`.
   ════════════════════════════════════════════════════════ */
(function () {
  var theme = 'dark';
  try {
    var pref = localStorage.getItem('ap-theme');
    if (pref === 'light') theme = 'light';
    else if (pref === 'auto' && matchMedia('(prefers-color-scheme: light)').matches) theme = 'light';
  } catch (e) { /* private mode / no storage — остаёмся на dark */ }
  document.documentElement.setAttribute('data-theme', theme);
})();
