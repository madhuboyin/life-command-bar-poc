# Deploy Helper

Use immutable image tags from the current git commit SHA so you never manually look up or edit tags.

## Quick start

```bash
./scripts/deploy.sh
```

## One-shot deploy (API + Web)

```bash
#!/usr/bin/env bash
set -euo pipefail

REG=ghcr.io/madhuboyin/life-command-bar-poc
TAG="${TAG:-$(git rev-parse --short=7 HEAD)}"
PLATFORM="${PLATFORM:-$(
  case "$(uname -m)" in
    x86_64|amd64) echo linux/amd64 ;;
    arm64|aarch64) echo linux/arm64 ;;
    *) echo linux/amd64 ;;
  esac
)}"

echo "Deploying tag: ${TAG}"
echo "Using platform: ${PLATFORM}"

docker buildx build --platform "${PLATFORM}" \
  -f infra/docker/api/Dockerfile \
  -t ${REG}/api:${TAG} \
  --push .

docker buildx build --platform "${PLATFORM}" \
  -f infra/docker/web/Dockerfile \
  --build-arg NEXT_PUBLIC_API_BASE_URL=https://api-lcb.contracttocozy.com/api \
  --build-arg NEXT_PUBLIC_APP_URL=https://lcb.contracttocozy.com \
  -t ${REG}/web:${TAG} \
  --push .

kubectl -n life-command set image deploy/lcb-api api=${REG}/api:${TAG}
kubectl -n life-command set image deploy/lcb-web web=${REG}/web:${TAG}

kubectl -n life-command rollout status deploy/lcb-api
kubectl -n life-command rollout status deploy/lcb-web
kubectl -n life-command get pods -l app=lcb-api
kubectl -n life-command get pods -l app=lcb-web
```

## Optional: override tag manually

If needed, deploy a specific commit tag:

```bash
TAG=f1b4840 ./scripts/deploy.sh
```

Force a specific build target if needed:

```bash
PLATFORM=linux/amd64 ./scripts/deploy.sh
```

## Optional: push Prisma schema after DB changes

```bash
./database/migrations/db_migration.sh
```
