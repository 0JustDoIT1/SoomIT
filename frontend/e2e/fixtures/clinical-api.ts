import type { Page, Route } from "@playwright/test";

const clinician = {
  id: "doctor-e2e",
  username: "e2e-doctor",
  name: "E2E 담당의",
  role: "DOCTOR",
  department: { id: "dept-pulm", code: "PULMONOLOGY", name: "호흡기내과" },
  hospital: { id: "hospital-e2e", code: "E2E-HOSP", name: "E2E 병원" },
};

const ctCase = caseRecord("case-ct", "CASE-E2E-CT", "CT");
const treatmentCase = caseRecord("case-treatment", "CASE-E2E-TX", "TREATMENT");

const regimen = {
  id: "candidate-e2e",
  rule_code: "E2E-RULE",
  priority: 1,
  match_reasons: ["E2E fixture match"],
  evidence_source: "E2E fixture",
  regimen_detail: {
    id: "regimen-e2e",
    regimen_code: "E2E-REG",
    regimen_name: "E2E Target Regimen",
  },
};

const confirmedResults = [
  confirmed("XRAY"),
  confirmed("CT"),
  confirmed("PET_CT_TNM"),
  confirmed("PATHOLOGY_GENE"),
  confirmed("PDL1", { pdl1: { tps_percent: 60 } }),
];

const prescriptions = [
  prescription("rx-draft", "DRAFT", "임시저장"),
  prescription("rx-validated", "VALIDATED", "검증완료"),
  prescription("rx-final", "FINAL", "최종확정"),
];

export async function installClinicalApi(page: Page) {
  let currentTreatmentCase = { ...treatmentCase };
  let treatmentDecision: Record<string, unknown> | null = null;

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();

    if (method === "OPTIONS") {
      await json(route, {}, 204);
      return;
    }

    if (path === "/api/auth/staff/login/" && method === "POST") {
      await json(route, {
        access: "e2e-access-token",
        refresh: "e2e-refresh-token",
        user: clinician,
      });
      return;
    }

    if (path === "/api/doctor/cases/") {
      await json(route, [ctCase, currentTreatmentCase]);
      return;
    }

    const caseMatch = path.match(/^\/api\/doctor\/cases\/(case-[^/]+)\/$/);
    if (caseMatch) {
      const selected = caseMatch[1] === "case-treatment" ? currentTreatmentCase : ctCase;
      await json(route, selected);
      return;
    }

    if (path.endsWith("/clinical-results/")) {
      await json(route, path.includes("case-treatment") ? confirmedResults : []);
      return;
    }

    if (path.endsWith("/ai-results/")) {
      await json(route, path.includes("case-ct") ? [{
        id: "ct-ai-e2e",
        ai_result_id: "ct-ai-result-e2e",
        analysis_type: "CT_ANALYSIS",
        status: "SUCCEEDED",
        result_detail: { ct: { overall_assessment: "NODULE_DETECTED", nodules: [] } },
      }] : []);
      return;
    }

    if (path.endsWith("/orders/")) {
      await json(route, []);
      return;
    }

    if (path.endsWith("/regimen-candidates/")) {
      await json(route, [regimen]);
      return;
    }

    if (path.endsWith("/treatment-decision/confirm/") && method === "POST") {
      currentTreatmentCase = { ...currentTreatmentCase, current_stage: "PRESCRIPTION" };
      treatmentDecision = {
        ...treatmentDecision,
        decision_status: "CONFIRMED",
        current_stage: "PRESCRIPTION",
        case_status: "ACTIVE",
      };
      await json(route, treatmentDecision);
      return;
    }

    if (path.endsWith("/treatment-decision/")) {
      if (method === "POST") {
        const payload = request.postDataJSON() as Record<string, unknown>;
        treatmentDecision = {
          id: "decision-e2e",
          ...payload,
          selected_regimen_detail: regimen.regimen_detail,
          requires_prescription: true,
          decision_status: "DRAFT",
        };
        await json(route, treatmentDecision, 201);
        return;
      }

      if (!treatmentDecision) {
        await json(route, { detail: "No treatment decision" }, 404);
        return;
      }

      await json(route, treatmentDecision);
      return;
    }

    if (path.endsWith("/prescriptions/")) {
      await json(route, prescriptions);
      return;
    }

    if (path.endsWith("/treatment-evidence/")) {
      await json(route, { status: "READY", evidence: { answer: "E2E evidence", sources: [] } });
      return;
    }

    if (path.endsWith("/physician-treatment-opinion/")) {
      await json(route, { id: null, case: "case-treatment", physician_opinion: "", created_at: null, updated_at: null });
      return;
    }

    if (path.endsWith("/treatment-opinion/")) {
      await json(route, { status: "READY", opinion: "E2E opinion", sources: [], safety_status: "REVIEWED" });
      return;
    }

    if (path.includes("/notifications/me/")) {
      await json(route, { unread_count: 0, results: [] });
      return;
    }

    if (
      path.endsWith("/consultations/me/") ||
      path.endsWith("/appointments/") ||
      path.endsWith("/image-assets/") ||
      path.endsWith("/image-annotations/") ||
      path.endsWith("/specimens/") ||
      path.endsWith("/current-medications/") ||
      path.endsWith("/lab-results/")
    ) {
      await json(route, []);
      return;
    }

    await json(route, []);
  });
}

export async function authenticateWithoutLogin(page: Page) {
  await page.addInitScript((user) => {
    window.sessionStorage.setItem("accessToken", "e2e-access-token");
    window.sessionStorage.setItem("refreshToken", "e2e-refresh-token");
    window.sessionStorage.setItem("user", JSON.stringify(user));
  }, clinician);
}

function caseRecord(id: string, caseCode: string, currentStage: string) {
  return {
    id,
    case_code: caseCode,
    patient_code: `PAT-${id.toUpperCase()}`,
    patient_name: "E2E 환자",
    patient_sex: "F",
    patient_birth_date: "1980-01-01",
    primary_doctor_name: clinician.name,
    current_stage: currentStage,
    case_status: "ACTIVE",
    updated_at: "2026-09-26T00:00:00Z",
  };
}

function confirmed(stage: string, resultDetail: Record<string, unknown> = {}) {
  return {
    id: `clinical-${stage.toLowerCase()}`,
    workflow_stage: stage,
    result_status: "CONFIRMED",
    result_detail: resultDetail,
  };
}

function prescription(id: string, status: string, label: string) {
  return {
    id,
    regimen_detail: regimen.regimen_detail,
    cycle_number: 1,
    phase_label: "유도",
    prescription_status: status,
    prescription_status_label: label,
    safety_freshness: status === "DRAFT" ? "NOT_RUN" : "CURRENT",
    items: [],
    safety_check_results: status === "DRAFT" ? [] : [{
      id: `safety-${id}`,
      check_type_label: "E2E Safety",
      result: "PASS",
      result_label: "통과",
      message: "E2E fixture safety result",
      acknowledged_at: null,
    }],
  };
}

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    headers: { "access-control-allow-origin": "*" },
    body: status === 204 ? "" : JSON.stringify(body),
  });
}
