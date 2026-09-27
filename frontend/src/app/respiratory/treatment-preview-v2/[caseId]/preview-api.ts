import type { AuthorizedFetch } from "../../cases/[caseId]/treatment-prescription-types";
import type { Candidate, Decision, InputSnapshot, Prescription } from "./preview-types";
export async function apiJson(fetcher: AuthorizedFetch, base: string, path: string, init?: RequestInit) { const response = await fetcher(`${base}${path}`, init); const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body?.detail || body?.error || `요청 실패 (${response.status})`); return body; }
export async function loadPreview(fetcher: AuthorizedFetch, base: string, caseId: string) {
 const endpoint = (name: string) => name ? `/api/doctor/cases/${caseId}/${name}/` : `/api/doctor/cases/${caseId}/`;
 const [caseData, clinical, candidates, decision, prescriptions, allergy, labs, medications] = await Promise.all([
  apiJson(fetcher,base,endpoint("")), apiJson(fetcher,base,endpoint("clinical-results")), apiJson(fetcher,base,endpoint("regimen-candidates")), apiJson(fetcher,base,endpoint("treatment-decision")).catch(() => null), apiJson(fetcher,base,endpoint("prescriptions")), apiJson(fetcher,base,endpoint("allergy-profile")).catch(() => null), apiJson(fetcher,base,endpoint("lab-results")).catch(() => []), apiJson(fetcher,base,endpoint("current-medications")).catch(() => []),
 ]);
 return { case: caseData, clinical: Array.isArray(clinical) ? clinical : [], candidates: Array.isArray(candidates) ? candidates as Candidate[] : [], decision: decision as Decision | null, prescriptions: Array.isArray(prescriptions) ? prescriptions as Prescription[] : [], allergy: allergy as Record<string, unknown> | null, labs: Array.isArray(labs) ? labs : [], medications: Array.isArray(medications) ? medications : [] };
}
export function postJson(fetcher: AuthorizedFetch, base: string, path: string, body: unknown) { return apiJson(fetcher,base,path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}); }
export function previewCandidates(fetcher: AuthorizedFetch, base: string, caseId: string, snapshot: InputSnapshot) { return postJson(fetcher, base, `/api/doctor/cases/${caseId}/regimen-candidates/preview/`, snapshot) as Promise<Candidate[]>; }
