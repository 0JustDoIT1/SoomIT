export type Pdl1Result = {
  id?: string;
  analysis_type: "PDL1_ANALYSIS";
  analysis_type_label?: string;
  status?: string;
  status_label?: string;
  model_name?: string;
  model_version_name?: string;
  model_components?: unknown;
  started_at?: string | null;
  completed_at?: string | null;
  error_message?: string | null;
  input_context?: {
    schema_version?: string | null;
    examination_order?: { id?: string; order_type?: string; order_type_label?: string } | null;
    source_asset?: { image_type?: string; workflow_stage?: string; study_instance_uid?: string | null; series_instance_uid?: string | null; acquired_at?: string | null } | null;
    metadata?: { wsi_id?: string; roi_layer?: string };
  };
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
    if (!isRecord(item) || item.analysis_type !== "PDL1_ANALYSIS") return false;
    if (!isRecord(item.result_detail)) return false;
    return isRecord(item.result_detail.pdl1);
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
