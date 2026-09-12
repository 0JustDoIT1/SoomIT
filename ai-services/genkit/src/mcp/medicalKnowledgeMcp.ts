import { createMcpClient, type GenkitMcpClient } from '@genkit-ai/mcp';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolAction } from 'genkit';
import { z } from 'zod';

import { ai } from '../index.js';
import {
  searchMedicalKnowledge,
  type MedicalKnowledgeSearchInput,
} from '../tools/djangoTools.js';

export const MEDICAL_KNOWLEDGE_MCP_TOOL =
  'soomit-medical-knowledge/search_medical_knowledge';

type MedicalKnowledgeSearcher = (
  input: MedicalKnowledgeSearchInput,
) => Promise<unknown>;

export interface MedicalKnowledgeMcpBridge {
  client: GenkitMcpClient;
  server: McpServer;
  tools: ToolAction[];
  close: () => Promise<void>;
}

export async function createMedicalKnowledgeMcpBridge(
  searcher: MedicalKnowledgeSearcher = searchMedicalKnowledge,
): Promise<MedicalKnowledgeMcpBridge> {
  const server = new McpServer({
    name: 'soomit-medical-knowledge',
    version: '1.0.0',
  });

  server.registerTool(
    'search_medical_knowledge',
    {
      title: '폐암 진료 지식 검색',
      description:
        'Django의 승인된 RAG API를 통해 폐암 진료지침 근거 청크를 검색합니다. 치료, 병기, 바이오마커, 진료지침 질문에 사용합니다.',
      inputSchema: {
        question: z.string().min(1).max(2000),
        topK: z.number().int().min(1).max(10).default(5),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ question, topK }) => {
      const result = await searcher({ question, topK });
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
      };
    },
  );

  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);

  const client = createMcpClient({
    name: 'soomit-genkit',
    serverName: 'soomit-medical-knowledge',
    mcpServer: { transport: clientTransport },
  });
  await client.ready();

  const tools = await client.getActiveTools(ai);
  if (tools.length !== 1) {
    await client.disable();
    await server.close();
    throw new Error(`Expected one MCP tool, received ${tools.length}`);
  }

  return {
    client,
    server,
    tools,
    close: async () => {
      await client.disable();
      await server.close();
    },
  };
}

let bridgePromise: Promise<MedicalKnowledgeMcpBridge> | undefined;

export function initializeMedicalKnowledgeMcp(): Promise<MedicalKnowledgeMcpBridge> {
  bridgePromise ??= createMedicalKnowledgeMcpBridge();
  return bridgePromise;
}

export async function getMedicalKnowledgeMcpTools(): Promise<ToolAction[]> {
  return (await initializeMedicalKnowledgeMcp()).tools;
}
