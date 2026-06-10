'use strict';
import anthropic from './anthropicClient.js';
import gemini from './geminiClient.js';
import { logInfo, logError } from './logger.js';

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

    try {
      if (isGemini) {
        const modelConfig = { 
          model: 'gemini-2.5-flash',
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

        const result = await chat.sendMessageStream(parts);
        for await (const chunk of result.stream) {
          const text = chunk.text();
          onChunk(text);
        }

      } else {
        const stream = anthropic.messages.stream({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 1024,
          system,
          messages,
        });
        stream.on('text', (text) => onChunk(text));
        await stream.finalMessage();
      }

      logInfo(req, 'ai_request_end', `Finished AI stream`, { duration: Date.now() - start });
    } catch (err) {
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
           model = new GoogleGenerativeAI(customKey).getGenerativeModel({ model: 'gemini-2.5-flash' });
        } else {
           model = gemini.getModel('gemini-2.5-flash');
        }
        const result = await model.generateContent(`${system}\n\n${prompt}\n\nReturn ONLY raw JSON.`);
        return result.response.text();
      } else {
        const response = await anthropic.messages.create({
          model: 'claude-3-5-sonnet-20241022',
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
