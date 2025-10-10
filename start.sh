#!/bin/bash

echo "🎮 Transcendence Setup"
echo "====================="
echo ""

# Try to auto-detect IP
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    DETECTED_IP=$(ip route get 1.1.1.1 | awk '{print $7; exit}')
elif [[ "$OSTYPE" == "darwin"* ]]; then
    DETECTED_IP=$(ipconfig getifaddr en0 || ipconfig getifaddr en1)
else
    DETECTED_IP=$(hostname -I | awk '{print $1}')
fi

if [ -n "$DETECTED_IP" ]; then
    echo "🔍 Detected IP address: $DETECTED_IP"
    read -p "Use this IP? (y/n, default: y): " USE_DETECTED
    USE_DETECTED=${USE_DETECTED:-y}
    
    if [[ "$USE_DETECTED" =~ ^[Yy]$ ]]; then
        HOST_IP=$DETECTED_IP
    else
        read -p "Enter your host IP address: " HOST_IP
    fi
else
    read -p "Enter your host IP address: " HOST_IP
fi

# Validate IP format (basic check)
if [[ ! $HOST_IP =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "❌ Invalid IP format. Please enter a valid IP address (e.g., 192.168.1.100)"
    exit 1
fi

echo ""
echo "✅ Using IP: $HOST_IP"
echo "📡 Backend will be at: http://$HOST_IP:3000"
echo "🎮 Frontend will be at: http://$HOST_IP:5173"
echo ""
echo "Share this with remote players: http://$HOST_IP:5173"
echo ""

# Export and start
export VITE_BACKEND_URL="http://$HOST_IP:3000"
docker-compose up "$@"