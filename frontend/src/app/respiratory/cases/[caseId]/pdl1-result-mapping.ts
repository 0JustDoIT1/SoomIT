export type Pdl1Result = {
  id?: string;
  analysis_type: "PDL1_CLASSIFICATION";
  analysis_type_label?: string;
  status?: string;
  status_label?: string;
  model_name?: string;
  model_version_name?: string;
  completed_at?: string | null;
  error_message?: string | null;
  result_detail: {
    pdl1: {
      predicted_class?: number;
      predicted_tps_range?: string;
      predicted_tps_range_label?: string;
      confidence?: string | number;
      probabilities?: { class_0?: number; class_1?: number; class_2?: number };
    };
  };
  created_at?: string;
};

export function selectPdl1Results(payload: unknown): Pdl1Result[] {
  if (!Array.isArray(payload)) return [];

  return payload.filter((item): item is Pdl1Result => {
    if (!isRecord(item) || item.analysis_type !== "PDL1_CLASSIFICATION") return false;
    if (!isRecord(item.result_detail)) return false;
    return isRecord(item.result_detail.pdl1);
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
