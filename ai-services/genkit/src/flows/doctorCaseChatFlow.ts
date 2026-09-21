import { z } from 'genkit';
import { ai } from '../index.js';
import { getMedicalKnowledgeMcpTools } from '../mcp/medicalKnowledgeMcp.js';

const Message = z.object({ role: z.enum(['user', 'assistant']), content: z.string().min(1).max(12000) });
export const DoctorCaseChatInputSchema = z.object({
  message: z.string().min(1).max(4000), history: z.array(Message).max(20).default([]),
  case_context: z.record(z.string(), z.unknown()),
});
export const doctorCaseChatFlow = ai.defineFlow({ name: 'doctorCaseChatFlow', inputSchema: DoctorCaseChatInputSchema, outputSchema: z.object({ answer: z.string(), context_used: z.array(z.string()) }) }, async ({ message, history, case_context }) => {
  const tools = await getMedicalKnowledgeMcpTools();
  const contextUsed = Object.entries(case_context).filter(([, value]) => value !== null && (!Array.isArray(value) || value.length)).map(([key]) => key);
  const transcript = history.map(item => `${item.role}: ${item.content}`).join('\n');
  const { text } = await ai.generate({
    system: 'You are a clinician CDSS assistant. Use confirmed clinical_results as highest priority. Describe ai_results only as AI candidates, never confirmed findings. Never invent data, diagnosis, stage, biomarker, or treatment. Clearly distinguish confirmed and pending data. Use supplied case_context as the sole patient source. For general medical meaning, you may use the medical knowledge tool; do not use it when case context alone answers. Answer in Korean and support clinician review, not final decisions.',
    prompt: `${transcript ? `History:\n${transcript}\n\n` : ''}Case context:\n${JSON.stringify(case_context)}\n\nQuestion: ${message}`,
    tools, maxTurns: 4, config: { temperature: 0.2 },
  });
  return { answer: text, context_used: contextUsed };
});
