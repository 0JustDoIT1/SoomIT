import { expect, test, type Page } from "@playwright/test";

import { authenticateWithoutLogin, installClinicalApi, installPrescriptionWarningFlow } from "./fixtures/clinical-api";

test.beforeEach(async ({ page }) => {
  await installClinicalApi(page);
});

test("legacy respiratory URLs redirect to the dashboard", async ({ page }) => {
  await authenticateWithoutLogin(page);

  for (const legacyPath of [
    "/respiratory/ai-analysis",
    "/respiratory/results",
    "/respiratory/treatment",
    "/respiratory/prescriptions",
    "/respiratory/statistics",
  ]) {
    await page.goto(legacyPath);
    await expect(page).toHaveURL(/\/respiratory\/dashboard$/);
  }
});

test("login, dashboard selection, and current/future stage access", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("병원 코드").fill("E2E-HOSP");
  await page.getByLabel("아이디").fill("e2e-doctor");
  await page.getByLabel("비밀번호").fill("not-a-real-password");
  await page.getByRole("button", { name: "로그인" }).click();

  await expect(page).toHaveURL(/\/respiratory\/dashboard$/);
  await expect(page.getByRole("heading", { name: "E2E 담당의" })).toBeVisible();
  await page.getByLabel("표시할 Case").selectOption("case-ct");
  await page.getByRole("button", { name: "Case 열기", exact: true }).first().click();

  await expect(page).toHaveURL(/\/respiratory\/cases\/case-ct$/);
  const caseMenu = page.getByRole("navigation", { name: "Case 진료 정보 메뉴" });
  await expect(caseMenu.getByRole("button", { name: "흉부 CT" })).toHaveAttribute("data-access-state", "ACTIONABLE");
  await expect(caseMenu.locator('[data-access-state="LOCKED"]')).toHaveCount(4);
  await caseMenu.getByRole("button", { name: "흉부 CT" }).click();
  await expect(page.getByRole("button", { name: "결과 입력 및 처리" })).toBeEnabled();
});

test("physician selects a regimen, confirms treatment, and opens prescription statuses", async ({ page }) => {
  await authenticateWithoutLogin(page);
  await page.goto("/respiratory/cases/case-treatment?openCurrentEvidence=1");

  await page.getByRole("button", { name: /치료계획 (검토하기|계속 작성)/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("치료 유형").selectOption("TARGETED_THERAPY");
  await dialog.getByRole("button", { name: /E2E Target Regimen/ }).click();
  await dialog.getByRole("textbox", { name: "치료 계획", exact: true }).fill("E2E 치료 계획");
  await dialog.getByRole("button", { name: "저장하고 다음 단계", exact: true }).click();
  await dialog.getByRole("button", { name: "치료계획 확정", exact: true }).click();

  await expect(page.getByText("치료계획 확정 완료", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "확정된 치료계획 보기", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "진료 종합 소견 조회" })).toBeVisible();
  await expect(page.getByRole("dialog").getByLabel("치료 유형")).toHaveCount(0);
  await page.getByRole("button", { name: "닫기" }).click();

  await page.getByRole("button", { name: "처방 작성으로 이동 →", exact: true }).click();
  const prescriptionSelect = page.getByLabel("처방 선택");
  await expect(prescriptionSelect.getByRole("option", { name: /임시저장/ })).toHaveCount(1);
  await expect(prescriptionSelect.getByRole("option", { name: /검증완료/ })).toHaveCount(1);
  await expect(prescriptionSelect.getByRole("option", { name: /최종확정/ })).toHaveCount(1);
  await expect(page.getByText(/Safety Check/).first()).toBeVisible();
});

test("current safety warnings remain visible without legacy acknowledgment controls", async ({ page }) => {
  await installPrescriptionWarningFlow(page);
  await authenticateWithoutLogin(page);
  await page.goto("/respiratory/cases/case-prescription");
  await page.getByRole("button", { name: "치료계획·처방" }).click();
  await page.getByRole("button", { name: "처방 · 안전성", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Safety Check · WARNING · 경고" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "안전성 경고가 확인되었습니다" })).toBeVisible();
  await expect(page.getByRole("button", { name: "경고 확인 후 다음 단계" })).toHaveCount(0);

  await page.getByLabel("처방 선택").selectOption("rx-unresolved");
  await expect(page.getByRole("alert").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "경고 확인 후 다음 단계" })).toHaveCount(0);
});

test("CT, WSI, and prescription safety viewers render deterministic empty or loaded states", async ({ page }) => {
  const fatalBrowserErrors: string[] = [];
  page.on("pageerror", (error) => fatalBrowserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().startsWith("Failed to load resource:")) {
      fatalBrowserErrors.push(message.text());
    }
  });

  await authenticateWithoutLogin(page);
  await page.goto("/respiratory/cases/case-treatment");
  const caseMenu = page.getByRole("navigation", { name: "Case 진료 정보 메뉴" });

  await caseMenu.getByRole("button", { name: "흉부 CT" }).click();
  await expect(page.getByRole("heading", { name: "CT 검사 결과" })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: /DICOM Series/ })).toBeVisible();

  await caseMenu.getByRole("button", { name: "조직/유전자" }).click();
  await expect(page.getByRole("region", { name: "조직/유전자 영상 작업공간" })).toBeVisible();
  await expect(page.getByText("표시할 H&E WSI가 없습니다.")).toBeVisible();

  await caseMenu.getByRole("button", { name: "치료계획·처방" }).click();
  await page.getByRole("button", { name: "처방 · 안전성", exact: true }).click();
  await expect(page.getByText(/Safety Check/).first()).toBeVisible();
  const safetyInputs = page.getByRole("region", { name: "환자 안전성 정보" });
  await expect(safetyInputs).toBeVisible();
  await expect(page.getByRole("button", { name: "안전성 검사", exact: true })).toHaveCount(0);
  for (const label of ["키 (cm)", "몸무게 (kg)", "Creatinine", "eGFR", "AST", "ALT", "Total Bilirubin", "알레르기 상태", "약품명", "성분명", "MFDS ITEM_SEQ"]) {
    await expect(safetyInputs.getByLabel(label)).toBeVisible();
  }
  expect(fatalBrowserErrors).toEqual([]);
});

