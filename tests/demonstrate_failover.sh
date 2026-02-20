#!/bin/bash

# Ensure script halts on error
set -e

echo "======================================"
echo " Demonstrating NGINX Failover "
echo "======================================"

echo ""
echo "[1] Making a request to the US endpoint (/us/health)..."
curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" http://localhost:8080/us/health
echo "You should see HTTP Status: 200"

echo ""
echo "[2] Simulating a node failure by stopping the US backend container..."
docker stop node_backend_us

echo ""
echo "[3] Allowing NGINX a moment to detect failure or fallback on request..."
sleep 2

echo ""
echo "[4] Making another request to the US endpoint (/us/health)..."
echo "This request should be automatically routed by NGINX to the EU backend."
curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" http://localhost:8080/us/health
echo "You should still see HTTP Status: 200, handled by the EU region."

echo ""
echo "[5] Restoring the US backend container..."
docker start node_backend_us

echo ""
echo "Failover demonstration complete!"
