import express from 'express';

import { config } from './config.js';
import { ChatInputSchema, chatFlow } from './flows/chatFlow.js';
import { initializeMedicalKnowledgeMcp } from './mcp/medicalKnowledgeMcp.js';
import { PATIENT_DATA_TOOL_NAMES } from './mcp/patientDataMcp.js';
import { DoctorCaseChatInputSchema, doctorCaseChatFlow } from './flows/doctorCaseChatFlow.js';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '256kb' }));

app.get('/health', (_request, response) => {
  response.json({
    status: 'ok',
    model: config.geminiModel,
    mcp: {
      status: 'ready',
      tools: ['search_medical_knowledge', ...PATIENT_DATA_TOOL_NAMES],
    },
  });
});

app.post('/chat', async (request, response) => {
  if (
    typeof request.body?.patientAccessToken !== 'string' ||
    !request.body.patientAccessToken.trim()
  ) {
    response.status(401).json({ detail: 'Patient authentication context is required.' });
    return;
  }
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

app.post('/doctor-case-chat', async (request, response) => {
  if (request.headers['x-django-service-token'] !== config.djangoServiceToken) { response.status(401).json({ detail: 'Service authentication is required.' }); return; }
  const parsed = DoctorCaseChatInputSchema.safeParse(request.body);
  if (!parsed.success) { response.status(400).json({ detail: parsed.error.flatten() }); return; }
  try { response.json(await doctorCaseChatFlow(parsed.data)); }
  catch (error) { console.error('doctor case chat failed', error); response.status(502).json({ detail: 'AI 응답을 생성하지 못했습니다.' }); }
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
