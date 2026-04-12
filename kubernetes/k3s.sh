#!/bin/sh

docker run \
  --privileged \
  --name k3s-server-1 \
  --hostname k3s-server-1 \
  -p 6443:6443 \
  -d rancher/k3s:v1.35.3-k3s1 \
  server
docker run  --privileged  --name k3s-agent-1 --hostname k3s-agent-1 --network host -d rancher/k3s:v1.35.3-k3s1 server
docker run  --privileged  --name k3s-agent-1 --hostname k3s-agent-1 --network host -d rancher/k3s:v1.35.3-k3s1 agent
sleep 15


docker compose -f k3s-compose.yml up

docker build -t cr.classic.duckdns.org:58083/idurar-backend ../backend  
docker build -t cr.classic.duckdns.org:58083/idurar-frontend ../frontend

# docker login cr.classic.duckdns.org:58083

docker push cr.classic.duckdns.org:58083/idurar-backend 
docker push cr.classic.duckdns.org:58083/idurar-frontend 

mkdir -p ~/.config/kube
docker cp k3s-server-1:/etc/rancher/k3s/k3s.yaml ~/.config/kube/config 
export KUBECONFIG=~/.config/kube/config

kubectl create secret tls deployment-risks-tls --cert ./certs/fullchain.pem --key ./certs/privkey.pem
kubectl create secret generic backend-env --from-env-file backend-secrets.env
kubectl create secret docker-registry cr-classic-registry-secret --docker-server=cr.classic.duckdns.org:58083 --docker-username=example --docker-password=example
