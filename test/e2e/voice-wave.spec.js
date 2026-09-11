// @ts-check
/**
 * VOICE-2 — живая волна на озвучке, проверка в живом браузере.
 *
 * Юнит-гард (`test/voice-wave.test.js`) закрывает расчёт высот и структуру
 * исходника, но не отвечает на главный вопрос карточки: ходят ли столбики
 * по реальному звуку. Ответ требует настоящего `<audio>`, настоящего
 * `AudioContext` и настоящего кадрового цикла — то есть браузера.
 *
 * Ключ провайдера тут не нужен и намеренно не используется: и отчёт, и ответ
 * TTS подменяются на уровне сети, звук — синтетический тон с паузами. Спека
 * гоняется на чужой машине и в CI, ничьей квоты не тратя.
 */
import { test, expect } from '@playwright/test';

const BASE = process.env.E2E_BASE || 'http://localhost:3000';

/* Воркер в этой спеке только мешает: `/api/*` он проксирует собственным
   fetch() внутри своего контекста, куда page.route не достаёт, — стаб молча
   не сработал бы, а запрос ушёл бы на живой сервер без ключа. */
test.use({ serviceWorkers: 'block' });

/* Только Chromium, и это осознанно. В headless WebKit автоплей blob-аудио
   после сетевого await — лотерея (жест «протух» к моменту play()), а опция
   serviceWorkers: 'block' там вообще не действует. Спека, которая краснеет
   через раз, хуже отсутствующей: движок Safari по этой карточке закрыт
   полевым чеком на живом iPhone, он записан в хендофф, § «Линия VOICE». */
test.skip(
  ({ browserName }) => browserName !== 'chromium',
  'Web Audio и автоплей в headless WebKit недетерминированы — iPhone закрывается полем, а не флаком в CI'
);

/**
 * PCM 24 кГц / 16 бит / моно — ровно то, что отдаёт Gemini TTS и чего ждёт
 * pcmToWav. Частота гуляет, огибающая режет тон на «слоги»: без пауз спектр
 * стоял бы ровной полкой, и проверка «столбики двигаются» прошла бы на
 * ключевых кадрах отката, ничего не доказав.
 * @param {number} seconds
 */
function tonePcmBase64(seconds) {
  const sampleRate = 24000;
  const total = Math.round(sampleRate * seconds);
  const buf = Buffer.alloc(total * 2);
  for (let i = 0; i < total; i++) {
    const t = i / sampleRate;
    const freq = 200 + 700 * Math.abs(Math.sin(t * 1.3));
    const env = 0.2 + 0.8 * Math.abs(Math.sin(t * 4));
    buf.writeInt16LE(Math.round(env * 9000 * Math.sin(2 * Math.PI * freq * t)), i * 2);
  }
  return buf.toString('base64');
}

/** Короткая реплика: спека не должна ждать дольше, чем длится проверка. */
const TONE = tonePcmBase64(2);

const REPORT = {
  score: 87,
  summary: 'Объём вырос на двенадцать процентов, жим держит план.',
  pros: ['Три тренировки', 'Жим +5 кг'],
  cons: ['Мало сна', 'Пропущены ноги'],
};

async function waitForBoot(page) {
  await page.waitForFunction(
    () => {
      const nav = document.getElementById('nav');
      return (
        (nav && nav.offsetHeight > 0) ||
        document.getElementById('loading')?.classList.contains('hidden')
      );
    },
    { timeout: 12000 }
  );
}

/** Онбординг закрывается через собственный слой БД — оверлей z-9000 иначе ловит клики. */
async function openApp(page) {
  await page.goto(BASE);
  await waitForBoot(page);
  const flagged = await page.evaluate(async () => {
    const { DB } = await import('/js/db.js');
    if (await DB.Settings.get('onboarding-complete', false)) return false;
    await DB.Settings.set('onboarding-complete', true);
    return true;
  });
  if (flagged) {
    await page.reload();
    await waitForBoot(page);
  }
  await page.waitForFunction(() => !document.getElementById('onboarding-overlay'), {
    timeout: 8000,
  });
}

/**
 * Экран P.A.N.D.A. Core со стабами на оба запроса.
 * @param {import('@playwright/test').Page} page
 * @param {{ tts?: 'ok' | 'fail' }} [opts]
 */
