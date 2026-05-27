#!/bin/bash
echo "מפעיל Watch Dashboard..."
echo ""
echo "מתקין dependencies..."

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Backend
cd "$SCRIPT_DIR/backend"
pip3 install -r requirements.txt -q

# Frontend
cd "$SCRIPT_DIR/frontend"
npm install --silent

echo ""
echo "התקנה הושלמה!"
echo ""
echo "מפעיל שרתים..."
echo "   Backend: http://localhost:8000"
echo "   Frontend: http://localhost:5173"
echo ""

# Copy .env if not exists
if [ ! -f "$SCRIPT_DIR/backend/.env" ] && [ -f "$SCRIPT_DIR/backend/.env.example" ]; then
  cp "$SCRIPT_DIR/backend/.env.example" "$SCRIPT_DIR/backend/.env"
  echo "נוצר קובץ .env - אנא הוסף את מפתח ה-ANTHROPIC_API_KEY"
fi

# Start backend
cd "$SCRIPT_DIR/backend"
uvicorn main:app --reload --port 8000 &
BACKEND_PID=$!
echo "Backend PID: $BACKEND_PID"

sleep 2

# Seed data
curl -s -X POST http://localhost:8000/api/seed > /dev/null 2>&1

# Start frontend
cd "$SCRIPT_DIR/frontend"
npm run dev &
FRONTEND_PID=$!

echo ""
echo "Watch Dashboard פועל!"
echo "   פתח: http://localhost:5173"
echo ""
echo "לעצירה לחץ Ctrl+C"

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" SIGINT SIGTERM
wait
