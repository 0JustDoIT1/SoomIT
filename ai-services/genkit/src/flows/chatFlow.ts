import { z } from 'genkit';

import { ai } from '../index.js';
import {
  getMedicalKnowledgeMcpTools,
  MEDICAL_KNOWLEDGE_MCP_TOOL,
} from '../mcp/medicalKnowledgeMcp.js';
import { createPatientDataMcpBridge } from '../mcp/patientDataMcp.js';

const MessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(12000),
});

export const ChatInputSchema = z.object({
  message: z.string().min(1).max(4000),
  history: z.array(MessageSchema).max(20).default([]),
  patientAccessToken: z.string().min(1),
});

export const ChatOutputSchema = z.object({
  answer: z.string(),
});

const SYSTEM_PROMPT = `당신은 폐암 환자와 보호자를 위한 대화형 안내 챗봇입니다.
- 일반 질문에는 직접 답합니다.
- 폐암 치료, 병기, 바이오마커, 진료지침 질문에는 ${MEDICAL_KNOWLEDGE_MCP_TOOL} MCP 도구를 사용하고 검색된 문서 내용에만 근거해 답합니다.
- 의학적 주장 뒤에는 [문서명 #청크번호] 형식으로 근거를 표시합니다.
- 개인 정보 질문에는 가장 관련 있는 환자 데이터 도구 하나를 우선 사용합니다.
- treatment가 null이면 "현재 확정된 치료 결정이 없습니다."라고 안내합니다.
- medications가 빈 배열이면 "현재 등록된 복약 정보가 없습니다."라고 안내합니다.
- symptoms가 빈 배열이면 "현재 등록된 증상 기록이 없습니다."라고 안내합니다.
- labs가 빈 배열이면 "현재 등록된 검사실 결과가 없습니다."라고 안내합니다.
- 정상적인 null 또는 빈 배열을 오류로 설명하지 않습니다.
- 도구가 반환한 구조화된 조회 결과만 사용하고 환자 식별자를 추측하지 않습니다.
- 치료 결정을 내리지 않습니다. 확정된 Rule Engine 또는 의료진의 결정을 설명할 수만 있습니다.
- 환자가 이해하기 쉬운 말로 설명하고 진단이나 처방을 확정적으로 말하지 않습니다.
- 도구 오류나 자료 부족을 숨기지 말고 확인할 수 없다고 말합니다.
- 사용자가 쓴 언어로 답합니다.`;

export const chatFlow = ai.defineFlow(
  {
    name: 'chatFlow',
    inputSchema: ChatInputSchema,
    outputSchema: ChatOutputSchema,
  },
  async ({ message, history, patientAccessToken }) => {
    const transcript = history
      .map((item) => `${item.role}: ${item.content}`)
      .join('\n');
    const [knowledgeTools, patientBridge] = await Promise.all([
      getMedicalKnowledgeMcpTools(),
      createPatientDataMcpBridge(patientAccessToken),
    ]);

    try {
      const { text } = await ai.generate({
        system: SYSTEM_PROMPT,
        prompt: `${transcript ? `이전 대화:\n${transcript}\n\n` : ''}사용자: ${message}`,
        tools: [...knowledgeTools, ...patientBridge.tools],
        maxTurns: 6,
        config: { temperature: 0.2 },
      });
      return { answer: text };
    } finally {
      await patientBridge.close();
    }
  },
);
