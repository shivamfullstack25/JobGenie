FROM python:3.11-slim-bookworm

WORKDIR /app

# curl for the health check; gcc/g++ only for wheels that need compiling.
RUN for i in 1 2 3 4 5; do \
      apt-get update --fix-missing && \
      apt-get install -y --no-install-recommends gcc g++ curl ca-certificates && \
      break || sleep 15; \
    done && \
    rm -rf /var/lib/apt/lists/*

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPATH=/app

COPY requirements-docker.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements-docker.txt

COPY main.py .
COPY app ./app

RUN useradd -m -u 1000 jobgenie && chown -R jobgenie:jobgenie /app
USER jobgenie

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=5 \
    CMD curl -f http://localhost:8000/health || exit 1

CMD ["sh", "-c", "exec python -m uvicorn main:app --host 0.0.0.0 --port ${SERVICE_PORT:-8000} --log-level $(echo ${LOG_LEVEL:-info} | tr A-Z a-z)"]
