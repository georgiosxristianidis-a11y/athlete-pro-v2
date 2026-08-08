'use strict';
import { GoogleGenAI } from '@google/genai';

const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

if (!apiKey) {
  console.warn('[gemini] GOOGLE_GENERATIVE_AI_API_KEY not set in .env');
}

const defaultClient = new GoogleGenAI({ apiKey: apiKey || 'dummy-key' });

/**
 * Gemini Client abstraction for consistency.
 */
export const gemini = {
  apiKey,
  /**
   * Resolve a client: BYOK customKey > default singleton.
   * @param {string} [customKey]
   * @returns {import('@google/genai').GoogleGenAI}
   */
  client(customKey) {
    return customKey ? new GoogleGenAI({ apiKey: customKey }) : defaultClient;
  }
};

export default gemini;
