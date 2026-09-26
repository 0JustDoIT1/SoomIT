import { expect, test } from "@playwright/test";

import { authenticateWithoutLogin, installClinicalApi } from "./fixtures/clinical-api";

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

  await page.getByRole("button", { name: "치료 결정", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("치료 유형").selectOption("TARGETED_THERAPY");
  await dialog.getByRole("textbox", { name: "치료 계획", exact: true }).fill("E2E 치료 계획");
  await dialog.getByRole("button", { name: /E2E Target Regimen/ }).click();
  await dialog.getByRole("button", { name: "다음", exact: true }).click();
  await dialog.getByRole("button", { name: "최종 확정", exact: true }).click();

  await expect(page.getByText("치료계획 확정 완료", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "치료 결정 보기", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "치료 결정 조회" })).toBeVisible();
  await expect(page.getByRole("dialog").getByLabel("치료 유형")).toHaveCount(0);
  await page.getByRole("button", { name: "닫기" }).click();

  await page.getByRole("button", { name: "처방 · 안전성", exact: true }).click();
  const prescriptionSelect = page.getByLabel("처방 선택");
  await expect(prescriptionSelect.getByRole("option", { name: /임시저장/ })).toHaveCount(1);
  await expect(prescriptionSelect.getByRole("option", { name: /검증완료/ })).toHaveCount(1);
  await expect(prescriptionSelect.getByRole("option", { name: /최종확정/ })).toHaveCount(1);
  await expect(page.getByText(/Safety Check/).first()).toBeVisible();
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
  expect(fatalBrowserErrors).toEqual([]);
});