test("normal WSI viewer and unlinked-series preview fallback both render", async ({ page }) => {
  await authenticateWithoutLogin(page);
  let viewerLinked = true;
  const image = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  await installWsiRoutes(page, () => viewerLinked, image);

  await page.goto("/respiratory/cases/case-treatment");
  const caseMenu = page.getByRole("navigation", { name: "Case 진료 정보 메뉴" });
  await caseMenu.getByRole("button", { name: "조직/유전자" }).click();
  await expect(page.getByLabel("HE-E2E WSI 뷰어")).toBeVisible();
  await expect(page.getByText(/미리보기 이미지를 표시합니다/)).toHaveCount(0);

  viewerLinked = false;
  await page.reload();
  await caseMenu.getByRole("button", { name: "조직/유전자" }).click();
  await expect(page.getByRole("img", { name: "HE-E2E 미리보기" })).toBeVisible();
  await expect(page.getByText("WSI 원본 뷰어 연결이 준비되지 않았습니다. 미리보기 이미지를 표시합니다.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Heatmap" })).toBeEnabled();
});

test("Preview V2 keeps multi-driver candidates unselected until physician choice", async ({ page }) => {
  await authenticateWithoutLogin(page);
  let savedDecision: Record<string, unknown> | null = null;
  const candidates = [
    previewCandidate("rule-r1", "TR01", "regimen-r1", "R1", "EGFR", "EGFR_EX19_DEL"),
    previewCandidate("rule-r2", "TR01", "regimen-r2", "R2", "EGFR", "EGFR_EX19_DEL"),
    previewCandidate("rule-r5", "TR04", "regimen-r5", "R5", "BRAF", "BRAF_V600E"),
  ];
  await page.route("**/api/doctor/cases/case-treatment/clinical-results/", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify([
      { result_status: "CONFIRMED", workflow_stage: "PATHOLOGY_GENE", result_detail: { pathology: { histologic_type: "LUAD" }, gene: { findings: [
        { gene_symbol: "EGFR", assessment: "LIKELY_POSITIVE", alteration_code: "EGFR_EX19_DEL" },
        { gene_symbol: "BRAF", assessment: "LIKELY_POSITIVE", alteration_code: "BRAF_V600E" },
        { gene_symbol: "MET", assessment: "LIKELY_NEGATIVE", alteration_code: null },
      ] } } },
      { result_status: "CONFIRMED", workflow_stage: "PDL1", result_detail: { pdl1: { tps_percent: 60 } } },
    ]),
  }));
  await page.route("**/api/doctor/cases/case-treatment/regimen-candidates**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(candidates),
  }));
  await page.route("**/api/doctor/cases/case-treatment/treatment-decision/", async (route) => {
    if (route.request().method() === "POST") {
      savedDecision = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(savedDecision) });
      return;
    }
    await route.fulfill(savedDecision
      ? { status: 200, contentType: "application/json", body: JSON.stringify(savedDecision) }
      : { status: 404, contentType: "application/json", body: JSON.stringify({ detail: "not found" }) });
  });

  await page.goto("/respiratory/treatment-preview-v2/case-treatment");
  await page.getByRole("button", { name: /표적치료/ }).click();

  await expect(page.getByText("복수의 actionable driver가 확인되었습니다.")).toBeVisible();
  await expect(page.getByRole("button", { name: /R1/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /R2/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /R5/ })).toBeVisible();
  await expect(page.getByText(/선택 Regimen:/).filter({ hasText: "미선택" })).toBeVisible();

  await page.getByRole("button", { name: /R5/ }).click();
  await page.getByPlaceholder("치료계획").fill("BRAF 근거 수동 선택");
  await page.getByRole("button", { name: "DRAFT 저장" }).click();

  await expect.poll(() => (savedDecision as unknown as { selected_regimen?: string } | null)?.selected_regimen).toBe("regimen-r5");
  const savedSnapshot = (savedDecision as unknown as { input_snapshot: { findings: unknown[] } }).input_snapshot;
  expect(savedSnapshot.findings).toHaveLength(3);
});

