FROM pytorch/pytorch:2.6.0-cuda12.4-cudnn9-runtime

ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 MODEL_REVISION=tnm-t-v1.0.0 \
    nnUNet_results=/models/nnUNet_results nnUNet_raw=/models/nnUNet_raw \
    nnUNet_preprocessed=/models/nnUNet_preprocessed
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends build-essential && rm -rf /var/lib/apt/lists/*
COPY requirements-gpu.txt .
RUN pip install --no-cache-dir -r requirements-gpu.txt
COPY storage_io.py model_io.py t_server.py ./
COPY runtime/nnUNetTrainer_250epochs.py /tmp/nnUNetTrainer_250epochs.py
RUN cp /tmp/nnUNetTrainer_250epochs.py "$(python -c 'import pathlib,nnunetv2; print(pathlib.Path(nnunetv2.__file__).parent / "training/nnUNetTrainer/variants/training_length/nnUNetTrainer_250epochs.py")')" \
    && mkdir -p /models && useradd --create-home --uid 10001 app && chown -R app:app /app /models
USER app
EXPOSE 8080
CMD ["sh", "-c", "exec python -m uvicorn t_server:app --host 0.0.0.0 --port ${PORT:-8080} --workers 1 --no-access-log"]
