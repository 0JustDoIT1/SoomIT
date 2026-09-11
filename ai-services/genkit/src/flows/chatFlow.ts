import { z } from 'genkit';

import { ai } from '../index.js';
import { patientTools } from '../tools/djangoTools.js';

const MessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(12000),
});

export const ChatInputSchema = z.object({
  message: z.string().min(1).max(4000),
  history: z.array(MessageSchema).max(20).default([]),
});

export const ChatOutputSchema = z.object({
  answer: z.string(),
});

const SYSTEM_PROMPT = `당신은 폐암 환자와 보호자를 위한 대화형 안내 챗봇입니다.
- 일반 질문은 직접 답합니다.
- 폐암 치료, 병기, 바이오마커, 진료지침 질문은 searchMedicalKnowledge를 사용하고 검색된 문서 내용에만 근거해 답합니다.
- 의학적 주장 뒤에는 [문서명 #청크번호] 형식으로 근거를 표시합니다.
- 치료 판정은 하지 않습니다. 확정된 Rule Engine 또는 의료진 결정을 설명할 수만 있습니다.
- 환자가 이해하기 쉬운 말로 설명하고 진단이나 처방을 확정적으로 말하지 않습니다.
- 개인 검사 결과, 예약, 처방처럼 환자 DB 확인이 필요한 질문은 현재 확인할 수 없다고 명확히 말합니다.
- 도구 오류나 자료 부족을 숨기지 말고 확인할 수 없다고 말합니다.
- 사용자가 쓴 언어로 답합니다.`;

export const chatFlow = ai.defineFlow(
  {
    name: 'chatFlow',
    inputSchema: ChatInputSchema,
    outputSchema: ChatOutputSchema,
  },
  async ({ message, history }) => {
    const transcript = history.map((item) => `${item.role}: ${item.content}`).join('\n');

    const { text } = await ai.generate({
      system: SYSTEM_PROMPT,
      prompt: `${transcript ? `이전 대화:\n${transcript}\n\n` : ''}사용자: ${message}`,
      tools: patientTools,
      maxTurns: 6,
      config: { temperature: 0.2 },
    });

    return { answer: text };
  },
);
