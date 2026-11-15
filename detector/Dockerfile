# Blink frame service (FastAPI, port 8000). Build from the repo root: see docker-compose.yml.
FROM python:3.14-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app
COPY detector/requirements.txt detector/requirements.txt
RUN pip install --only-binary=:all: --timeout 120 --retries 10 -r detector/requirements.txt

COPY detector/*.py detector/
COPY contract/ contract/

# run as an unprivileged user; data/ (downloads and generated PNGs) is a volume it owns
RUN useradd --create-home --uid 10001 blink \
 && mkdir -p data/raw data/cache \
 && chown -R blink:blink data
USER blink

WORKDIR /app/detector
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD python -c "import os, urllib.request; urllib.request.urlopen('http://127.0.0.1:%s/health' % os.environ.get('PORT', '8000'), timeout=3)"
# HOST: 0.0.0.0 (IPv4) by default, as Docker Compose needs; set HOST=:: if a host's private network is IPv6-only.
# PORT is set by the host, default 8000.
CMD ["sh", "-c", "exec uvicorn main:app --host ${HOST:-0.0.0.0} --port ${PORT:-8000}"]
