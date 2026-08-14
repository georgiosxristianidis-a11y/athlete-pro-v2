// @ts-check
/**
 * Air Markdown — форматтер потока ИИ для экрана s-intel (карточка HUD-2).
 *
 * Живёт отдельным модулем, а не внутри view, по двум причинам:
 *   1) он чистый (строка → строка, ноль DOM) и потому проверяется юнит-тестом
 *      `test/intel-markdown.test.js` без браузера;
 *   2) порядок «сперва esc(), потом разметка» — это защита от XSS, а не стиль.
 *      В отвергнутой линии рядом лежала карточка тренировки, собранная из того
 *      же потока БЕЗ esc(); отдельный файл с тестом делает правило заметным.
 *
 * Блочный разбор построчный, а не цепочка regex по всему тексту: цепочка
 * оставляла `<h2>` и `<li>` внутри `<p>` и `<li>` без `<ul>` — браузер такую
 * вложенность чинит сам, но по-своему, и вёрстка съезжала на длинных ответах.
 *
 * Форматтер вызывается на КАЖДЫЙ чанк стрима, поэтому недописанная разметка —
 * норма: незакрытый `<thinking>`, обрубленный JSON виджета, одинокие `**`.
 * Ни один из этих случаев не должен ронять рендер — показываем как есть,
 * следующий чанк дорисует.
 */
import { esc } from './utils.js';

/** Метка-заглушка виджета. Спецсимволов нет — esc() её не трогает. */
const WIDGET_MARK = '[[AP_WIDGET]]';
/** Метка-заглушка карточки тренировки — тот же приём, что и у виджета готовности. */
const WORKOUT_MARK = '[[AP_WORKOUT]]';

/**
 * Инлайн-разметка внутри уже экранированной строки.
 * @param {string} s — строка ПОСЛЕ esc()
 * @returns {string}
 */
function inline(s) {
  return s
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
}

/**
 * @param {string} rawText — сырой текст от модели
 * @param {(data: any) => string} [buildWidget] — сборщик виджета готовности
 * @param {(data: any) => string} [buildWorkoutCard] — сборщик карточки тренировки (HUD-3)
 * @returns {string} HTML
 */
export function formatAirMarkdown(rawText, buildWidget, buildWorkoutCard) {
  let text = String(rawText ?? '');

  // 1. <thinking> — модель думает вслух, пользователю это не показываем.
  //    Хвост без закрывающего тега режем тоже: во время стрима его ещё нет.
  text = text.replace(/<thinking>[\s\S]*?(<\/thinking>|$)/g, '');

  // 2. Виджет готовности достаём ДО экранирования — это JSON, а не текст.
  let widgetHtml = '';
  const jsonMatch = text.match(/\{[\s\S]*"_widget"\s*:\s*"readiness"[\s\S]*\}/);
  if (jsonMatch && typeof buildWidget === 'function') {
    try {
      widgetHtml = buildWidget(JSON.parse(jsonMatch[0]));
      text = text.replace(jsonMatch[0], `\n\n${WIDGET_MARK}\n\n`);
    } catch (e) {
      // JSON ещё не дотёк целиком — оставляем текстом, следующий чанк починит.
    }
  }

  // 2b. Карточка тренировки — тот же приём: JSON достаём и собираем ДО esc().
  //     В отвергнутой линии этот кусок собирался из потока БЕЗ esc() —
  //     сборщик обязан экранировать title/название упражнения сам.
  let workoutHtml = '';
  const cardMatch = text.match(/\[WORKOUT_CARD\]([\s\S]*?)\[\/WORKOUT_CARD\]/);
  if (cardMatch && typeof buildWorkoutCard === 'function') {
    try {
      workoutHtml = buildWorkoutCard(JSON.parse(cardMatch[1].trim()));
      text = text.replace(cardMatch[0], `\n\n${WORKOUT_MARK}\n\n`);
    } catch (e) {
      // JSON карточки ещё не дотёк целиком — оставляем текстом, следующий чанк починит.
    }
  }

  // 3. Экранируем ВЕСЬ текст один раз, дальше работаем только с безопасной строкой.
  const lines = esc(text).split('\n');

  /** @type {string[]} */ const out = [];
  /** @type {string[]} */ let para = [];
  /** @type {string[]} */ let list = [];

  const flushList = () => {
    if (!list.length) return;
    out.push(`<ul class="intel-md-list">${list.join('')}</ul>`);
    list = [];
  };
  const flushPara = () => {
    if (!para.length) return;
    out.push(`<p class="intel-md-p">${para.join('<br>')}</p>`);
    para = [];
  };
  const flush = () => { flushList(); flushPara(); };

  for (const line of lines) {
    const t = line.trim();
    if (!t) { flush(); continue; }

    if (t === WIDGET_MARK) { flush(); out.push(widgetHtml); continue; }
    if (t === WORKOUT_MARK) { flush(); out.push(workoutHtml); continue; }

    let m;
    if ((m = t.match(/^###\s+(.*)$/))) {
      flush(); out.push(`<h3 class="intel-md-h3">${inline(m[1])}</h3>`); continue;
    }
    if ((m = t.match(/^#{1,2}\s+(.*)$/))) {
      flush(); out.push(`<h2 class="intel-md-h2">${inline(m[1])}</h2>`); continue;
    }
    if ((m = t.match(/^(\d+)\.\s+(.*)$/))) {
      flush();
      out.push(
        `<div class="intel-md-num"><span class="intel-num-badge">${m[1]}</span><span>${inline(m[2])}</span></div>`
      );
      continue;
    }
    if ((m = t.match(/^[*-]\s+(.*)$/))) {
      flushPara(); list.push(`<li class="intel-md-li">${inline(m[1])}</li>`); continue;
    }

    flushList();
    para.push(inline(t));
  }
  flush();

  return `<div class="intel-md-body">${out.join('')}</div>`;
}
