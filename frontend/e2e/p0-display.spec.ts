import { expect, test } from "@playwright/test";
import { authenticateWithoutLogin, installClinicalApi } from "./fixtures/clinical-api";

for (const status of ["DRAFT", "IN_REVIEW", "CONFIRMED"]) {
  test(`clinical labels follow ${status} for CT and TNM`, async ({ page }) => {
    await installClinicalApi(page);
    await page.route("**/clinical-results/", route => route.fulfill({
      contentType: "application/json",
      body: JSON.stringify([
        { id: "ct-label", workflow_stage: "CT", result_status: status, result_detail: { ct: { finding_summary: "P0 CT clinical fixture" } } },
        { id: "tnm-label", workflow_stage: "PET_CT_TNM", result_status: status, result_detail: { tnm: { t_category: "T2", n_category: "N0", m_category: "M0" } } },
      ]),
    }));
    await authenticateWithoutLogin(page);
    await page.goto("/respiratory/cases/case-treatment");
    const menu = page.getByRole("navigation", { name: "Case 진료 정보 메뉴" });
    await menu.getByRole("button", { name: "흉부 CT", exact: true }).click();
    await expect(page.getByText("P0 CT clinical fixture", { exact: true })).toBeVisible();
    const ctTitle = status === "CONFIRMED" ? "호흡기내과 최종 판단" : status === "DRAFT" ? "호흡기내과 판독 초안" : "호흡기내과 검토 중";
    await expect(page.getByRole("heading", { name: ctTitle, exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "AI 분석 후보", exact: true })).toBeVisible();
    if (status !== "CONFIRMED") await expect(page.getByRole("heading", { name: "호흡기내과 최종 판단", exact: true })).toHaveCount(0);

    await menu.getByRole("button", { name: "PET-CT / TNM 병기", exact: true }).click();
    const workspace = page.getByRole("region", { name: "TNM 작업공간" });
    await expect(workspace).toBeVisible();
    await expect(page.getByRole("heading", { name: ctTitle, exact: true })).toHaveCount(0);
    await expect(workspace.getByText(status === "CONFIRMED" ? "의료진 확정" : status === "DRAFT" ? "판독 초안" : "의료진 검토", { exact: true })).toBeVisible();
    await expect(workspace.getByText(status === "CONFIRMED" ? "확정 결과" : status === "DRAFT" ? "초안 결과" : "검토 결과", { exact: true })).toBeVisible();
    if (status !== "CONFIRMED") {
      await expect(workspace.getByText("의료진 확정", { exact: true })).toHaveCount(0);
      await expect(workspace.getByText("최종 진료 판단", { exact: true })).toHaveCount(0);
    }
    await menu.getByRole("button", { name: "전체 요약", exact: true }).click();
    await expect(workspace).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "진료 요약", exact: true })).toBeVisible();
  });
}
