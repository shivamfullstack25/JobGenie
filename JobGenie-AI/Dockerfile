# Use Python 3.11 with a more complete base image
FROM python:3.11-slim-bookworm

WORKDIR /app

# System deps (retry apt on transient network failures)
RUN for i in 1 2 3 4 5; do \
      apt-get update --fix-missing && \
      apt-get install -y --no-install-recommends gcc g++ curl ca-certificates && \
      break || sleep 15; \
    done && \
    rm -rf /var/lib/apt/lists/*

# Lean requirements for reliable Docker builds (full stack in requirements.txt for local dev)
COPY requirements-docker.txt .

ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONPATH=/app

RUN pip install --no-cache-dir --upgrade pip setuptools wheel && \
    pip install --no-cache-dir -r requirements-docker.txt

# Create data directories
RUN mkdir -p /app/vector_db /app/data /app/logs /app/cache

# Copy application code
COPY . .

RUN chmod +x startup.sh && \
    chmod -R 755 /app/vector_db /app/data /app/logs /app/cache

RUN useradd -m -u 1000 jobgenie && \
    chown -R jobgenie:jobgenie /app
USER jobgenie

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=5 \
    CMD curl -f http://localhost:8000/health || exit 1

CMD ["./startup.sh"]
