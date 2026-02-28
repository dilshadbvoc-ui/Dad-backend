#!/bin/bash

# Manual Deployment Script for Dad CRM Backend
# This script deploys the latest code to EC2 server

set -e  # Exit on any error

echo "🚀 Starting Manual Deployment to EC2..."
echo ""

# Configuration
EC2_HOST="13.233.83.130"
EC2_USER="ubuntu"
SSH_KEY="$HOME/.ssh/dad-crm-new-key"

# Check if SSH key exists
if [ ! -f "$SSH_KEY" ]; then
    echo "❌ SSH key not found at $SSH_KEY"
    echo "Please ensure the SSH key exists"
    exit 1
fi

echo "📡 Connecting to EC2 server..."
echo ""

# Deploy via SSH
ssh -i "$SSH_KEY" "$EC2_USER@$EC2_HOST" << 'ENDSSH'
    set -e
    
    echo "📂 Navigating to backend directory..."
    cd ~/backend || { echo "❌ Backend directory not found!"; exit 1; }
    
    echo "🔄 Pulling latest code from GitHub..."
    # Remove stale git lock if it exists
    [ -f .git/index.lock ] && rm -f .git/index.lock
    
    # Force clean state
    git fetch origin main
    git reset --hard origin/main
    
    echo "🔧 Running deployment script..."
    chmod +x scripts/deploy.sh
    ./scripts/deploy.sh
    
    echo ""
    echo "✅ Deployment completed successfully!"
ENDSSH

echo ""
echo "🎉 Manual deployment finished!"
echo ""
echo "You can verify the deployment by:"
echo "  1. Checking PM2 status: ssh -i $SSH_KEY $EC2_USER@$EC2_HOST 'pm2 status'"
echo "  2. Viewing logs: ssh -i $SSH_KEY $EC2_USER@$EC2_HOST 'pm2 logs crm-api --lines 50'"
echo "  3. Testing API: curl https://api.dadcrm.com/health"
echo ""
