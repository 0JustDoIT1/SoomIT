FROM vllm/vllm-openai:latest

ENV HF_HOME=/models

EXPOSE 8080

CMD ["--model", "google/medgemma-4b-it", \
     "--host", "0.0.0.0", \
     "--port", "8080", \
     "--gpu-memory-utilization", "0.85", \
     "--max-model-len", "4096", \
     "--trust-remote-code"]