async function installWsiRoutes(page: Page, viewerLinked: () => boolean, image: Buffer) {
  await page.route("**/api/doctor/cases/case-treatment/specimens/", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify([{ id: "specimen-wsi", specimen_code: "SP-E2E" }]),
  }));
  await page.route("**/api/doctor/cases/specimens/specimen-wsi/slides/", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify([{ id: "slide-wsi", specimen_id: "specimen-wsi", image_asset_id: "asset-wsi", slide_code: "HE-E2E", stain: "HE", status: "READY", viewer_url: "/api/doctor/cases/slides/slide-wsi/viewer/" }]),
  }));
  await page.route("**/api/doctor/cases/slides/slide-wsi/viewer/", (route) => route.fulfill(viewerLinked() ? {
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ width: 1, height: 1, tile_width: 1, tile_height: 1, max_level: 0, sizes: [[1, 1]], tile_url_template: "/api/doctor/cases/slides/slide-wsi/tiles/{level}/{x}/{y}.jpg" }),
  } : {
    status: 409,
    contentType: "application/json",
    body: JSON.stringify({ detail: "not linked", code: "ORTHANC_SERIES_NOT_LINKED" }),
  }));
  for (const suffix of ["preview", "tissue-heatmap"]) {
    await page.route(`**/api/doctor/cases/slides/slide-wsi/${suffix}/`, (route) => route.fulfill({ status: 200, contentType: "image/jpeg", body: image }));
  }
  await page.route("**/api/doctor/cases/slides/slide-wsi/tiles/**", (route) => route.fulfill({ status: 200, contentType: "image/jpeg", body: image }));
}

function previewCandidate(id: string, ruleCode: string, regimenId: string, regimenCode: string, gene: string, alteration: string) {
  return {
    id,
    rule_code: ruleCode,
    priority: 1,
    cancer_type: "NSCLC",
    regimen: regimenId,
    regimen_detail: { id: regimenId, regimen_code: regimenCode, regimen_name: `${regimenCode} regimen` },
    therapy_components: ["TARGETED_THERAPY"],
    therapy_label: "표적치료",
    treatment_type: "TARGETED_THERAPY",
    match_reasons: [`바이오마커 일치: ${gene} / ${alteration}`],
    matched_drivers: [{ gene_symbol: gene, alteration_codes: [alteration] }],
  };
}
