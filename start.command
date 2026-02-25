#!/bin/bash

# Change to the directory where this script lives (needed for double-click)
cd "$(dirname "$0")"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

echo ""
echo -e "${BOLD}========================================${NC}"
echo -e "${BOLD}      Tempo Influencer — Starting       ${NC}"
echo -e "${BOLD}========================================${NC}"
echo ""

# Check for Node.js
if ! command -v node &>/dev/null; then
  echo -e "${RED}ERROR: Node.js is not installed.${NC}"
  echo ""
  echo "Please install Node.js from https://nodejs.org and try again."
  echo ""
  read -p "Press Enter to close..."
  exit 1
fi

NODE_VERSION=$(node --version)
echo -e "${GREEN}✓${NC} Node.js found ($NODE_VERSION)"

# Install dependencies if needed
if [ ! -d "node_modules" ] || [ ! -d "server/node_modules" ] || [ ! -d "client/node_modules" ]; then
  echo ""
  echo -e "${YELLOW}Installing dependencies (first run only, may take a minute)...${NC}"
  npm install --silent 2>&1
  if [ $? -ne 0 ]; then
    echo -e "${RED}ERROR: Failed to install dependencies.${NC}"
    read -p "Press Enter to close..."
    exit 1
  fi
  echo -e "${GREEN}✓${NC} Dependencies installed"
fi

# Kill any leftover processes on our ports
lsof -ti:3001 | xargs kill -9 2>/dev/null
lsof -ti:5173 | xargs kill -9 2>/dev/null
sleep 1

# Start backend server
echo ""
echo -e "Starting backend server..."
cd server
npx tsx src/index.ts > /tmp/tempo-server.log 2>&1 &
SERVER_PID=$!
cd ..

# Wait for server to be ready (up to 15 seconds)
echo -n "Waiting for server"
for i in $(seq 1 15); do
  sleep 1
  if curl -s http://localhost:3001/api/settings/credentials > /dev/null 2>&1; then
    echo ""
    echo -e "${GREEN}✓${NC} Server running on http://localhost:3001"
    break
  fi
  echo -n "."
  if [ $i -eq 15 ]; then
    echo ""
    echo -e "${RED}ERROR: Server failed to start. Check /tmp/tempo-server.log for details.${NC}"
    kill $SERVER_PID 2>/dev/null
    read -p "Press Enter to close..."
    exit 1
  fi
done

# Start frontend
echo -e "Starting frontend..."
cd client
npx vite > /tmp/tempo-client.log 2>&1 &
CLIENT_PID=$!
cd ..

# Wait for Vite to be ready
sleep 3

echo -e "${GREEN}✓${NC} Frontend running on http://localhost:5173"

# Open browser
echo ""
echo -e "${BOLD}Opening Tempo Influencer in your browser...${NC}"
sleep 1
open http://localhost:5173

echo ""
echo -e "${BOLD}========================================${NC}"
echo -e "${GREEN}  App is running! ${NC}"
echo -e "${BOLD}========================================${NC}"
echo ""
echo "  Open: http://localhost:5173"
echo ""
echo -e "${YELLOW}  Press Ctrl+C to stop the application.${NC}"
echo ""

# Cleanup on exit
cleanup() {
  echo ""
  echo -e "${YELLOW}Shutting down...${NC}"
  kill $SERVER_PID 2>/dev/null
  kill $CLIENT_PID 2>/dev/null
  # Kill any stragglers on our ports
  lsof -ti:3001 | xargs kill -9 2>/dev/null
  lsof -ti:5173 | xargs kill -9 2>/dev/null
  echo -e "${GREEN}Stopped. Goodbye!${NC}"
  exit 0
}

trap cleanup INT TERM

# Keep script alive
wait $SERVER_PID $CLIENT_PID
