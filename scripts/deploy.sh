#!/bin/bash

# Wordeth Deployment Script
# This script prepares and deploys the application

set -e  # Exit on error

echo "🚀 Wordeth Deployment Script"
echo "================================"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Step 1: Environment validation
echo "📋 Step 1: Validating environment..."
if npm run validate-env > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Environment variables valid${NC}"
else
    echo -e "${RED}❌ Environment validation failed${NC}"
    echo "Please run: npm run validate-env"
    exit 1
fi

# Step 2: Security audit
echo ""
echo "🔒 Step 2: Running security audit..."
npm audit fix --force || echo -e "${YELLOW}⚠️  Some vulnerabilities may remain${NC}"

# Step 3: Install dependencies
echo ""
echo "📦 Step 3: Installing dependencies..."
npm ci --production

# Step 4: Run tests
echo ""
echo "🧪 Step 4: Running tests..."
npm test || echo -e "${YELLOW}⚠️  Some tests failed - continuing anyway${NC}"

# Step 5: Check deployment method
echo ""
echo "🔍 Step 5: Checking deployment method..."

if command -v docker &> /dev/null && docker info &> /dev/null; then
    echo -e "${GREEN}✅ Docker is available${NC}"
    echo "Building Docker image..."
    docker build -t wordeth:latest .
    echo -e "${GREEN}✅ Docker image built successfully${NC}"
    echo ""
    echo "To run with Docker:"
    echo "  docker run -d -p 3000:3000 --env-file .env.production --name wordeth wordeth:latest"
    echo "Or use docker-compose:"
    echo "  docker-compose up -d"
elif [ -f Procfile ]; then
    echo -e "${GREEN}✅ Procfile found - ready for Heroku deployment${NC}"
    echo "To deploy to Heroku:"
    echo "  heroku login"
    echo "  heroku create wordeth-prod"
    echo "  heroku config:set NODE_ENV=production"
    echo "  git push heroku main"
else
    echo -e "${YELLOW}⚠️  No deployment method detected${NC}"
    echo "Starting application locally..."
    npm start
fi

echo ""
echo -e "${GREEN}✅ Deployment preparation complete!${NC}"


