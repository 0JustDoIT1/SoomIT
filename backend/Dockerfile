FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

RUN useradd --create-home --uid 10001 app \
    && mkdir -p /var/lib/celery \
    && chown app:app /var/lib/celery
COPY --chown=app:app . .
USER app

CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]
