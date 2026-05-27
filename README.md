# Watch Pro - מערכת ניהול שעוני יוקרה

דשבורד מקצועי לסוחרי שעוני יוקרה, עם ניהול מלאי, מעקב מחירים, יצירת מודעות AI, ניהול קהילה ומעקב פיננסי.

## טכנולוגיות

- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS
- **Backend**: Python FastAPI + SQLite + SQLAlchemy
- **AI**: Anthropic Claude API (claude-sonnet-4-6)

## התקנה מהירה

```bash
chmod +x start.sh
./start.sh
```

## התקנה ידנית

### Backend

```bash
cd backend
pip3 install -r requirements.txt
cp .env.example .env
# ערוך את .env והוסף את מפתח ה-ANTHROPIC_API_KEY
uvicorn main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## הגדרת סביבה

ערוך את הקובץ `backend/.env`:

```env
ANTHROPIC_API_KEY=your_key_here
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
FROM_EMAIL=your_email@gmail.com
```

## אתחול נתוני דוגמה

לאחר הפעלת ה-backend, הרץ:

```bash
curl -X POST http://localhost:8000/api/seed
```

## גישה לאפליקציה

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs

## תכונות

### ניהול מלאי
- הוספה, עריכה ומחיקה של שעונים
- העלאת תמונות מרובות
- העלאת מסמכים (תעודות, חשבוניות)
- ניהול סטטוס (זמין/שמור/נמכר)

### איתור מחירים
- חיפוש ב-Chrono24
- שמירת מודעות מעניינות
- הגדרת התראות מחיר

### יצירת מודעות AI
- יצירת מודעות בעברית ואנגלית עם Claude AI
- תמיכה בפלטפורמות: WhatsApp, Facebook, Instagram, יד2
- עריכה וצפייה בטקסט

### ניהול קהילה
- ניהול אנשי קשר
- שליחת ניוזלטר לאימייל
- תבניות מוכנות לניוזלטר
- היסטוריית שליחות

### מעקב פיננסי
- מעקב אוטומטי של רכישות ומכירות
- גרף ביצועים חודשי
- חישוב רווח/הפסד
- ניהול הוצאות נוספות
