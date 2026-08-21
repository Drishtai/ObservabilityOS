# @observability-os/shipper

**Lightweight zero-dependency container log shipper and metrics sidecar agent** for [ObservabilityOS](https://github.com/Vaibhav-Singh2/ObservabilityOS).

## Overview

`@observability-os/shipper` (`obs-shipper`) runs as a lightweight process or container sidecar alongside your Docker containers and microservices. It tails log files or reads from STDIN, parses structured/unstructured formats, redacts sensitive PII locally, periodically samples host/container metrics, and batches them into ObservabilityOS.

## Features

- **Multi-Format Auto-Parser**:
  - Docker container JSON logs (`{"log":"...","stream":"stdout","time":"..."}`)
  - Pino, Winston, Morgan, and Bunyan JSON log lines
  - Nginx and Apache Web Access Logs (with 4xx/5xx status code error mapping)
  - Syslog (RFC5424) and bracketed plain text logs
- **Local Zero-Dependency PII Scrubbing**: Redacts passwords, API tokens, JWTs, and credit card numbers _before_ sending them to the cloud.
- **Real-Time File Tailer**: Watches files with byte-offset tracking and log rotation recovery.
- **STDIN Streaming**: Pipe any process output directly into `obs-shipper`.
- **System Metrics Sampler**: Periodically captures CPU and memory metrics.
- **Resilient Batch Ingestion**: In-memory queuing with automatic retries.

## Installation & CLI Usage

### 1. Via NPX / Global Install

```bash
npm install -g @observability-os/shipper

# Tail an application log file
obs-shipper \
  --api-key obs_sk_your_key \
  --service billing-service \
  --env prod \
  --tail /var/log/app.log \
  --enable-metrics
```

### 2. Streaming via STDIN Pipe

```bash
docker logs -f my-container | obs-shipper \
  --api-key obs_sk_your_key \
  --service my-container \
  --stdin \
  --enable-metrics
```

## Docker Sidecar Deployment

Deploy as a sidecar container in `docker-compose.yml`:

```yaml
version: "3.8"

services:
  web-app:
    image: my-company/web-app:latest
    volumes:
      - app-logs:/var/log/app

  observability-shipper:
    image: ghcr.io/vaibhav-singh2/observabilityos-shipper:latest
    environment:
      - OBSERVABILITY_API_KEY=obs_sk_your_key
      - OBSERVABILITY_ENDPOINT=https://your-observabilityos-instance.com
      - OBSERVABILITY_SERVICE=web-app
      - OBSERVABILITY_ENV=prod
    volumes:
      - app-logs:/var/log/app:ro
    command:
      - "--tail"
      - "/var/log/app/app.log"
      - "--from-beginning"
      - "--enable-metrics"
    restart: unless-stopped
    depends_on:
      - web-app

volumes:
  app-logs:
```

## CLI Options

| Flag                  | Env Var                  | Default                 | Description                            |
| --------------------- | ------------------------ | ----------------------- | -------------------------------------- |
| `--api-key, -k`       | `OBSERVABILITY_API_KEY`  | —                       | Project API Key _(Required)_           |
| `--service, -s`       | `OBSERVABILITY_SERVICE`  | `app`                   | Service name label                     |
| `--env, -e`           | `OBSERVABILITY_ENV`      | `prod`                  | Environment (`prod`, `staging`, `dev`) |
| `--endpoint`          | `OBSERVABILITY_ENDPOINT` | `http://localhost:3000` | ObservabilityOS Base URL               |
| `--tail, -t`          | —                        | —                       | Path to log file to tail               |
| `--from-beginning`    | —                        | `false`                 | Read from file start on boot           |
| `--stdin`             | —                        | `false`                 | Stream logs from standard input        |
| `--enable-metrics`    | —                        | `false`                 | Periodically collect CPU & Memory      |
| `--batch-size`        | —                        | `25`                    | Max logs per HTTP batch                |
| `--flush-interval-ms` | —                        | `1500`                  | Milliseconds between batch flushes     |

## License

MIT © ObservabilityOS
