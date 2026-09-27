import path from "node:path";
import { expect, test } from "@playwright/test";
import { authenticateWithoutLogin, installClinicalApi } from "./fixtures/clinical-api";

for (const segmentationAvailable of [false, true]) {
test(`synthetic CT, annotation persistence and cleanup with segmentation ${segmentationAvailable ? "available" : "unavailable"}`, async ({ page }) => {
  test.setTimeout(60_000);
  await installClinicalApi(page);
  const errors: string[] = [];
  const annotations: Record<string, unknown>[] = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", message => {
    if (message.type() === "error" && !message.text().startsWith("Failed to load resource:")) errors.push(message.text());
  });
  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url());
    const reply = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (url.pathname.endsWith("/image-annotations/")) {
      if (route.request().method() === "POST") {
        const annotation = { id: "annotation-qa", ...route.request().postDataJSON() };
        annotations.push(annotation);
        return reply(annotation, 201);
      }
      return reply(annotations);
    }
    if (url.pathname.endsWith("/image-assets/")) return reply([{ id: "ct-synthetic", workflow_stage: "CT", image_type: "CT", status: "READY", series_instance_uid: "1.2.826.0.1.3680043.10.999.3" }]);
    if (url.pathname.endsWith("/dicom-web/instances/")) return reply(Array.from({ length: 8 }, (_, i) => ({ "00080018": { Value: [`1.2.826.0.1.3680043.10.999.1.${i + 1}`] } })));
    const instance = url.pathname.match(/\/dicom-web\/instances\/1\.2\.826\.0\.1\.3680043\.10\.999\.1\.(\d)\/$/);
    if (instance) return route.fulfill({ contentType: "application/dicom", path: path.join(__dirname, "fixtures", "synthetic-ct", `${instance[1]}.dcm`) });
    if (url.pathname.includes("/segmentation/")) {
      if (!segmentationAvailable) return reply({ detail: "QA segmentation unavailable" }, 503);
      if (url.pathname.endsWith("/labelmap/")) return route.fulfill({ contentType: "application/octet-stream", body: Buffer.alloc(64 * 64 * 8, 1) });
      return reply({ schema_version: "1", scalar_type: "uint8", dimensions: [64, 64, 8], spacing: [1, 1, 1], origin: [0, 0, 0], direction: [1, 0, 0, 0, 1, 0, 0, 0, 1], segments: [{ segment_index: 1, id: "qa", name: "QA overlay", category: "NODULE", color: [255, 0, 0], default_opacity: 0.5 }], labelmap_url: "fixture" });
    }
    return route.fallback();
  });
  await authenticateWithoutLogin(page);
  await page.goto("/respiratory/cases/case-ct?openCurrentEvidence=1");
  if (!segmentationAvailable) await expect(page.getByText(/CT 원본은 정상 표시 중입니다/)).toBeVisible({ timeout: 45_000 });
  else await expect.poll(async () => page.getByLabel("CT Axial viewer", { exact: true }).locator("..").locator("canvas.pointer-events-none").evaluate((canvas: HTMLCanvasElement) => {
    const data = canvas.getContext("2d")?.getImageData(0, 0, canvas.width, canvas.height).data;
    return data ? Array.from(data).some((value, index) => index % 4 === 3 && value > 0) : false;
  })).toBe(true);
  await expect(page.getByLabel("CT Axial viewer", { exact: true }).locator("canvas")).toBeVisible();
  await page.getByRole("button", { name: "측정", exact: true }).click();
  const axial = await page.getByLabel("CT Axial viewer", { exact: true }).boundingBox();
  if (!axial) throw new Error("Axial viewport missing");
  await page.mouse.move(axial.x + axial.width * 0.4, axial.y + axial.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(axial.x + axial.width * 0.6, axial.y + axial.height * 0.5, { steps: 10 });
  await page.mouse.up();
  await expect.poll(() => annotations.length).toBe(1);
  expect(annotations[0].annotation_type).toBe("LENGTH");
  await page.screenshot({ path: `../reports/workflow-ct-synthetic-${segmentationAvailable}.png` });
  await page.getByRole("button", { name: "Axial 확대", exact: true }).click();
  await expect(page.getByRole("button", { name: "전체 CT 보기", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "전체 CT 보기", exact: true }).click();
  await page.getByRole("navigation", { name: "Case 진료 정보 메뉴" }).getByRole("button", { name: "흉부 X선", exact: true }).click();
  await page.getByRole("navigation", { name: "Case 진료 정보 메뉴" }).getByRole("button", { name: "흉부 CT", exact: true }).click();
  if (!segmentationAvailable) await expect(page.getByText(/CT 원본은 정상 표시 중입니다/)).toBeVisible();
  else await expect(page.getByLabel("CT Axial viewer", { exact: true }).locator("canvas")).toBeVisible();
  expect(errors).toEqual([]);
});
}
