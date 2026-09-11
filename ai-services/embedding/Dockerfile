FROM python:3.11-slim
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
WORKDIR /app
RUN pip install --no-cache-dir torch==2.6.0 --index-url https://download.pytorch.org/whl/cpu
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY encoder.py download_model.py ./
ARG MODEL_REVISION=main
RUN MODEL_REVISION=${MODEL_REVISION} python download_model.py
ENV HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 MODEL_PATH=/models/e5 \
    TORCH_NUM_THREADS=2 TOKENIZERS_PARALLELISM=false
RUN useradd --create-home --uid 10001 app
COPY server.py .
USER app
EXPOSE 8080
CMD ["sh", "-c", "exec uvicorn server:app --host 0.0.0.0 --port ${PORT:-8080} --workers 1 --no-access-log"]
