# syntax=docker/dockerfile:1
FROM vllm/vllm-openai:v0.9.2
ENV HF_HOME=/root/.cache/huggingface
RUN pip uninstall -y hf_xet hf_transfer
RUN --mount=type=secret,id=hf_token,required=true \
    HF_TOKEN=$(cat /run/secrets/hf_token) \
    python3 -c "from huggingface_hub import snapshot_download; import os; snapshot_download('google/medgemma-4b-it', token=os.environ['HF_TOKEN'])"
ENV HF_HUB_OFFLINE=1
EXPOSE 8000
ENTRYPOINT ["python3", "-m", "vllm.entrypoints.openai.api_server"]
CMD ["--model", "google/medgemma-4b-it", \
     "--host", "0.0.0.0", \
     "--max-model-len", "4096", \
     "--port", "8000", \
     "--gpu-memory-utilization", "0.7", \
     "--enforce-eager", \
     "--disable-log-stats"]
