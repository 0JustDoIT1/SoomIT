FROM pytorch/pytorch:2.6.0-cuda12.4-cudnn9-runtime

ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 MODEL_REVISION=tnm-m-v1.0.0 \
    nnUNet_results=/models/nnUNet_results nnUNet_raw=/models/nnUNet_raw \
    nnUNet_preprocessed=/models/nnUNet_preprocessed
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*
COPY requirements-gpu.txt .
RUN pip install --no-cache-dir -r requirements-gpu.txt
RUN python -m venv --system-site-packages /opt/totalseg \
    && /opt/totalseg/bin/pip install --no-cache-dir TotalSegmentator==2.18.0
ENV TOTALSEG_HOME_DIR=/opt/totalseg-home
RUN mkdir -p /opt/totalseg-home \
    && for attempt in 1 2 3 4 5; do \
         /opt/totalseg/bin/totalseg_download_weights -t total && break; \
         if [ "$attempt" = 5 ]; then exit 1; fi; \
         sleep 10; \
       done
COPY storage_io.py model_io.py pet_dicom.py m_pipeline.py m_server.py ./
COPY runtime ./runtime
COPY resources ./resources
RUN cp runtime/nnUNetTrainer_100epochs_Save10.py "$(python -c 'import pathlib,nnunetv2; print(pathlib.Path(nnunetv2.__file__).parent / "training/nnUNetTrainer/variants/training_length/nnUNetTrainer_100epochs_Save10.py")')" \
    && python -c "import m_pipeline, pet_dicom" \
    && mkdir -p /models && useradd --create-home --uid 10001 app && chown -R app:app /models /opt/totalseg /opt/totalseg-home
USER app
EXPOSE 8080
CMD ["sh", "-c", "exec python -m uvicorn m_server:app --host 0.0.0.0 --port ${PORT:-8080} --workers 1 --no-access-log"]
