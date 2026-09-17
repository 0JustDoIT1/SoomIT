import { createMcpClient, type GenkitMcpClient } from '@genkit-ai/mcp';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolAction } from 'genkit';

import { ai } from '../index.js';
import { getPatientData, type PatientDataResource } from '../tools/djangoTools.js';

export const PATIENT_DATA_TOOL_NAMES = [
  'get_patient_info',
  'get_patient_case',
  'get_patient_examinations',
  'get_patient_appointments',
  'get_patient_clinical_results',
  'get_patient_treatment',
  'get_patient_medications',
  'get_patient_symptoms',
  'get_patient_labs',
] as const;

const TOOL_DEFINITIONS: Array<{ name: string; description: string; resource: PatientDataResource }> = [
  { name: 'get_patient_info', description: '로그인 환자의 기본 정보를 조회합니다.', resource: 'info' },
  { name: 'get_patient_case', description: '로그인 환자의 현재 활성 Case를 조회합니다.', resource: 'case' },
  { name: 'get_patient_examinations', description: '로그인 환자의 검사 오더와 진행 상태를 조회합니다.', resource: 'examinations' },
  { name: 'get_patient_appointments', description: '로그인 환자의 예약과 방문 상태를 조회합니다.', resource: 'appointments' },
  { name: 'get_patient_clinical_results', description: '로그인 환자의 의료진 확정 검사 결과를 조회합니다.', resource: 'clinical-results' },
  { name: 'get_patient_treatment', description: '로그인 환자의 확정 치료 결정과 Regimen을 조회합니다.', resource: 'treatment' },
  { name: 'get_patient_medications', description: '로그인 환자의 처방과 복약 정보를 조회합니다.', resource: 'medications' },
  { name: 'get_patient_symptoms', description: '로그인 환자의 최근 증상 기록을 조회합니다.', resource: 'symptoms' },
  { name: 'get_patient_labs', description: '로그인 환자의 최근 검사실 결과를 조회합니다.', resource: 'labs' },
];

type PatientDataFetcher = (
  resource: PatientDataResource,
  patientAccessToken: string,
) => Promise<unknown>;

export interface PatientDataMcpBridge {
  client: GenkitMcpClient;
  server: McpServer;
  tools: ToolAction[];
  close: () => Promise<void>;
}

export async function createPatientDataMcpBridge(
  patientAccessToken: string,
  fetcher: PatientDataFetcher = getPatientData,
): Promise<PatientDataMcpBridge> {
  if (!patientAccessToken.trim()) {
    throw new Error('Patient authentication context is required.');
  }

  const server = new McpServer({ name: 'soomit-patient-data', version: '1.0.0' });
  for (const definition of TOOL_DEFINITIONS) {
    server.registerTool(
      definition.name,
      {
        title: definition.name,
        description: definition.description,
        inputSchema: {},
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async () => ({
        content: [{ type: 'text', text: JSON.stringify(await fetcher(definition.resource, patientAccessToken)) }],
      }),
    );
  }

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = createMcpClient({
    name: 'soomit-genkit',
    serverName: 'soomit-patient-data',
    mcpServer: { transport: clientTransport },
  });
  await client.ready();
  const tools = await client.getActiveTools(ai);
  if (tools.length !== TOOL_DEFINITIONS.length) {
    await client.disable();
    await server.close();
    throw new Error(`Expected ${TOOL_DEFINITIONS.length} patient tools, received ${tools.length}`);
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
