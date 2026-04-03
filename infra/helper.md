

docker build -f infra/docker/api/Dockerfile -t lcb-api:latest .
docker build -f infra/docker/web/Dockerfile -t lcb-web:latest .


# API

docker build -t ghcr.io/madhuboyin/life-command-bar-poc/api:latest -f ../../infra/docker/api/Dockerfile -t lcb-api:latest .

docker push ghcr.io/madhuboyin/life-command-bar-poc/api:latest

kubectl -n life-command rollout restart deploy/api-deployment

kubectl delete pods -n life-command -l app=api
kubectl get pods -n life-command -l app=api

# Web

docker build -t ghcr.io/madhuboyin/life-command-bar-poc/web:latest -f ../../infra/docker/web/Dockerfile -t lcb-web:latest .


docker push ghcr.io/madhuboyin/life-command-bar-poc/web:latest

kubectl -n life-command rollout restart deploy/web-deployment
kubectl delete pods -n life-command -l app=web
kubectl get pods -n life-command -l app=web