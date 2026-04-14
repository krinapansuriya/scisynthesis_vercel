# AI Research Assistant

A production-ready Hybrid RAG-based AI system built for precise, hallucination-resistant scientific document analysis.

## Features
- **Modern UI**: Dark theme, glassmorphism, responsive chat interface.
- **Hybrid Retrieval**: Combines FAISS (Semantic) with BM25 (Keyword) for precision context gathering.
- **Evidence-Grounded**: Responses are structured JSON containing the answer, exact source citations, and confidence scores.

## Architecture
- **Frontend**: React + Vite + TypeScript + TailwindCSS
- **Backend**: FastAPI + Python
- **AI Core**: Google Gemini 2.0 Flash + SentenceTransformers

## Quick Start (Docker)

1. Create a `.env` in the `backend/` directory:
```env
GOOGLE_API_KEY=your_gemini_api_key
VECTOR_DB_TYPE=faiss
```

2. Run Docker Compose:
```bash
docker-compose up --build
```
- App: `http://localhost:5173`
- API: `http://localhost:8000/docs`

## Manual Deployment

### Backend (Render / Heroku)
1. `cd backend`
2. `pip install -r requirements.txt`
3. `uvicorn app.main:app --host 0.0.0.0 --port 8000`

### Frontend (Vercel)
1. `cd frontend`
2. `npm install`
3. `npm run build`
4. Set `VITE_API_URL` to your production backend URL.
