# syntax=docker/dockerfile:1
FROM vllm/vllm-openai:v0.9.1
ENV HF_HOME=/root/.cache/huggingface
RUN pip uninstall -y hf_xet hf_transfer
RUN --mount=type=secret,id=hf_token,required=true \
    HF_TOKEN=$(cat /run/secrets/hf_token) \
    python3 -c "from huggingface_hub import snapshot_download; import os; snapshot_download('google/medgemma-4b-it', token=os.environ['HF_TOKEN'])"
ENV HF_HUB_OFFLINE=1
ENV VLLM_USE_V1=0
WORKDIR /app
COPY server.py /app/server.py
EXPOSE 8000
ENTRYPOINT []
CMD ["sh", "-c", "exec python3 -m uvicorn server:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1 --no-access-log"]
