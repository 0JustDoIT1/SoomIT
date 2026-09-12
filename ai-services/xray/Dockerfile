FROM pytorch/pytorch:2.6.0-cuda12.4-cudnn9-runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    DEVICE=cuda \
    DETECTOR_MODEL_PATH=/models/detector_final_model.pth \
    CLASSIFICATION_MODEL_PATH=/models/classification_final_model.pth \
    DETECTOR_MODEL_GCS_URI=gs://soomit-bucket/models/xray/xray-v1/detector_final_model.pth \
    CLASSIFICATION_MODEL_GCS_URI=gs://soomit-bucket/models/xray/xray-v1/classification_final_model.pth \
    DETECTOR_MODEL_SHA256=bf80f1d0052e745f477bc4d92a0de52c05c30090449df7875d90093505d1f3c2 \
    CLASSIFICATION_MODEL_SHA256=7f3cec7f00860cebb9497a956dc46b1b1645f8c2ff8676754041db4e716bd5b1 \
    MODEL_REVISION=xray-v1 \
    MAX_IMAGE_BYTES=33554432

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir torchvision==0.21.0 --index-url https://download.pytorch.org/whl/cu124 && \
    pip install --no-cache-dir -r requirements.txt

COPY inference.py server.py artifact.py ./

RUN mkdir -p /models && useradd --create-home --uid 10001 app && chown -R app:app /app /models
USER app

EXPOSE 8080
CMD ["sh", "-c", "exec uvicorn server:app --host 0.0.0.0 --port ${PORT:-8080} --workers 1 --no-access-log"]
