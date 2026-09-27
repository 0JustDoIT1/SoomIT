import { expect, test } from "@playwright/test";
import { authenticateWithoutLogin } from "./fixtures/clinical-api";
import { installWorkflowAuditApi } from "./fixtures/workflow-audit-api";

test("login through gene review, PD-L1, saved R1, safety and FINAL", async ({ page }) => {
  const state = await installWorkflowAuditApi(page);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error" && !message.text().startsWith("Failed to load resource:")) errors.push(message.text());
  });
  page.on("response", response => { if (response.status() >= 500) errors.push(`${response.status()} ${response.url()}`); });
  await page.goto("/login");
  await page.getByLabel("병원 코드").fill("E2E-HOSP");
  await page.getByLabel("아이디").fill("e2e-doctor");
  await page.getByLabel("비밀번호").fill("not-a-real-password");
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page).toHaveURL(/dashboard$/);
  await page.reload();
  await page.getByRole("button", { name: "Case 열기", exact: true }).first().click();
  const menu = page.getByRole("navigation", { name: "Case 진료 정보 메뉴" });
  await menu.getByRole("button", { name: "조직/유전자", exact: true }).click();
  await expect(page.getByRole("button", { name: "검토 결과 확정" })).toBeDisabled();
  await expect(page.getByText("EGFR 양성 결과는 구체적인 변이 유형을 확인해야 합니다.")).toBeVisible();
  await page.getByLabel("EGFR 세부 변이").selectOption("EGFR_EX19_DEL");
  await page.getByRole("button", { name: "검토 결과 확정" }).click();
  await expect(page.getByLabel("EGFR 세부 변이")).toHaveCount(0);
  expect(state.writes.find(w => w.path.endsWith("/clinical-results/pathology/gene-qa/confirm/"))?.body.gene_findings).toContainEqual({ gene_symbol: "EGFR", assessment: "LIKELY_POSITIVE", alteration_code: "EGFR_EX19_DEL" });
  await page.getByRole("button", { name: "PD-L1 검사 오더", exact: true }).click();
  await expect(menu.getByRole("button", { name: "PD-L1", exact: true })).toHaveAttribute("data-access-state", "ACTIONABLE");
  await menu.getByRole("button", { name: "PD-L1", exact: true }).click();
  await page.getByRole("button", { name: "결과 확인 및 확정" }).click();
  await page.getByRole("button", { name: "다음 단계 결정", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "치료결정으로 진행", exact: true }).click();
  await menu.getByRole("button", { name: "치료계획·처방", exact: true }).click();
  await expect(page.getByText("TR01", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "상세 근거 보기", exact: true }).click();
  await expect(page.getByText("E2E evidence", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "치료계획 검토하기 →", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("치료 유형").selectOption("TARGETED_THERAPY");
  await expect(dialog.getByRole("textbox", { name: "치료 계획", exact: true })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "저장하고 다음 단계", exact: true })).toBeDisabled();
  await dialog.getByRole("button", { name: /QA R1/ }).click();
  await dialog.getByRole("textbox", { name: "치료 계획", exact: true }).fill("QA plan");
  await dialog.getByRole("button", { name: "임시 저장", exact: true }).click();
  await expect.poll(() => state.decision?.selected_regimen).toBe("R1");
  await dialog.getByRole("button", { name: "닫기", exact: true }).click();
  await page.reload();
  await menu.getByRole("button", { name: "치료계획·처방", exact: true }).click();
  await page.getByRole("button", { name: "치료계획 계속 작성 →", exact: true }).click();
  await expect(dialog.getByRole("button", { name: /QA R1/ })).toHaveClass(/border-emerald-500/);
  await dialog.getByRole("button", { name: "저장하고 다음 단계", exact: true }).click();
  await dialog.getByRole("button", { name: "치료계획 확정", exact: true }).click();
  await page.getByRole("button", { name: "처방 작성으로 이동 →", exact: true }).click();
  await page.getByLabel("Cycle 시작일").fill("2026-09-27");
  await page.getByRole("button", { name: "임시 처방 생성", exact: true }).click();
  await expect(page.getByRole("button", { name: "처방 최종 확정", exact: true })).toHaveCount(0);
  await page.getByLabel("QA medication 최종 용량").fill("75");
  await page.getByRole("button", { name: "수정 저장", exact: true }).click();
  await expect.poll(() => (state.prescriptions[0].items as { final_dose: string }[])[0].final_dose).toBe("75");
  await expect(page.getByText("선택 Regimen: R1 · QA R1", { exact: true })).toBeVisible();
  await expect(page.getByLabel("처방 진행 상태", { exact: true })).toContainText("DRAFT");
  await expect(page.getByRole("heading", { name: /Safety Check · RECHECK_REQUIRED/ })).toBeVisible();
  await page.getByRole("button", { name: /안전성 (검사 실행|재검사)/ }).click();
  await expect(page.getByRole("heading", { name: "Safety Check · PASS", exact: true })).toBeVisible();
  await expect(page.getByText("현재 상태: VALIDATED · 검증 완료", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "처방 최종 확정", exact: true })).toBeEnabled();
  const finalAction = await page.getByRole("button", { name: "처방 최종 확정", exact: true }).boundingBox();
  const workspace = await page.getByRole("region", { name: "처방 작업공간", exact: true }).boundingBox();
  expect(finalAction!.y + finalAction!.height).toBeLessThanOrEqual(workspace!.y + workspace!.height);
  await page.screenshot({ path: test.info().outputPath("prescription-validated.png") });
  page.once("dialog", d => d.accept());
  await page.getByRole("button", { name: "처방 최종 확정", exact: true }).click();
  await expect(page.getByText("최종 확정 완료 · 수정 불가", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "수정 저장", exact: true })).toHaveCount(0);
  expect(state.case.current_stage).toBe("PRESCRIPTION");
  expect(state.decision?.decision_status).toBe("CONFIRMED");
  expect(state.prescriptions[0].prescription_status).toBe("FINAL");
  expect(state.candidateCalls).toBeGreaterThan(0);
  expect(errors).toEqual([]);
  await page.screenshot({ path: "../reports/workflow-prescription-final.png" });
  await page.getByRole("button", { name: "로그아웃", exact: true }).click();
  await expect(page).toHaveURL(/login$/);
  expect(await page.evaluate(() => sessionStorage.getItem("accessToken"))).toBeNull();
});

