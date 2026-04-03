# API

docker build \
  -t ghcr.io/madhuboyin/life-command-bar-poc/api:latest \
  -f infra/docker/api/Dockerfile \
  -t lcb-api:latest \
  .

docker push ghcr.io/madhuboyin/life-command-bar-poc/api:latest

kubectl -n life-command rollout restart deploy/lcb-api
kubectl -n life-command rollout status deploy/lcb-api
kubectl -n life-command get pods -l app=lcb-api

# Optional: push Prisma schema to DB after schema changes
./database/migrations/db_migration.sh

# Web

docker build \
  --build-arg NEXT_PUBLIC_API_BASE_URL=https://api-lcb.contracttocozy.com/api \
  --build-arg NEXT_PUBLIC_APP_URL=https://lcb.contracttocozy.com \
  -t ghcr.io/madhuboyin/life-command-bar-poc/web:latest \
  -f infra/docker/web/Dockerfile \
  -t lcb-web:latest \
  .

docker push ghcr.io/madhuboyin/life-command-bar-poc/web:latest

kubectl -n life-command rollout restart deploy/lcb-web
kubectl -n life-command rollout status deploy/lcb-web
kubectl -n life-command get pods -l app=lcb-web
