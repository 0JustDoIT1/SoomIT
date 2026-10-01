import type { Page } from "@playwright/test";
import { installClinicalApi } from "./clinical-api";

// Stateful browser fixtures only: no request is sent to a patient database.
export async function installWorkflowAuditApi(page: Page, stage = "PATHOLOGY_GENE") {
  await installClinicalApi(page);
  const gene = { id: "gene-qa", workflow_stage: "PATHOLOGY_GENE", result_status: "DRAFT", result_detail: {
    pathology: { histologic_type: "NSCLC", subtype: "LUAD", malignancy_status: "MALIGNANT" },
    gene: { findings: ["EGFR", "BRAF", "MET"].map(gene_symbol => ({ gene_symbol, assessment: gene_symbol === "EGFR" ? "LIKELY_POSITIVE" : "LIKELY_NEGATIVE", alteration_code: null as string | null })) },
  } };
  const pdl1 = { id: "pdl1-qa", workflow_stage: "PDL1", result_status: "DRAFT", result_detail: { pdl1: { tps_percent: 60 } } };
  const candidates = ["R1", "R2"].map(code => ({ id: `rule-${code}`, rule_code: "TR01", priority: 1, match_reasons: ["EGFR_EX19_DEL confirmed"], evidence_source: "QA rule fixture", regimen_detail: { id: code, regimen_code: code, regimen_name: `QA ${code}` } }));
  const state = {
    case: { id: "case-treatment", case_code: "QA-WORKFLOW", patient_code: "QA-ONLY", patient_name: "QA 환자", patient_sex: "F", patient_birth_date: "1980-01-01", primary_doctor_name: "E2E 담당의", current_stage: stage, case_status: "ACTIVE" },
    gene, pdl1, candidates,
    decision: null as Record<string, unknown> | null,
    prescriptions: [] as Array<Record<string, unknown>>,
    writes: [] as Array<{ path: string; body: Record<string, unknown> }>,
    candidateCalls: 0,
  };
  if (stage === "TREATMENT" || stage === "PRESCRIPTION") {
    gene.result_status = pdl1.result_status = "CONFIRMED";
    gene.result_detail.gene.findings[0].alteration_code = "EGFR_EX19_DEL";
  }
  await page.route("**/api/**", async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    const body = method === "POST" || method === "PATCH" ? (request.postDataJSON() ?? {}) as Record<string, unknown> : {};
    const reply = (data: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
    if (method === "POST" || method === "PATCH") state.writes.push({ path, body });
    if (path === "/api/doctor/cases/") return reply([state.case]);
    if (path === "/api/doctor/cases/case-treatment/") return reply(state.case);
    if (path.endsWith("/clinical-results/")) return reply([
      ...["XRAY", "CT", "PET_CT_TNM"].map(workflow_stage => ({ id: workflow_stage, workflow_stage, result_status: "CONFIRMED", result_detail: {} })),
      gene, ...(state.case.current_stage !== "PATHOLOGY_GENE" ? [pdl1] : []),
      ...(state.decision ? [{ id: "treatment-qa", workflow_stage: "TREATMENT", result_status: state.decision.decision_status, result_detail: {} }] : []),
    ]);
    if (path.endsWith("/clinical-results/pathology/gene-qa/confirm/") && method === "POST") {
      gene.result_detail.gene.findings = body.gene_findings as typeof gene.result_detail.gene.findings;
      gene.result_status = "CONFIRMED";
      return reply(gene);
    }
    if (path.endsWith("/clinical-results/pathology/pdl1-qa/confirm/") && method === "POST") {
      pdl1.result_status = "CONFIRMED";
      return reply(pdl1);
    }
    if (path.endsWith("/workflow-decision/") && method === "POST") {
      if (body.action === "CASE_CLOSED") state.case.case_status = "CLOSED";
      else state.case.current_stage = String(body.target_stage);
      return reply(state.case);
    }
    if (path.endsWith("/regimen-candidates/")) { state.candidateCalls++; return reply(state.candidates); }
    if (path.endsWith("/treatment-decision/confirm/") && method === "POST") {
      state.case.current_stage = "PRESCRIPTION";
      state.decision = { ...state.decision, decision_status: "CONFIRMED", current_stage: "PRESCRIPTION", case_status: "ACTIVE" };
      return reply(state.decision);
    }
    if (path.endsWith("/treatment-decision/")) {
      if (method === "POST") state.decision = { id: "decision-qa", ...body, selected_regimen_detail: candidates.find(c => c.regimen_detail.id === body.selected_regimen)?.regimen_detail, requires_prescription: true, available_prescription_phases: ["INDUCTION"], decision_status: "DRAFT" };
      return state.decision ? reply(state.decision) : reply({ detail: "No treatment decision" }, 404);
    }
    if (path.endsWith("/allergy-profile/") && method === "GET") {
      return reply({ allergy_status: "NONE", allergies: [], height_cm: 170, weight_kg: 65 });
    }
    if (path.endsWith("/current-medications/") && method === "GET") {
      return reply([{ id: "medication-qa", medication_name: "QA current medication", ingredient_name: "QA ingredient", mfds_item_seq: "QA-ITEM-001", is_active: true }]);
    }
    if (path.endsWith("/lab-results/") && method === "GET") {
      return reply([{ id: "lab-qa", creatinine: 1, egfr: 90, ast: 20, alt: 20, total_bilirubin: 0.8, tested_at: "2026-09-30T00:00:00Z" }]);
    }
    if (path.endsWith("/prescriptions/")) {
      if (method === "POST") {
        const rx = { id: "rx-qa", ...body, regimen_detail: candidates[0].regimen_detail, prescription_status: "DRAFT", safety_freshness: "NOT_RUN", safety_check_results: [], items: [{ id: "item-qa", drug_name: "QA medication", route: "INTRAVENOUS", calculated_dose: 80, final_dose: 80, unit: "mg", instructions: "QA fixture" }] };
        state.prescriptions.push(rx);
        return reply(rx, 201);
      }
      return reply(state.prescriptions);
    }
    if (path.includes("/items/") && method === "PATCH") {
      Object.assign((state.prescriptions[0].items as Record<string, unknown>[])[0], body);
      state.prescriptions[0].prescription_status = "DRAFT";
      state.prescriptions[0].safety_freshness = "RECHECK_REQUIRED";
      return reply(state.prescriptions[0]);
    }
    if (path.endsWith("/safety-check/") && method === "POST") {
      Object.assign(state.prescriptions[0], { prescription_status: "VALIDATED", safety_freshness: "CURRENT", safety_check_results: [{ id: "safe-qa", result: "PASS", check_type_label: "QA Safety", message: "QA PASS" }] });
      return reply(state.prescriptions[0]);
    }
    if (path.endsWith("/finalize/") && method === "POST") {
      state.prescriptions[0].prescription_status = "FINAL";
      return reply(state.prescriptions[0]);
    }
    if (method === "POST" || method === "PATCH" || method === "DELETE") {
      if (path !== "/api/auth/staff/login/") return reply({ detail: `Unhandled QA write: ${method} ${path}` }, 404);
    }
    return route.fallback();
  });
  return state;
}
