import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? '8080'),
  geminiModel: process.env.GEMINI_MODEL?.trim() || 'gemini-3.8-flash',
  djangoApiUrl: required('DJANGO_API_URL').replace(/\/$/, ''),
  djangoServiceToken: required('DJANGO_SERVICE_TOKEN'),
  requestTimeoutMs: Number(process.env.REQUEST_TIMEOUT_MS ?? '295000'),
};
