# Per-service Dockerfile for customer-service.
#
# Build from the repo ROOT, for example:
#   docker build --platform linux/amd64 \
#     -f services/customer-service/Dockerfile \
#     -t loan-mgmt/customer-service:latest .
#
# The GitLab CI pipeline (.gitlab-ci.yml) builds these with kaniko using
# --context=${CI_PROJECT_DIR} and
# --dockerfile=services/customer-service/Dockerfile.

FROM python:3.11-slim

WORKDIR /app

# curl is required for the container HEALTHCHECK below.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies first to maximise Docker layer cache hits.
COPY services/customer-service/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# Copy the shared library (JWT middleware, security helpers, models).
COPY shared /app/shared

# Copy the per-service application code.
COPY services/customer-service/app /app/app

ENV PYTHONPATH="/app/shared:${PYTHONPATH}" \
    SERVICE_NAME=customer-service \
    SERVICE_PORT=8002

EXPOSE 8002

# Drop to a non-root account before runtime.
RUN useradd -r -u 1001 appuser
USER appuser

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -fsS http://localhost:8002/health || exit 1

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${SERVICE_PORT}"]
