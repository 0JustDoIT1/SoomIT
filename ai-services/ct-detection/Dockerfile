FROM pytorch/pytorch:2.6.0-cuda12.4-cudnn9-runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    DEVICE=cuda \
    MODEL_PATH=/models/best_val_loss.pt \
    MODEL_GCS_URI=gs://soomit-bucket/models/ct-detection/cpmnetv2-hn25-v1.0.0/best_val_loss.pt \
    CPMNET_ROOT=/app/external/CPMNetv2 \
    MODEL_VERSION=cpmnetv2-hn25-v1.0.0 \
    MODEL_SHA256=4d1036ba7bdb7aec132d13ce8d0b760d277146e48511d459e6379c0651d1a009 \
    DEFAULT_SCORE_THRESHOLD=0.9612025618553162 \
    INFERENCE_BATCH_SIZE=4 \
    MAX_CT_BYTES=2147483648 \
    MAX_DICOM_FILES=10000 \
    MAX_EXPANDED_BYTES=4294967296

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY server.py input_io.py artifact.py orthanc_client.py ./
COPY code ./code
COPY config ./config
COPY external/CPMNetv2 ./external/CPMNetv2

RUN mkdir -p /models && useradd --create-home --uid 10001 app && chown -R app:app /app /models
USER app

EXPOSE 8080
CMD ["sh", "-c", "exec uvicorn server:app --host 0.0.0.0 --port ${PORT:-8080} --workers 1 --no-access-log"]
