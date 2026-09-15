# PD-L1 test-sample catalog

Add real, approved sample records to `pdl1_test_samples.json` before enabling a
PD-L1 demonstration run. Do not add annotation bytes or base64 content here.

Each `samples` entry must contain exactly these string fields:

```json
{
  "sample_id": "stable-sample-id",
  "display_name": "Staff-visible test sample name",
  "wsi_gcs_uri": "<approved WSI gs:// URI>",
  "annotation_gcs_uri": "<approved HALO .annotations gs:// URI>",
  "roi_layer": "Tumor",
  "main_index": "<model main index>",
  "pdl1_image_id": "<model image identifier>"
}
```

`roi_layer` must be `Tumor` or `Tumor-JS`. The list API exposes only
`sample_id`, `display_name`, and `roi_layer`; GCS URIs remain backend-only.
