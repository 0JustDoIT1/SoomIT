import express from 'express';

import { config } from './config.js';
import { ChatInputSchema, chatFlow } from './flows/chatFlow.js';
import { initializeMedicalKnowledgeMcp } from './mcp/medicalKnowledgeMcp.js';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '256kb' }));

app.get('/health', (_request, response) => {
  response.json({
    status: 'ok',
    model: config.geminiModel,
    mcp: { status: 'ready', tools: ['search_medical_knowledge'] },
  });
});

app.post('/chat', async (request, response) => {
  const parsed = ChatInputSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ detail: parsed.error.flatten() });
    return;
  }

  try {
    const result = await chatFlow(parsed.data);
    response.json(result);
  } catch (error) {
    console.error('chat request failed', error);
    response.status(502).json({ detail: '챗봇 답변을 생성하지 못했습니다.' });
  }
});

async function startServer(): Promise<void> {
  await initializeMedicalKnowledgeMcp();
  app.listen(config.port, '0.0.0.0', () => {
    console.log(`SoomIT Genkit listening on ${config.port}`);
  });
}

startServer().catch((error) => {
  console.error('Genkit startup failed', error);
  process.exitCode = 1;
});
