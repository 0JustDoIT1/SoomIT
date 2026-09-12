FROM pytorch/pytorch:2.6.0-cuda12.4-cudnn9-runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    DEVICE=cuda \
    DETECTOR_MODEL_PATH=/models/detector_final_model.pth \
    CLASSIFICATION_MODEL_PATH=/models/classification_final_model.pth \
    MODEL_REVISION=xray-v1 \
    MAX_IMAGE_BYTES=33554432

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir torchvision==0.21.0 --index-url https://download.pytorch.org/whl/cu124 && \
    pip install --no-cache-dir -r requirements.txt

COPY inference.py server.py ./
COPY models/detector_final_model.pth /models/detector_final_model.pth
COPY models/classification_final_model.pth /models/classification_final_model.pth

RUN useradd --create-home --uid 10001 app && chown -R app:app /app /models
USER app

EXPOSE 8080
CMD ["sh", "-c", "exec uvicorn server:app --host 0.0.0.0 --port ${PORT:-8080} --workers 1 --no-access-log"]
