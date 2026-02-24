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

# Always remove node_modules on low disk space servers
echo "🧹 Removing node_modules to save space before reinstall..."
rm -rf node_modules

# Remove package-lock.json to force regeneration with correct versions
echo "🔄 Regenerating package-lock.json..."
rm -f package-lock.json

# Use npm install with production only to save space
echo "📦 Installing production dependencies only..."
npm install --omit=dev --ignore-scripts
echo "🗄️ Running Migrations..."
npx prisma db push --accept-data-loss
npx prisma generate
echo "🏗️ Building Backend..."
NODE_OPTIONS=--max-old-space-size=512 npm run build
node copy-prisma.js

# 2. Skip Frontend Build on Backend Server
# Frontend is deployed separately on Vercel
echo "⏭️  Skipping frontend build (deployed separately on Vercel)"

echo "▶️ Restarting Backend API..."
cd "$BACKEND_DIR"
pm2 start dist/index.js --name "crm-api" -- update-env || pm2 restart crm-api

echo "✅ Deployment Complete!"
