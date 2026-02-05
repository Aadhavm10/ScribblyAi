#!/bin/bash
set -e

echo "=========================================="
echo "ScribblyAi Kubernetes Deployment Script"
echo "=========================================="

# Check if minikube is installed
if ! command -v minikube &> /dev/null; then
    echo "Error: minikube is not installed"
    echo "Install it from: https://minikube.sigs.k8s.io/docs/start/"
    exit 1
fi

# Check if kubectl is installed
if ! command -v kubectl &> /dev/null; then
    echo "Error: kubectl is not installed"
    exit 1
fi

echo ""
echo "[1/8] Starting Minikube..."
minikube start --memory=4096 --cpus=2

echo ""
echo "[2/8] Enabling addons..."
minikube addons enable ingress
minikube addons enable metrics-server

echo ""
echo "[3/8] Setting Docker environment..."
eval $(minikube docker-env)

echo ""
echo "[4/8] Building backend Docker image..."
docker build -t scribbly-backend:latest ../backend

echo ""
echo "[5/8] Applying Kubernetes manifests..."
kubectl apply -f namespace.yaml

# Check if secrets.yaml exists
if [ ! -f secrets.yaml ]; then
    echo ""
    echo "WARNING: secrets.yaml not found!"
    echo "Copy secrets.yaml.example to secrets.yaml and fill in your values"
    echo "Then run: kubectl apply -f secrets.yaml"
    echo ""
else
    kubectl apply -f secrets.yaml
fi

kubectl apply -f configmap.yaml
kubectl apply -f postgres/
kubectl apply -f kafka/

echo ""
echo "[6/8] Waiting for Postgres to be ready..."
kubectl wait --for=condition=ready pod -l app=postgres -n scribbly --timeout=120s || true

echo ""
echo "[7/8] Deploying backend..."
kubectl apply -f backend/
kubectl apply -f ingress.yaml

echo ""
echo "[8/8] Waiting for backend to be ready..."
kubectl wait --for=condition=ready pod -l app=backend -n scribbly --timeout=120s || true

echo ""
echo "=========================================="
echo "Deployment Complete!"
echo "=========================================="
echo ""
echo "Add this to /etc/hosts:"
echo "$(minikube ip) api.scribbly.local"
echo ""
echo "Check status:"
echo "  kubectl get pods -n scribbly"
echo "  kubectl get svc -n scribbly"
echo "  kubectl get hpa -n scribbly"
echo ""
echo "Access backend:"
echo "  curl http://api.scribbly.local/health"
echo "  or: minikube service backend-service -n scribbly --url"
echo ""