async function openIntel(page, { tts = 'ok' } = {}) {
  await page.route('**/api/coach/weekly-report', (route) =>
    route.fulfill({ json: { report: REPORT } })
  );
  await page.route('**/api/coach/tts', (route) =>
    tts === 'ok'
      ? route.fulfill({ json: { success: true, audioBase64: TONE } })
      : route.fulfill({ status: 500, json: { error: 'tts down' } })
  );

  await openApp(page);

  // Дефолт установки — airgap, в нём privacy-гейт рубит запрос до сети и
  // озвучки не будет вовсе. Ключа при этом всё равно не требуется: оба
  // маршрута перехвачены выше.
  await page.evaluate(async () => {
    const P = await import('/js/privacy.store.js');
    await P.setPrivacyMode('cloud');
    await P.setAiEnabled(true);
    window.Nav.go('s-intel');
  });
  await page.waitForSelector('[data-action="intel:weekly"]', { timeout: 12000 });
}

/** Текст ленты логов — источник правды о том, что видел экран. */
function logText(page) {
  return page.evaluate(() => document.getElementById('intel-logs-container')?.textContent || '');
}

test.describe('VOICE-2 — волна озвучки', () => {
  test('волна поднимается в слоте отчёта и уходит вместе с репликой', async ({ page }) => {
    await openIntel(page);
    await page.locator('[data-action="intel:weekly"]').click();

    const wave = page.locator('.intel-report-overlay .intel-voice-slot > .intel-voice-wave');
    await expect(wave, 'волна не смонтировалась в слот оверлея сводки').toHaveCount(1, {
      timeout: 12000,
    });
    await expect(wave.locator('.intel-voice-wave-bar')).toHaveCount(5);

    /* Мина карточки: `.intel-wave-bar` — это волна кнопки отправки. Визуализатор
       обязан её не видеть, иначе на её столбиках навсегда останется инлайновый
       transform от чужого кадрового цикла. */
    const hijacked = await page.evaluate(
      () =>
        Array.from(document.querySelectorAll('.intel-btn-send .intel-wave-bar')).filter(
          (b) => b.style.transform !== ''
        ).length
    );
    expect(hijacked, 'визуализатор угнал столбики кнопки отправки').toBe(0);

    await expect(page.locator('.intel-voice-wave'), 'волна пережила реплику').toHaveCount(0, {
      timeout: 15000,
    });
  });

  test('столбики ходят по звуку, а не по ключевым кадрам', async ({ page }) => {
    await openIntel(page);
    await page.locator('[data-action="intel:weekly"]').click();
    await expect(page.locator('.intel-report-overlay .intel-voice-wave')).toHaveCount(1, {
      timeout: 12000,
    });

    /* `is-reactive` вешается только когда AudioContext действительно поднялся
       и анализатор подключён. Нет его — волна честно идёт ключевыми кадрами,
       и проверять реактивность нечем: это пропуск, а не зелёный прогон. */
    const reactive = await page
      .locator('.intel-voice-wave.is-reactive')
      .waitFor({ state: 'attached', timeout: 6000 })
      .then(
        () => true,
        () => false
      );
    test.skip(
      !reactive,
      'AudioContext в этом раннере не поднялся — волна на ключевых кадрах, реактивность недоказуема'
    );

    const samples = await page.evaluate(async () => {
      const read = () =>
        Array.from(document.querySelectorAll('.intel-report-overlay .intel-voice-wave-bar'))
          .map((b) => /** @type {HTMLElement} */ (b).style.transform)
          .join('|');
      const out = [];
      for (let i = 0; i < 12; i++) {
        out.push(read());
        await new Promise((r) => setTimeout(r, 60));
      }
      return out;
    });

    expect(
      new Set(samples).size,
      `высоты не менялись за 12 замеров: ${samples[0]}`
    ).toBeGreaterThanOrEqual(3);
    expect(
      samples.some((s) => new Set(s.split('|')).size > 1),
      'все пять столбиков ходят одним телом — полосы спектра схлопнулись в одно среднее'
    ).toBeTruthy();
  });

  test('сбой озвучки не оставляет волну и не запирает вторую попытку', async ({ page }) => {
    await openIntel(page, { tts: 'fail' });
    await page.locator('[data-action="intel:weekly"]').click();

    await expect(page.locator('.intel-report-overlay')).toHaveCount(1, { timeout: 12000 });
    await expect.poll(() => logText(page), { timeout: 12000 }).toContain('Voice synthesis failed');
    await expect(
      page.locator('.intel-voice-wave'),
      'волна осталась висеть после сбоя TTS'
    ).toHaveCount(0);

    /* До VOICE-2 путь ошибки не снимал _isSpeaking на всех ветках, и вторая
       попытка озвучки молча выходила первой строкой — снаружи это выглядело
       как «озвучка сломалась навсегда до перезагрузки». */
    await page.locator('.intel-report-overlay [data-action="intel:closeReport"]').click();
    await page.locator('[data-action="intel:weekly"]').click();
    await expect
      .poll(() => logText(page).then((t) => (t.match(/Synthesizing coach voice/g) || []).length), {
        timeout: 12000,
      })
      .toBeGreaterThanOrEqual(2);
  });
});