for (const scenario of ["NOT_RUN", "RECHECK_REQUIRED", "WARNING", "BLOCK"]) {
  test(`prescription ${scenario} prevents FINAL in the browser`, async ({ page }) => {
    const state = await installWorkflowAuditApi(page, "PRESCRIPTION");
    state.decision = { id: "decision-qa", decision_status: "CONFIRMED", treatment_type: "TARGETED_THERAPY", selected_regimen: "R1", selected_regimen_detail: state.candidates[0].regimen_detail, requires_prescription: true };
    state.prescriptions.push({ id: "rx-qa", cycle_number: 1, regimen_detail: state.candidates[0].regimen_detail, prescription_status: scenario === "NOT_RUN" ? "DRAFT" : "VALIDATED", safety_freshness: ["WARNING", "BLOCK"].includes(scenario) ? "CURRENT" : scenario, items: [], safety_check_results: ["WARNING", "BLOCK"].includes(scenario) ? [{ id: "safety-qa", result: scenario, source_code: "LAB_MISSING", check_type_label: "QA safety", message: "QA blocked" }] : [] });
    await authenticateWithoutLogin(page);
    await page.goto("/respiratory/cases/case-treatment?openCurrentEvidence=1");
    await page.getByRole("button", { name: "처방 · 안전성", exact: true }).click();
    await expect(page.getByRole("heading", { name: /Safety Check/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "처방 최종 확정", exact: true })).toHaveCount(0);
    if (scenario !== "NOT_RUN") await expect(page.getByRole("alert").first()).toBeVisible();
    expect(state.writes).toEqual([]);
  });
}

