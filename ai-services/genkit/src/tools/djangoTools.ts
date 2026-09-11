import { z } from 'genkit';

import { ai } from '../index.js';
import { config } from '../config.js';
import { fetchJson } from '../http.js';

export const searchMedicalKnowledgeTool = ai.defineTool(
  {
    name: 'searchMedicalKnowledge',
    description:
      '폐암 진료지침을 pgvector로 검색해 관련 원문 청크를 반환한다. 폐암 치료, 병기, 바이오마커 질문에 사용한다.',
    inputSchema: z.object({
      question: z.string().min(1).max(2000),
      topK: z.number().int().min(1).max(10).default(5),
    }),
    outputSchema: z.unknown(),
  },
  async ({ question, topK }) =>
    fetchJson('Django knowledge search', `${config.djangoApiUrl}/api/ai/knowledge/search/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.djangoServiceToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: question, top_k: topK }),
    }),
);

export const patientTools = [searchMedicalKnowledgeTool];
