FROM pytorch/pytorch:2.6.0-cuda12.4-cudnn9-runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PDL1_DEVICE=cuda \
    PDL1_CHECKPOINT_PATH=/models/final_model.pth \
    PDL1_MODEL_GCS_URI=gs://soomit-bucket/models/pdl1/final_model/final_model.pth \
    PDL1_MODEL_SHA256=db0e812ab9b38c77b9bbf3725f9d92482b774e2a18cb5361147c793913b7a376 \
    PDL1_MODEL_REVISION=final_model \
    PDL1_MIL_BASELINE_PATH=/app/mil_baseline \
    PDL1_MAX_UPLOAD_BYTES=67108864 \
    PDL1_MAX_PATCHES=5000

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY artifact.py ./
COPY app ./app
COPY mil_baseline ./mil_baseline
RUN mkdir -p /models && useradd --create-home --uid 10001 app && chown -R app:app /app /models
USER app
EXPOSE 8080
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080} --workers 1 --no-access-log"]
