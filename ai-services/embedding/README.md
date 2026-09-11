# Embedding service

CPU-only Cloud Run API for `intfloat/multilingual-e5-base` (768 dimensions).
This service does not read GCS, split PDFs, store vectors, or generate answers.
Django owns document processing and calls this API for passages and queries.

## Build (Git Bash, repository root)

Built locally and pushed with plain Docker, not Cloud Build — no GCS staging
bucket, no `cloudbuild.yaml`. This keeps parity with a future CI pipeline
(e.g. GitHub Actions), which will run the same two commands.

```bash
cd ai-services/embedding
docker build -t gcr.io/soomit-506909/embedding-serve:TAG .
docker push gcr.io/soomit-506909/embedding-serve:TAG
```

Use a meaningful `TAG` (e.g. a git short SHA), not `latest`.
The public model does not require the MedGemma HF secret. Weights are included
in the image and runtime loading is offline. Build logs and `/health` report the
resolved model commit. For subsequent builds, preserve the same model revision:
`--build-arg MODEL_REVISION=MODEL_COMMIT_SHA`.

## Deploy

Replace `TAG` with the tag from the pushed image:

```bash
gcloud run deploy embedding-serve \
  --image=gcr.io/soomit-506909/embedding-serve:TAG \
  --project=soomit-506909 \
  --region=asia-southeast1 \
  --port=8080 \
  --cpu=2 \
  --memory=4Gi \
  --concurrency=1 \
  --min-instances=0 \
  --max-instances=1 \
  --timeout=300 \
  --cpu-throttling \
  --no-allow-unauthenticated
```

This is an initial resource allocation, not a measured latency guarantee.
Benchmark cold and warm query latency and passage throughput after deployment.
One worker keeps one copy of the model; batches are limited to 8 texts.
Cloud Run IAM authenticates requests. Give the Django caller service account
`roles/run.invoker` on this service and send a Google ID token with the service
URL as audience. The Django AI_SERVICE_TOKEN is not a Cloud Run ID token.
Local uvicorn has no IAM protection; bind local testing to loopback only.

## API

`GET /health`: model, resolved revision, dimensions and token limit.

`POST /embed`:

```json
{"texts": ["What is a pulmonary nodule?"], "input_type": "query"}
```

Use `input_type: "passage"` for document chunks. Send raw text without E5
prefixes: the server prepends `query: ` or `passage: `. Response includes
`embeddings` (one normalized 768-number vector per text, in input order),
`token_counts`, `model`, `revision`, `dimensions` and `input_type`.

The 512-token limit includes prefix and special tokens. Oversize input returns
422 rather than silently dropping evidence. Django must split oversized chunks
at sentence boundaries and retry. Preserve the model revision alongside stored
vectors and use the same revision for queries; a model change needs re-embedding.

## Validation

```bash
python -m unittest test_server -v
```

API tests use a fake encoder and do not validate real model quality. Build-time
validation loads the actual model/tokenizer and checks dimensions. Deployment
acceptance still requires Korean-query/English-passage ranking checks, including
the supplied NCI document, plus memory and cold-start measurements.

Model usage and license: https://huggingface.co/intfloat/multilingual-e5-base
