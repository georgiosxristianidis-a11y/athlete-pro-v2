'use strict';
import Anthropic from '@anthropic-ai/sdk';
import anthropic from './anthropicClient.js';
import gemini from './geminiClient.js';
import { logInfo, logError } from './logger.js';
import { DEFAULT_AI_ENGINE, resolveGeminiModel } from '../js/shared/ai-engine.js';

const STREAM_TIMEOUT_MS = Number(process.env.COACH_STREAM_TIMEOUT_MS) || 120000;
// CORE-2: у Anthropic max_tokens стоял (1024/1500), у Gemini — нигде. Без
// потолка сгенерированного ответа стоимость запроса не ограничена ничем, кроме
// таймаута по времени, а не по объёму.
const GEMINI_MAX_OUTPUT_TOKENS_STREAM = Number(process.env.GEMINI_MAX_OUTPUT_TOKENS_STREAM) || 1024;
const GEMINI_MAX_OUTPUT_TOKENS_JSON = Number(process.env.GEMINI_MAX_OUTPUT_TOKENS_JSON) || 1500;

// Models are config, not literals scattered across calls. Override via env.
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';
const GEMINI_MODEL = resolveGeminiModel(process.env.GEMINI_MODEL);

/**
 * Разрыв клиента — сигнал `res`, не `req` (CORE-2). `req.on('close')`
 * испускается, когда тело запроса дочитано целиком — для JSON POST это
 * происходит до входа в хендлер (лимитер асинхронный), то есть событие уже
 * прошло к моменту, когда этот код успевает на него подписаться: реальный
 * разрыв клиента посреди генерации никогда не долетал. `res.on('close')`
 * держится, пока жив ответ, и стреляет ровно на разрыв соединения.
 * @param {import('express').Response|undefined} res
 * @param {AbortController} controller
 */
function _abortOnDisconnect(res, controller) {
  if (res) res.on('close', () => controller.abort());
}

/** Resolve Anthropic client: BYOK customKey > default singleton. Throws 500 if no key at all. */
function _anthropicClient(customKey) {
  if (customKey) return new Anthropic({ apiKey: customKey });
  if (!process.env.ANTHROPIC_API_KEY) {
    const err = new Error('ANTHROPIC_API_KEY not set in .env');
    err.status = 500;
    err.code = 'NO_API_KEY';
    throw err;
  }
  return anthropic;
}

/** Watchdog: rejects after STREAM_TIMEOUT_MS and aborts the in-flight request. */
function _withTimeout(promise, controller) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      const err = new Error(`AI stream timed out after ${Math.round(STREAM_TIMEOUT_MS / 1000)}s`);
      err.code = 'AI_TIMEOUT';
      err.status = 504;
      reject(err);
    }, STREAM_TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Читает поток Gemini с таймаутом по БЕЗДЕЙСТВИЮ, не только по первому байту
 * (CORE-2). `_withTimeout` вокруг `chat.sendMessageStream(...)` укладывается
 * только на промис, который отдаёт сам асинхронный итератор — начало
 * генерации; цикл `for await` дальше ничем не ограничен. Модель, зависшая
 * между чанками, стримила бы вечно. Таймер сбрасывается на каждый чанк —
 * это окно тишины, а не потолок всей генерации.
 * @param {AsyncIterable<any>} stream
 * @param {AbortController} controller
 * @param {(text: string) => void} onChunk
 * @param {number} timeoutMs
 */
async function _readGeminiStream(stream, controller, onChunk, timeoutMs) {
  let timer;
  let timedOut = false;
  const bump = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
  };
  bump();
  try {
    for await (const chunk of stream) {
      if (controller.signal.aborted) break;
      bump();
      // Gemini 3 emits thought chunks without text — `.text` is a getter and may be undefined.
      const text = chunk.text;
      if (text) onChunk(text);
    }
  } finally {
    clearTimeout(timer);
  }
  if (timedOut) {
    const err = new Error(`AI stream idle-timed out after ${Math.round(timeoutMs / 1000)}s`);
    err.code = 'AI_TIMEOUT';
    err.status = 504;
    throw err;
  }
}

/**
 * @typedef {Object} AIResponse
 * @property {string} text
 * @property {Object} [usage]
 */

/**
 * Unified AI Orchestrator for Athlete Pro.
 * Handles model switching, streaming, and prompt injection.
 */
