'use strict';
import Anthropic from '@anthropic-ai/sdk';
import anthropic from './anthropicClient.js';
import gemini from './geminiClient.js';
import { logInfo, logError } from './logger.js';

const STREAM_TIMEOUT_MS = Number(process.env.COACH_STREAM_TIMEOUT_MS) || 120000;

// Models are config, not literals scattered across calls. Override via env.
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

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
   */
   async streamResponse({ system, messages, images = [], engine = 'anthropic', customKey, onChunk }, req) {
    const isGemini = engine === 'gemini';
    const start = Date.now();

    logInfo(req, 'ai_request_start', `Starting AI stream with ${engine}`);

    // Abort upstream work when the client disconnects (token-burn protection)
    const controller = new AbortController();
    if (req) req.on('close', () => controller.abort());

    try {
      if (isGemini) {
        const modelConfig = { 
          model: GEMINI_MODEL,
          systemInstruction: { parts: [{ text: system }] }
        };

        let model;
        if (customKey) {
           const { GoogleGenerativeAI } = await import('@google/generative-ai');
           model = new GoogleGenerativeAI(customKey).getGenerativeModel(modelConfig);
        } else {
           model = gemini.getModel(modelConfig);
        }

        const history = messages.slice(0, -1).map(m => ({
          role: m.role === 'user' ? 'user' : 'model',
          parts: [{ text: m.content }]
        }));

        const chat = model.startChat({ history });

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

        const result = await _withTimeout(chat.sendMessageStream(parts), controller);
        for await (const chunk of result.stream) {
          if (controller.signal.aborted) break;
          const text = chunk.text();
          onChunk(text);
        }

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
   */
  async generateJSON({ system, prompt, engine = 'anthropic', customKey }, req) {
    const isGemini = engine === 'gemini';
    logInfo(req, 'ai_json_request', `Generating JSON with ${engine}`);

    try {
      if (isGemini) {
        let model;
        if (customKey) {
           const { GoogleGenerativeAI } = await import('@google/generative-ai');
           model = new GoogleGenerativeAI(customKey).getGenerativeModel({ model: GEMINI_MODEL });
        } else {
           model = gemini.getModel(GEMINI_MODEL);
        }
        const result = await model.generateContent(`${system}\n\n${prompt}\n\nReturn ONLY raw JSON.`);
        return result.response.text();
      } else {
        const response = await _anthropicClient(customKey).messages.create({
          model: CLAUDE_MODEL,
          max_tokens: 1500,
          system,
          messages: [{ role: 'user', content: prompt }]
        });
        return response.content[0]?.text || '';
      }
    } catch (err) {
      logError(req, 'ai_json_failed', err.message);
      throw err;
    }
  }
};
