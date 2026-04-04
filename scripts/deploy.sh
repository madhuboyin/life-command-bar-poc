#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

REG=ghcr.io/madhuboyin/life-command-bar-poc
TAG="${TAG:-$(git -C "${REPO_ROOT}" rev-parse --short=7 HEAD)}"

echo "Deploying immutable tag: ${TAG}"

cd "${REPO_ROOT}"

docker buildx build --platform linux/amd64 \
  -f infra/docker/api/Dockerfile \
  -t ${REG}/api:${TAG} \
  --push .

docker buildx build --platform linux/amd64 \
  -f infra/docker/web/Dockerfile \
  --build-arg NEXT_PUBLIC_API_BASE_URL=https://api-lcb.contracttocozy.com/api \
  --build-arg NEXT_PUBLIC_APP_URL=https://lcb.contracttocozy.com \
  -t ${REG}/web:${TAG} \
  --push .

kubectl -n life-command set image deploy/lcb-api lcb-api=${REG}/api:${TAG}
kubectl -n life-command set image deploy/lcb-web lcb-web=${REG}/web:${TAG}

kubectl -n life-command rollout status deploy/lcb-api
kubectl -n life-command rollout status deploy/lcb-web
kubectl -n life-command get pods -l app=lcb-api
kubectl -n life-command get pods -l app=lcb-web

echo "Done. Deployed tag: ${TAG}"