test("invalid login stays unauthenticated", async ({ page }) => {
  await installWorkflowAuditApi(page);
  await page.route("**/api/auth/staff/login/", route => route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ detail: "QA 잘못된 로그인" }) }));
  await page.goto("/login");
  await page.getByLabel("병원 코드").fill("E2E-HOSP");
  await page.getByLabel("아이디").fill("wrong");
  await page.getByLabel("비밀번호").fill("wrong");
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page.getByText("QA 잘못된 로그인")).toBeVisible();
  await expect(page).toHaveURL(/login$/);
  expect(await page.evaluate(() => sessionStorage.getItem("accessToken"))).toBeNull();
});

test("zero candidates names incomplete EGFR and blocks drug treatment", async ({ page }) => {
  const state = await installWorkflowAuditApi(page, "TREATMENT");
  state.candidates.splice(0);
  state.gene.result_detail.gene.findings[0].alteration_code = null;
  await authenticateWithoutLogin(page);
  await page.goto("/respiratory/cases/case-treatment?openCurrentEvidence=1");
  await page.getByRole("button", { name: "치료계획 검토하기 →", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("치료 유형").selectOption("TARGETED_THERAPY");
  await expect(dialog.getByRole("textbox", { name: "치료 계획", exact: true })).toBeDisabled();
  await expect(dialog.getByText(/EGFR.*변이/)).toBeVisible();
  await expect(dialog.getByRole("button", { name: "저장하고 다음 단계", exact: true })).toBeDisabled();
  expect(state.writes).toEqual([]);
});

test("OTHER UNKNOWN remains indeterminate in the browser confirm payload", async ({ page }) => {
  const state = await installWorkflowAuditApi(page);
  await authenticateWithoutLogin(page);
  await page.goto("/respiratory/cases/case-treatment?openCurrentEvidence=1");
  await page.getByLabel("EGFR 세부 변이").selectOption("OTHER_UNKNOWN");
  await expect(page.getByLabel("EGFR 임상 상태")).toHaveValue("INDETERMINATE");
  await page.getByRole("button", { name: "검토 결과 확정" }).click();
  await expect.poll(() => state.gene.result_status).toBe("CONFIRMED");
  expect(state.gene.result_detail.gene.findings[0]).toEqual({ gene_symbol: "EGFR", assessment: "INDETERMINATE", alteration_code: null });
});

test("past pathology draft is read-only when treatment is current", async ({ page }) => {
  const state = await installWorkflowAuditApi(page, "TREATMENT");
  state.gene.result_status = "DRAFT";
  await authenticateWithoutLogin(page);
  await page.goto("/respiratory/cases/case-treatment");
  await page.getByRole("navigation", { name: "Case 진료 정보 메뉴" }).getByRole("button", { name: "조직/유전자", exact: true }).click();
  await expect(page.getByRole("region", { name: "조직/유전자 영상 작업공간" })).toBeVisible();
  await expect(page.getByRole("button", { name: "검토 결과 확정" })).toHaveCount(0);
});

test("candidate loading and API failure are distinct and cannot advance drug treatment", async ({ page }) => {
  const state = await installWorkflowAuditApi(page, "TREATMENT");
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/regimen-candidates/", async route => {
    await pending;
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ detail: "QA candidate failure" }) });
  });
  await authenticateWithoutLogin(page);
  await page.goto("/respiratory/cases/case-treatment?openCurrentEvidence=1");
  await expect(page.getByText("치료결정 정보를 불러오는 중입니다.")).toBeVisible();
  release();
  await expect(page.getByText("Regimen 후보를 불러오지 못했습니다.")).toBeVisible();
  await page.getByRole("button", { name: "치료계획 검토하기 →", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("alert")).toContainText("Regimen 후보를 불러오지 못했습니다.");
  await expect(dialog.getByText("현재 선택 가능한 Regimen 후보가 없습니다.")).toHaveCount(0);
  await expect(dialog.getByText("Regimen을 선택해주세요", { exact: true })).toHaveCount(0);
  await dialog.getByLabel("치료 유형").selectOption("TARGETED_THERAPY");
  await expect(dialog.getByRole("textbox", { name: "치료 계획", exact: true })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "저장하고 다음 단계", exact: true })).toBeDisabled();
  expect(state.writes).toEqual([]);
});