export const AIOrchestrator = {
  /**
   * Stream a response from the selected engine.
   * @param {Object} opts
   * @param {string} opts.system - System prompt
   * @param {Array} opts.messages - User messages
   * @param {Array} [opts.images] - Optional base64 images (Vision)
   * @param {'anthropic'|'gemini'} [opts.engine]
   * @param {Function} opts.onChunk - Callback for each text chunk
   * @param {import('express').Request} [req] - For correlation logging
   * @param {import('express').Response} [res] - For disconnect detection (CORE-2)
   */
   async streamResponse({ system, messages, images = [], engine = DEFAULT_AI_ENGINE, customKey, onChunk }, req, res) {
    const isGemini = engine === 'gemini';
    const start = Date.now();

    logInfo(req, 'ai_request_start', `Starting AI stream with ${engine}`);

    // Abort upstream work when the client disconnects (token-burn protection)
    const controller = new AbortController();
    _abortOnDisconnect(res, controller);

    try {
      if (isGemini) {
        const history = messages.slice(0, -1).map(m => ({
          role: m.role === 'user' ? 'user' : 'model',
          parts: [{ text: m.content }]
        }));

        const chat = gemini.client(customKey).chats.create({
          model: GEMINI_MODEL,
          config: {
            systemInstruction: { parts: [{ text: system }] },
            abortSignal: controller.signal,
            maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS_STREAM
          },
          history
        });

        // If we have images, we add them as parts to the last message
        const lastMsg = messages[messages.length - 1].content;
        const parts = [{ text: lastMsg }];

        images.forEach(img => {
          if (img) {
            parts.push({
              inlineData: {
                mimeType: "image/png",
                data: img.split(',')[1] || img // handle both raw base64 and data URLs
              }
            });
          }
        });

        const stream = await _withTimeout(chat.sendMessageStream({ message: parts }), controller);
        await _readGeminiStream(stream, controller, onChunk, STREAM_TIMEOUT_MS);

      } else {
        const stream = _anthropicClient(customKey).messages.stream({
          model: CLAUDE_MODEL,
          max_tokens: 1024,
          system,
          messages,
        }, { signal: controller.signal });
        stream.on('text', (text) => onChunk(text));
        await _withTimeout(stream.finalMessage(), controller);
      }

      logInfo(req, 'ai_request_end', `Finished AI stream`, { duration: Date.now() - start });
    } catch (err) {
      if (controller.signal.aborted && err.code !== 'AI_TIMEOUT') {
        logInfo(req, 'ai_request_aborted', 'Client disconnected — upstream stream aborted', {
          duration: Date.now() - start,
        });
        return;
      }
      logError(req, 'ai_request_failed', err.message, { stack: err.stack });
      throw err;
    }
  },

  /**
   * Generate a non-streaming JSON response.
   * @param {import('express').Request} [req] - For correlation logging
   * @param {import('express').Response} [res] - For disconnect detection (CORE-2)
   */
  async generateJSON({ system, prompt, engine = DEFAULT_AI_ENGINE, customKey }, req, res) {
    const isGemini = engine === 'gemini';
    logInfo(req, 'ai_json_request', `Generating JSON with ${engine}`);

    // CORE-2: раньше ни таймаута, ни отмены — брошенный клиент оплачивал
    // полный ответ модели независимо от того, дождался он его или нет.
    const controller = new AbortController();
    _abortOnDisconnect(res, controller);

    try {
      if (isGemini) {
        const result = await _withTimeout(
          gemini.client(customKey).models.generateContent({
            model: GEMINI_MODEL,
            contents: `${system}\n\n${prompt}\n\nReturn ONLY raw JSON.`,
            config: { abortSignal: controller.signal, maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS_JSON }
          }),
          controller
        );
        return result.text || '';
      } else {
        const response = await _withTimeout(
          _anthropicClient(customKey).messages.create(
            {
              model: CLAUDE_MODEL,
              max_tokens: 1500,
              system,
              messages: [{ role: 'user', content: prompt }]
            },
            { signal: controller.signal }
          ),
          controller
        );
        return response.content[0]?.text || '';
      }
    } catch (err) {
      logError(req, 'ai_json_failed', err.message, { code: err.code });
      throw err;
    }
  }
};
