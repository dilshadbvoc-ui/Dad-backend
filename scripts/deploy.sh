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
    
    if [ "$AVAILABLE_KB" -lt 500000 ]; then
        echo "❌ Still not enough disk space (less than 500MB). Manual intervention required!"
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

# Preserve .env (not tracked in git for security)
if [ -f .env ]; then
    echo "🔐 Backing up .env..."
    cp .env /tmp/.env.backup
fi

git fetch origin main
git reset --hard origin/main
git clean -fdx -e .env

# Restore .env if it was deleted
if [ ! -f .env ] && [ -f /tmp/.env.backup ]; then
    echo "🔐 Restoring .env from backup..."
    cp /tmp/.env.backup .env
    rm -f /tmp/.env.backup
elif [ -f /tmp/.env.backup ]; then
    rm -f /tmp/.env.backup
fi

# Always remove node_modules on low disk space servers
echo "🧹 Removing node_modules to save space before reinstall..."
rm -rf node_modules

# Remove duplicate uppercase service files (Linux is case-sensitive)
echo "🔧 Removing duplicate uppercase service files..."
rm -f src/services/WebhookService.ts
rm -f src/services/GoalService.ts
rm -f src/services/AssignmentRuleService.ts
rm -f src/services/SalesTargetService.ts
rm -f src/services/WhatsAppService.ts
rm -f src/services/TaskService.ts
rm -f src/services/NotificationService.ts

# The repository now strictly tracks correctly cased files.
# No need to manually rename files here, as it was causing TS1261 errors
# by incorrectly capitalizing the second letter of files like emiService.ts -> eMIService.ts

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
