#!/usr/bin/env bash

set -euo pipefail

NAMESPACE="${NAMESPACE:-life-command}"
CONFIGMAP_NAME="${CONFIGMAP_NAME:-lcb-prisma-schema}"
SECRET_NAME="${SECRET_NAME:-lcb-secrets}"
SECRET_KEY="${SECRET_KEY:-DATABASE_URL}"
IMAGE="${IMAGE:-ghcr.io/madhuboyin/life-command-bar-poc/api:latest}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
SCHEMA_PATH="${SCHEMA_PATH:-${REPO_ROOT}/apps/api/prisma/schema.prisma}"
JOB_NAME="lcb-prisma-db-push-$(date +%s)"

if [[ ! -f "${SCHEMA_PATH}" ]]; then
  echo "Schema file not found: ${SCHEMA_PATH}" >&2
  exit 1
fi

echo "Preparing Prisma schema configmap in namespace ${NAMESPACE}..."
kubectl -n "${NAMESPACE}" create configmap "${CONFIGMAP_NAME}" \
  --from-file=schema.prisma="${SCHEMA_PATH}" \
  --dry-run=client -o yaml | kubectl apply -f -

echo "Launching migration job ${JOB_NAME} with image ${IMAGE}..."
cat <<EOF | kubectl apply -f -
apiVersion: batch/v1
kind: Job
metadata:
  name: ${JOB_NAME}
  namespace: ${NAMESPACE}
spec:
  ttlSecondsAfterFinished: 300
  backoffLimit: 0
  template:
    spec:
      restartPolicy: Never
      containers:
        - name: migrate
          image: ${IMAGE}
          imagePullPolicy: IfNotPresent
          command:
            - sh
            - -c
            - |
              set -e
              npx prisma db push --accept-data-loss --skip-generate --schema=/config/schema.prisma
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: ${SECRET_NAME}
                  key: ${SECRET_KEY}
          volumeMounts:
            - name: schema-volume
              mountPath: /config
      volumes:
        - name: schema-volume
          configMap:
            name: ${CONFIGMAP_NAME}
EOF

echo "Waiting for migration job to complete..."
if kubectl -n "${NAMESPACE}" wait --for=condition=Complete --timeout=240s "job/${JOB_NAME}"; then
  kubectl -n "${NAMESPACE}" logs "job/${JOB_NAME}"
  echo "Prisma schema push completed."
  exit 0
fi

echo "Migration job did not complete successfully. Collecting diagnostics..."
kubectl -n "${NAMESPACE}" describe "job/${JOB_NAME}" || true
kubectl -n "${NAMESPACE}" logs "job/${JOB_NAME}" || true
exit 1
