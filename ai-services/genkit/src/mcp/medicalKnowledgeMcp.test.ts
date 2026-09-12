import assert from 'node:assert/strict';
import test from 'node:test';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';

process.env.GEMINI_API_KEY ||= 'test-key';
process.env.DJANGO_API_URL ||= 'http://django.test';
process.env.DJANGO_SERVICE_TOKEN ||= 'test-service-token';

test('MCP client discovers and invokes the medical knowledge tool', async () => {
  const { createMedicalKnowledgeMcpBridge } = await import(
    './medicalKnowledgeMcp.js'
  );
  const calls: Array<{ question: string; topK: number }> = [];
  const expected = {
    results: [{ document: 'NCI PDQ', chunk_index: 87, distance: 0.11 }],
  };
  const bridge = await createMedicalKnowledgeMcpBridge(async (input) => {
    calls.push(input);
    return expected;
  });

  try {
    const sdkClient = bridge.client.mcpClient;
    assert.ok(sdkClient);

    const listed = await sdkClient.listTools();
    assert.deepEqual(
      listed.tools.map((tool) => tool.name),
      ['search_medical_knowledge'],
    );
    assert.equal(bridge.tools.length, 1);
    assert.equal(
      bridge.tools[0].__action.name,
      'soomit-medical-knowledge/search_medical_knowledge',
    );

    const wrappedResult = await bridge.tools[0]({
      question: 'Stage IA NSCLC treatment?',
      topK: 3,
    });
    assert.deepEqual(wrappedResult, expected);

    const result = CallToolResultSchema.parse(
      await sdkClient.callTool({
        name: 'search_medical_knowledge',
        arguments: { question: 'Stage IA NSCLC treatment?', topK: 3 },
      }),
    );
    assert.deepEqual(calls, [
      { question: 'Stage IA NSCLC treatment?', topK: 3 },
      { question: 'Stage IA NSCLC treatment?', topK: 3 },
    ]);
    assert.equal(result.isError, undefined);
    assert.equal(result.content[0]?.type, 'text');
    if (result.content[0]?.type === 'text') {
      assert.deepEqual(JSON.parse(result.content[0].text), expected);
    }
  } finally {
    await bridge.close();
  }
});
