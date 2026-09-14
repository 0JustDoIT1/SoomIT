FROM pytorch/pytorch:2.6.0-cuda12.4-cudnn9-runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PATHOLOGY_DEVICE=cuda \
    PATHOLOGY_MODEL_REVISION=pathology-analysis-v1 \
    PATHOLOGY_TISSUE_MODEL_PATH=/models/clam_tissue.pt \
    PATHOLOGY_GENE_MODEL_PATH=/models/clam_gene.pt \
    PATHOLOGY_TISSUE_MODEL_GCS_URI=gs://soomit-bucket/models/pathology-analysis/tissue/clam_model_full.pt \
    PATHOLOGY_GENE_MODEL_GCS_URI=gs://soomit-bucket/models/pathology-analysis/gene/clam_mutation_model_full.pt \
    PATHOLOGY_TISSUE_MODEL_SHA256=d24bc8dc6929778bf9faf31a67bec83e4b05a010b292085c7c9fb15271e9cf25 \
    PATHOLOGY_GENE_MODEL_SHA256=683e833d1c2aef17a5b321183eb46265e77c0abd7c850f6723d05935ba80e372 \
    PATHOLOGY_MAX_PATCHES=10000 \
    PATHOLOGY_UNI2H_BATCH_SIZE=32 \
    HF_HOME=/models/huggingface \
    HF_HUB_CACHE=/models/huggingface

WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends libopenslide0 \
    && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
COPY .hf-cache /models/huggingface
ENV HF_HUB_OFFLINE=1
RUN useradd --create-home --uid 10001 app \
    && mkdir -p /models \
    && chown -R app:app /app /models
USER app
EXPOSE 8080
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080} --workers 1 --no-access-log"]
