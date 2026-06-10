'use strict';
import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

if (!apiKey) {
  console.warn('[gemini] GOOGLE_GENERATIVE_AI_API_KEY not set in .env');
}

const genAI = new GoogleGenerativeAI(apiKey || 'dummy-key');

/**
 * Gemini Client abstraction for consistency.
 */
export const gemini = {
  apiKey,
  /**
   * @param {string|Object} config 
   * @returns {import('@google/generative-ai').GenerativeModel}
   */
  getModel(config = 'gemini-2.5-flash') {
    const options = typeof config === 'string' ? { model: config } : config;
    return genAI.getGenerativeModel(options);
  }
};

export default gemini;
