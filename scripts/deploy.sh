#!/bin/bash
set -e

echo "🚀 Starting Deployment..."

# Check disk space before starting
AVAILABLE_KB=$(df / | tail -1 | awk '{print $4}')
AVAILABLE_GB=$((AVAILABLE_KB / 1024 / 1024))

echo "💾 Available disk space: ${AVAILABLE_GB}GB"

if [ "$AVAILABLE_KB" -lt 2000000 ]; then
    echo "⚠️  Low disk space detected (less than 2GB). Running emergency cleanup..."
    
    # Clean npm cache
    npm cache clean --force 2>/dev/null || true
    
    # Remove old PM2 logs
    pm2 flush 2>/dev/null || true
    
    # Remove old log files (older than 7 days)
    find ~/backend -name "*.log" -type f -mtime +7 -delete 2>/dev/null || true
    
    # Clean apt cache if we have sudo
    sudo apt-get clean 2>/dev/null || true
    sudo apt-get autoclean 2>/dev/null || true
    
    # Check space again
    AVAILABLE_KB=$(df / | tail -1 | awk '{print $4}')
    AVAILABLE_GB=$((AVAILABLE_KB / 1024 / 1024))
    echo "💾 Available disk space after cleanup: ${AVAILABLE_GB}GB"
    
    if [ "$AVAILABLE_KB" -lt 1000000 ]; then
        echo "❌ Still not enough disk space (less than 1GB). Manual intervention required!"
        echo "Please SSH into the server and run: rm -rf ~/backend/node_modules && npm cache clean --force"
        exit 1
    fi
fi

# Load NVM
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

echo "🛑 Stopping Backend API to free up memory for builds..."
pm2 stop crm-api || true

# 1. Update Backend (Self)
echo "📥 Updating Backend..."
BACKEND_DIR=$(git rev-parse --show-toplevel)
cd "$BACKEND_DIR"

# Clean up stale locks
if [ -f .git/index.lock ]; then
    echo "🧹 Removing stale git lock..."
    rm -f .git/index.lock
fi

git fetch origin main
git reset --hard origin/main

# Clean node_modules if disk space is tight (less than 3GB)
AVAILABLE_KB=$(df / | tail -1 | awk '{print $4}')
if [ "$AVAILABLE_KB" -lt 3000000 ]; then
    echo "🧹 Removing node_modules to save space before reinstall..."
    rm -rf node_modules
fi

npm install --ignore-scripts
echo "🗄️ Running Migrations..."
npx prisma db push --accept-data-loss
npx prisma generate
echo "🏗️ Building Backend..."
NODE_OPTIONS=--max-old-space-size=512 npm run build
node copy-prisma.js

# 2. Update Frontend (Sibling Directory)
# Assumes frontend is cloned as a sibling folder named 'frontend' or 'client'
CLIENT_DIR="$BACKEND_DIR/../frontend" 
if [ ! -d "$CLIENT_DIR" ]; then
    CLIENT_DIR="$BACKEND_DIR/../client"
fi

if [ -d "$CLIENT_DIR" ]; then
    echo "📥 Updating Frontend in $CLIENT_DIR..."
    cd "$CLIENT_DIR"
    
    # Clean up stale locks
    if [ -f .git/index.lock ]; then
        echo "🧹 Removing stale git lock for frontend..."
        rm -f .git/index.lock
    fi

    git fetch origin main
    git reset --hard origin/main
    npm install
    echo "🏗️ Building Frontend..."
    # 800MB is enough for Vite but leaves ~200MB free on 1GB EC2
    NODE_OPTIONS=--max-old-space-size=800 npm run build
    
    # Deploy to Nginx
    echo "📂 Deploying Static Files..."
    sudo mkdir -p /var/www/crm-client
    sudo rm -rf /var/www/crm-client/*
    sudo cp -r dist/* /var/www/crm-client/
else
    echo "⚠️ Frontend directory not found as sibling! Skipping frontend build."
fi

echo "▶️ Restarting Backend API..."
cd "$BACKEND_DIR"
pm2 start dist/index.js --name "crm-api" -- update-env || pm2 restart crm-api

echo "✅ Deployment Complete!"
