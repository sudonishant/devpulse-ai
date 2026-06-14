#!/bin/bash

# DevPulse AI Run Script
echo "===================================================="
echo "Starting DevPulse AI Code Reviewer & Security Auditor..."
echo "===================================================="

# Kill any existing processes running on port 8000 and 3000
echo "Cleaning up ports 8000 and 3000..."
fuser -k 8000/tcp 2>/dev/null
fuser -k 3000/tcp 2>/dev/null

# Activate virtual environment and start backend
echo "Starting FastAPI Backend (port 8000)..."
./backend/venv/bin/python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 > ./backend.log 2>&1 &
BACKEND_PID=$!

# Start Next.js frontend
echo "Starting Next.js Frontend (port 3000)..."
cd frontend
npm run dev -- -p 3000 > ../frontend.log 2>&1 &
FRONTEND_PID=$!
cd ..

# Sleep for a moment to let them initialize
sleep 3

# Check if processes are alive
backend_alive=false
frontend_alive=false

if ps -p $BACKEND_PID > /dev/null
then
   echo "✓ Backend is RUNNING (PID: $BACKEND_PID)"
   backend_alive=true
else
   echo "✗ Backend FAILED to start. Check backend.log for details."
fi

if ps -p $FRONTEND_PID > /dev/null
then
   echo "✓ Frontend is RUNNING (PID: $FRONTEND_PID)"
   frontend_alive=true
else
   echo "✗ Frontend FAILED to start. Check frontend.log for details."
fi

if [ "$backend_alive" = true ] && [ "$frontend_alive" = true ]; then
   echo ""
   echo "----------------------------------------------------"
   echo "DevPulse AI Dashboard is ready:"
   echo "👉 Local UI:       http://localhost:3000"
   echo "👉 API Endpoint:   http://localhost:8000"
   echo "----------------------------------------------------"
   echo "Press [Ctrl+C] to stop both servers."
   echo ""
else
   echo "Shutdown incomplete servers..."
   kill $BACKEND_PID 2>/dev/null
   kill $FRONTEND_PID 2>/dev/null
   exit 1
fi

# Handle cleanup on exit
cleanup() {
    echo ""
    echo "Shutting down servers..."
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    exit 0
}

trap cleanup INT

# Keep script running
while true; do
    sleep 1
done
