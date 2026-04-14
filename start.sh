#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Start backend on port 8002
cd "$SCRIPT_DIR/backend" && python3 -m uvicorn app.main:app --host localhost --port 8002 &
BACKEND_PID=$!

# Start frontend dev server on port 5000
cd "$SCRIPT_DIR/frontend" && npm run dev

# Cleanup backend when frontend exits
kill $BACKEND_PID 2>/dev/null