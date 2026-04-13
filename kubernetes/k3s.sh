#!/bin/sh

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

kubectl apply --server-side  -f https://raw.githubusercontent.com/nginx/nginx-gateway-fabric/refs/tags/v2.5.1/deploy/crds.yaml
kubectl apply -f https://raw.githubusercontent.com/nginx/nginx-gateway-fabric/refs/tags/v2.5.1/deploy/default/deploy.yaml

# поменять forward . /etc/resolv.conf на forward . 192.168.1.1, а то proxy на api.resend.com не работает
# оно google dns по умолчанию использует
kubectl -n kube-system edit configmap coredns
kubectl apply -f deployment/*
