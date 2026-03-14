#!/bin/bash
set -e

echo "🚀 Starting Deployment..."

SKIP_BUILD=false
for arg in "$@"; do
    if [ "$arg" == "--skip-build" ]; then
        SKIP_BUILD=true
    fi
done

# Check disk space before starting
AVAILABLE_KB=$(df / | tail -1 | awk '{print $4}')
AVAILABLE_GB=$((AVAILABLE_KB / 1024 / 1024))

echo "💾 Available disk space: ${AVAILABLE_GB}GB"

if [ "$AVAILABLE_KB" -lt 2000000 ]; then
    echo "⚠️  Low disk space detected (less than 2GB). Running emergency cleanup..."
    
    # Clean npm cache (aggressive)
    echo "🧹 NUKING npm cache..."
    rm -rf ~/.npm
    npm cache clean --force 2>/dev/null || true
    
    # Remove old PM2 logs
    pm2 flush 2>/dev/null || true
    
    # Clear journal logs (if sudo available)
    echo "🧹 Vacuuming system logs..."
    sudo journalctl --vacuum-time=1d 2>/dev/null || true
    
    # Remove old log files (older than 7 days)
    find ~/backend -name "*.log" -type f -mtime +7 -delete 2>/dev/null || true
    
    # Clean apt cache if we have sudo
    sudo apt-get clean 2>/dev/null || true
    sudo apt-get autoclean 2>/dev/null || true
    
    # Remove old kernels/packages
    sudo apt-get autoremove -y 2>/dev/null || true
    
    # Check space again
    AVAILABLE_KB=$(df / | tail -1 | awk '{print $4}')
    AVAILABLE_GB=$((AVAILABLE_KB / 1024 / 1024))
    echo "💾 Available disk space after cleanup: ${AVAILABLE_GB}GB"
    
    if [ "$AVAILABLE_KB" -lt 300000 ]; then
        echo "❌ Still not enough disk space (less than 300MB). Manual intervention required!"
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

# Remove node_modules BEFORE git clean to avoid conflicts
echo "🧹 Removing node_modules to save space before reinstall..."
rm -rf node_modules || find node_modules -type f -delete 2>/dev/null || true
rm -rf node_modules || true

git clean -fdx -e .env -e dist

# Restore .env if it was deleted
if [ ! -f .env ] && [ -f /tmp/.env.backup ]; then
    echo "🔐 Restoring .env from backup..."
    cp /tmp/.env.backup .env
    rm -f /tmp/.env.backup
elif [ -f /tmp/.env.backup ]; then
    rm -f /tmp/.env.backup
fi

# Remove duplicate uppercase service files (Linux is case-sensitive)
echo "🔧 Cleaning up duplicate service files..."
find src/services -name "[A-Z]*.ts" -delete

# Remove package-lock.json to force regeneration with correct versions
echo "🔄 Regenerating package-lock.json..."
rm -f package-lock.json

# Install all dependencies (Prisma CLI is needed for migrations)
echo "📦 Installing dependencies..."
npm install

echo "🗄️ Running Migrations..."
npx prisma db push --accept-data-loss
npx prisma generate

if [ "$SKIP_BUILD" = false ]; then
    echo "🏗️ Building Backend..."
    # IMPORTANT: Clean dist entirely to avoid stale files with wrong casing
    rm -rf dist 
    npm run build
else
    echo "⏭️ Skipping build as requested (Dist already uploaded)"
    # Verify dist folder exists
    if [ ! -d "dist" ] || [ ! -f "dist/index.js" ]; then
        echo "❌ ERROR: dist folder not found or incomplete. Building now..."
        rm -rf dist
        npm run build
    fi
fi
node copy-prisma.js

# 2. Update Frontend (Sibling Directory)
# Assumes frontend is cloned as a sibling folder named 'frontend', 'client' or 'frontend-temp'
CLIENT_DIR="$BACKEND_DIR/../frontend-temp" 
if [ ! -d "$CLIENT_DIR" ]; then
    CLIENT_DIR="$BACKEND_DIR/../frontend"
fi
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
    
    echo "📦 Installing Frontend dependencies..."
    npm install --legacy-peer-deps
    
    echo "🏗️ Building Frontend..."
    # 800MB is enough for Vite but leaves ~200MB free on 1GB EC2
    NODE_OPTIONS=--max-old-space-size=800 npm run build
    
    # Deploy to Nginx
    echo "📂 Deploying Static Files to Nginx root..."
    sudo mkdir -p /var/www/crm-client
    sudo rm -rf /var/www/crm-client/*
    sudo cp -r dist/* /var/www/crm-client/
    echo "✨ Frontend deployed successfully."
else
    echo "⚠️ Frontend directory not found as sibling at $BACKEND_DIR/../frontend! Skipping frontend build."
fi

echo "▶️ Starting Backend API..."
cd "$BACKEND_DIR"
pm2 delete crm-api || true
pm2 start dist/index.js --name "crm-api"

echo "✅ Deployment Complete!"
