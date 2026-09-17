import assert from 'node:assert/strict';
import test from 'node:test';

process.env.GEMINI_API_KEY ||= 'test-key';
process.env.DJANGO_API_URL ||= 'http://django.test';
process.env.DJANGO_SERVICE_TOKEN ||= 'test-service-token';

const EXPECTED_TOOLS = [
  'get_patient_info',
  'get_patient_case',
  'get_patient_examinations',
  'get_patient_appointments',
  'get_patient_clinical_results',
  'get_patient_treatment',
  'get_patient_medications',
  'get_patient_symptoms',
  'get_patient_labs',
];

const EXPECTED_RESOURCES = [
  'info',
  'case',
  'examinations',
  'appointments',
  'clinical-results',
  'treatment',
  'medications',
  'symptoms',
  'labs',
];

test('patient MCP exposes nine identifier-free tools with request authentication context', async () => {
  const { createPatientDataMcpBridge } = await import('./patientDataMcp.js');
  const calls: Array<{ resource: string; token: string }> = [];
  const bridge = await createPatientDataMcpBridge('patient-token', async (resource, token) => {
    calls.push({ resource, token });
    return { resource };
  });

  try {
    const listed = await bridge.client.mcpClient?.listTools();
    assert.deepEqual(listed?.tools.map((tool) => tool.name), EXPECTED_TOOLS);
    assert.ok(listed?.tools.every((tool) => Object.keys(tool.inputSchema.properties ?? {}).length === 0));
    for (const name of EXPECTED_TOOLS) {
      await bridge.client.mcpClient?.callTool({ name, arguments: {} });
    }
    assert.deepEqual(
      calls,
      EXPECTED_RESOURCES.map((resource) => ({ resource, token: 'patient-token' })),
    );
  } finally {
    await bridge.close();
  }
});

test('patient MCP rejects missing patient context', async () => {
  const { createPatientDataMcpBridge } = await import('./patientDataMcp.js');
  await assert.rejects(() => createPatientDataMcpBridge(''), /authentication context/i);
});
