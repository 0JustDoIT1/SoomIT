import { googleAI } from '@genkit-ai/google-genai';
import { genkit } from 'genkit';

import { config } from './config.js';

export const ai = genkit({
  plugins: [googleAI({ apiKey: process.env.GEMINI_API_KEY })],
  model: googleAI.model(config.geminiModel),
});
