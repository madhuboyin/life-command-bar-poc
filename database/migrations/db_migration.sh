#!/bin/bash

# 1. Config
NAMESPACE="production"
DB_NAME="lcb_poc" # <--- IMPORTANT: Ensure this is the POC DB
CONFIGMAP_NAME="lcb-prisma-schema"
SCHEMA_PATH="apps/api/prisma/schema.prisma"
IMAGE="ghcr.io/madhuboyin/contract-to-cozy/backend:latest"

echo "🚀 Starting Schema Push for $DB_NAME..."

# 2. Update the ConfigMap with the NEW schema
kubectl create configmap $CONFIGMAP_NAME -n $NAMESPACE \
  --from-file=schema.prisma=$SCHEMA_PATH \
  --dry-run=client -o yaml | kubectl apply --server-side -f -

# 3. Grab the Production Password
export PASSWORD=$(kubectl get secret postgres-credentials -n $NAMESPACE \
  -o jsonpath='{.data.POSTGRES_PASSWORD}' | base64 -d)

# 4. Launch the Job
cat <<EOF | kubectl apply -f -
apiVersion: batch/v1
kind: Job
metadata:
  name: lcb-migrate-$(date +%s)
  namespace: $NAMESPACE
spec:
  ttlSecondsAfterFinished: 300
  template:
    spec:
      restartPolicy: Never
      containers:
      - name: migrate
        image: $IMAGE
        command:
          - sh
          - -c
          - |
            echo "Pushing schema to $DB_NAME..."
            npx prisma db push --accept-data-loss --skip-generate --schema=/config/schema.prisma
        env:
        - name: DATABASE_URL
          value: "postgresql://postgres:${PASSWORD}@postgres.${NAMESPACE}.svc.cluster.local:5432/${DB_NAME}?schema=public"
        volumeMounts:
        - name: schema-volume
          mountPath: /config
      volumes:
      - name: schema-volume
        configMap:
          name: $CONFIGMAP_NAME
EOF

# 5. Follow the logs
echo "⏳ Waiting for job to start..."
sleep 3
JOB=$(kubectl get jobs -n $NAMESPACE --sort-by=.metadata.creationTimestamp -o name | tail -1)
kubectl logs -f -n $NAMESPACE $JOB