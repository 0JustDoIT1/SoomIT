import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("pathology API base URL", () => {
  it("uses the local backend when the environment variable is absent", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "");

    const { API_BASE_URL, WORK_ITEMS_API_URL } = await import("./pathology-api");

    expect(API_BASE_URL).toBe("http://127.0.0.1:8000");
    expect(WORK_ITEMS_API_URL).toBe(
      "http://127.0.0.1:8000/api/pathology/work-items/",
    );
  });

  it("uses the configured backend and removes trailing slashes", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.example.test///");

    const {
      API_BASE_URL,
      caseAdequacyAiResultsApiUrl,
      casePathologyAiResultsApiUrl,
      casePathologyDiagnosesApiUrl,
      casePathologyReportsApiUrl,
      pathologyDiagnosisApiUrl,
      pathologyDiagnosisConfirmApiUrl,
      specimenSlidesApiUrl,
    } = await import("./pathology-api");

    expect(API_BASE_URL).toBe("https://api.example.test");
    expect(specimenSlidesApiUrl("specimen/1")).toBe(
      "https://api.example.test/api/pathology/specimens/specimen%2F1/wsis/",
    );
    expect(casePathologyAiResultsApiUrl("case/1")).toBe(
      "https://api.example.test/api/pathology/cases/case%2F1/ai-results/",
    );
    expect(caseAdequacyAiResultsApiUrl("case/1")).toBe(
      "https://api.example.test/api/pathology/cases/case%2F1/adequacy-results/",
    );
    expect(casePathologyDiagnosesApiUrl("case/1")).toBe(
      "https://api.example.test/api/pathology/cases/case%2F1/diagnoses/",
    );
    expect(casePathologyReportsApiUrl("case/1")).toBe(
      "https://api.example.test/api/pathology/cases/case%2F1/reports/",
    );
    expect(pathologyDiagnosisApiUrl("diagnosis/1")).toBe(
      "https://api.example.test/api/pathology/diagnoses/diagnosis%2F1/",
    );
    expect(pathologyDiagnosisConfirmApiUrl("diagnosis/1")).toBe(
      "https://api.example.test/api/pathology/diagnoses/diagnosis%2F1/confirm/",
    );
  });
});
