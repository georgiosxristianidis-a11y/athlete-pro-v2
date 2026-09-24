import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { coachSchema, ttsSchema } from '../routes/coach.js';

const validMsg = { role: 'user', content: 'Hello coach' };

function parse(body) {
  return coachSchema.safeParse(body);
}

describe('coachSchema — body shape', () => {
  test('null body → rejected', () => {
    assert.equal(parse(null).success, false);
  });

  test('array body → rejected', () => {
    assert.equal(parse([validMsg]).success, false);
  });

  test('string body → rejected', () => {
    assert.equal(parse('hello').success, false);
  });

  test('missing messages field → rejected', () => {
    assert.equal(parse({}).success, false);
  });

  test('messages not an array → rejected', () => {
    assert.equal(parse({ messages: 'hi' }).success, false);
  });

  test('empty messages array → rejected', () => {
    assert.equal(parse({ messages: [] }).success, false);
  });

  test('more than 40 messages → rejected', () => {
    const messages = Array.from({ length: 41 }, () => validMsg);
    assert.equal(parse({ messages }).success, false);
  });

  test('exactly 40 messages → accepted', () => {
    const messages = Array.from({ length: 40 }, () => validMsg);
    assert.equal(parse({ messages }).success, true);
  });
});

describe('coachSchema — message items', () => {
  test('non-object message → rejected', () => {
    assert.equal(parse({ messages: ['hi'] }).success, false);
  });

  test('null message → rejected', () => {
    assert.equal(parse({ messages: [null] }).success, false);
  });

  test('invalid role → rejected', () => {
    const r = parse({ messages: [{ role: 'system', content: 'x' }] });
    assert.equal(r.success, false);
  });

  test('assistant role → accepted', () => {
    const r = parse({ messages: [{ role: 'assistant', content: 'x' }] });
    assert.equal(r.success, true);
  });

  test('non-string content → rejected', () => {
    const r = parse({ messages: [{ role: 'user', content: 42 }] });
    assert.equal(r.success, false);
  });

  test('empty content → rejected', () => {
    const r = parse({ messages: [{ role: 'user', content: '' }] });
    assert.equal(r.success, false);
  });

  test('content over 12000 chars → rejected', () => {
    const r = parse({ messages: [{ role: 'user', content: 'a'.repeat(12001) }] });
    assert.equal(r.success, false);
  });

  test('content exactly 12000 chars → accepted', () => {
    const r = parse({ messages: [{ role: 'user', content: 'a'.repeat(12000) }] });
    assert.equal(r.success, true);
  });

  test('bad message deep in array → rejected', () => {
    const r = parse({ messages: [validMsg, validMsg, { role: 'user', content: '' }] });
    assert.equal(r.success, false);
  });
});

describe('coachSchema — context fields and defaults', () => {
  test('minimal valid payload → accepted with defaults', () => {
    const r = parse({ messages: [validMsg] });
    assert.equal(r.success, true);
    assert.equal(r.data.snapshot, undefined);
    assert.deepEqual(r.data.images, []);
    assert.equal(r.data.engine, 'gemini');
  });

  test('full valid payload → accepted', () => {
    const r = parse({
      messages: [validMsg],
      engine: 'gemini',
      customKey: 'k',
    });
    assert.equal(r.success, true);
    assert.equal(r.data.engine, 'gemini');
  });

  /* CORE-4: сырые поля БД до промпта не доезжают — схема их срезает, контекст
     несёт только снимок (`test/coach-snapshot.test.js`). */
  test('сырые workouts/fatigue/topLifts/profile срезаются, не проходят', () => {
    const r = parse({
      messages: [validMsg],
      workouts: [{ type: 'push' }],
      fatigue: { chest: 40 },
      topLifts: [{ exercise: 'Bench', oneRM: 100 }],
      profile: { name: 'x', 'athlete-photo': 'data:image/jpeg;base64,AAAA' },
    });
    assert.equal(r.success, true);
    for (const k of ['workouts', 'fatigue', 'topLifts', 'profile', 'longTermStats']) {
      assert.equal(k in r.data, false, `${k} дошёл до промпта мимо снимка`);
    }
  });

  test('unknown extra fields are stripped, not fatal', () => {
    const r = parse({ messages: [validMsg], evil: 'payload' });
    assert.equal(r.success, true);
    assert.equal('evil' in r.data, false);
  });
});

/* CORE-2: `engine: z.string()` пускал что угодно — не-'gemini' уходило в
   ветку Anthropic независимо от значения (`isGemini = engine === 'gemini'`),
   а `keyLooksValid` нормализует неизвестное имя обратно в gemini. Сегодня без
   `ANTHROPIC_API_KEY` на Vercel (AI-1) это 500, а не счёт — но схема не
   должна полагаться на то, что у соседнего провайдера просто нет ключа. */
describe('coachSchema — engine ограничен списком провайдеров', () => {
  test("engine: 'gemini' и 'anthropic' — приняты", () => {
    assert.equal(parse({ messages: [validMsg], engine: 'gemini' }).success, true);
    assert.equal(parse({ messages: [validMsg], engine: 'anthropic' }).success, true);
  });

  test('engine: произвольная строка — отвергнута, не тихо нормализована', () => {
    assert.equal(parse({ messages: [validMsg], engine: 'openai' }).success, false);
  });

  test('engine отсутствует — дефолт gemini, как раньше', () => {
    const r = parse({ messages: [validMsg] });
    assert.equal(r.success, true);
    assert.equal(r.data.engine, 'gemini');
  });
});

/* Карточка VOICE-1. «Ключа нет» приезжает с фронта как null — DB.Settings.get
   отдаёт именно его, а не undefined. При `customKey: z.string().optional()`
   схема резала такой запрос 400-м, и озвучка молчала даже там, где серверный
   ключ Gemini был на месте. */
describe('ttsSchema — customKey отсутствует', () => {
  const parseTts = (body) => ttsSchema.safeParse(body);

  test('customKey: null → принят (ключа нет, сервер берёт свой)', () => {
    const r = parseTts({ text: 'Привет', customKey: null });
    assert.equal(r.success, true);
    assert.ok(!r.data.customKey, 'null не должен подменять серверный ключ');
  });

  test('поля customKey нет вовсе → принят', () => {
    assert.equal(parseTts({ text: 'Привет' }).success, true);
  });

  test('customKey строкой → принят и доезжает до маршрута', () => {
    const r = parseTts({ text: 'Привет', customKey: 'AIzaKEY' });
    assert.equal(r.success, true);
    assert.equal(r.data.customKey, 'AIzaKEY');
  });

  test('customKey числом → отвергнут', () => {
    assert.equal(parseTts({ text: 'Привет', customKey: 42 }).success, false);
  });

  test('пустой text → отвергнут', () => {
    assert.equal(parseTts({ text: '' }).success, false);
  });
});

/* CORE-2: без .max() озвучка любой длины — второй платный вызов TTS без
   потолка после и так неограниченного текстового ответа. */
describe('ttsSchema — text ограничен длиной (CORE-2)', () => {
  const parseTts = (body) => ttsSchema.safeParse(body);

  test('2000 символов — приняты (граница)', () => {
    assert.equal(parseTts({ text: 'a'.repeat(2000) }).success, true);
  });

  test('2001 символ — отвергнут', () => {
    assert.equal(parseTts({ text: 'a'.repeat(2001) }).success, false);
  });
});
