import { config } from '../config.js';
import { fetchJson } from '../http.js';

export interface MedicalKnowledgeSearchInput {
  question: string;
  topK: number;
}

export type PatientDataResource =
  | 'info'
  | 'case'
  | 'examinations'
  | 'appointments'
  | 'clinical-results'
  | 'treatment'
  | 'medications'
  | 'symptoms'
  | 'labs';

/**
 * Calls the narrow, service-token protected Django endpoint. Django owns the
 * database query and decides which fields may leave the backend.
 */
export async function searchMedicalKnowledge({
  question,
  topK,
}: MedicalKnowledgeSearchInput): Promise<unknown> {
  return fetchJson(
    'Django knowledge search',
    `${config.djangoApiUrl}/api/ai/knowledge/search/`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.djangoServiceToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: question, top_k: topK }),
    },
  );
}

export async function getPatientData(
  resource: PatientDataResource,
  patientAccessToken: string,
): Promise<unknown> {
  return fetchJson(
    `Django patient ${resource}`,
    `${config.djangoApiUrl}/api/ai/patient/${resource}/`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${config.djangoServiceToken}`,
        'X-Patient-Access-Token': patientAccessToken,
      },
    },
  );
}
