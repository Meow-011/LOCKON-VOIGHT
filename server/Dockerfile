# LOCKON VOIGHT — Server Dockerfile (Production Multi-Stage)
# Stage 1: Build dependencies
FROM python:3.12-slim AS builder

WORKDIR /build

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# Stage 2: Production runtime
FROM python:3.12-slim AS runtime

LABEL maintainer="LOCKON Project"
LABEL description="LOCKON VOIGHT — Integrity Protocol API Server"

WORKDIR /app

# Copy installed dependencies from builder
COPY --from=builder /install /usr/local

# Create non-root user
RUN groupadd -r voight && useradd -r -g voight -d /app voight

# Copy application code
COPY . .

# Fix permissions
RUN chown -R voight:voight /app

USER voight

# Expose API and gRPC ports
EXPOSE 8000 50051

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health')" || exit 1

# Run with production settings
ENV ENVIRONMENT=production
ENV DEBUG=false

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4", "--access-log"]
