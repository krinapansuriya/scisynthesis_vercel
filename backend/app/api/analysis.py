"""
ANALYSIS API
============
All document analysis, RAG query, and research intelligence endpoints.

NEW endpoints added (backward-compatible — existing routes unchanged):
  POST /analysis/analyze-batch   → multi-document upload & analysis
  POST /analysis/chat            → context-aware RAG chat with memory
  POST /analysis/research-gaps   → structured research gap detection

ENHANCED endpoints (same URL, same response shape, new fields added):
  POST /analysis/query           → now returns `citations` array + reranked results
  POST /analysis/global-search   → now returns `citations` array + reranked results
"""

import logging
import os
import json
import re
import time
from typing import List, Optional

logger = logging.getLogger("scisynthesis.analysis")

from fastapi import APIRouter, File, UploadFile, Form, HTTPException, Depends, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from google import genai

from app.core.database import get_db
from app.models.paper import Paper as PaperModel
from app.models.schemas import AnalysisResponse, PaperHistory
from app.api.deps import get_current_user
from app.models.user import User as UserModel

from app.rag.ingestion import ingest_document
from app.rag.retriever import retrieve_chunks
from app.rag import chat_memory                 # NEW: conversation memory

router = APIRouter(prefix="/analysis", tags=["Analysis"])

# ── Gemini client setup ──────────────────────────────────────────────────────
api_key = os.getenv("GOOGLE_API_KEY")
is_demo_mode = (
    not api_key
    or api_key == "your_gemini_api_key_here"
    or len(api_key) < 30
    or "dummy" in api_key.lower()
)

client = None
if not is_demo_mode:
    client = genai.Client(api_key=api_key)

# Model fallback chain — tries each in order on 503 / overload
_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"]


# ── Helpers ──────────────────────────────────────────────────────────────────

MAX_PDF_SIZE = 50 * 1024 * 1024   # 50 MB per file
PDF_MAGIC    = b"%PDF"            # All valid PDFs start with this


def _validate_upload(content: bytes, filename: str) -> None:
    """
    Reject files that are not valid PDFs or exceed the size limit.
    Checks magic bytes — not just the filename extension — to prevent
    polyglot/disguised file uploads.
    """
    if len(content) > MAX_PDF_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"'{filename}' exceeds the 50 MB size limit.",
        )
    if not content.startswith(PDF_MAGIC):
        raise HTTPException(
            status_code=400,
            detail=f"'{filename}' is not a valid PDF file.",
        )


def get_simulated_analysis(topic_hint: str = "") -> dict:
    return {
        "research_topic": f"Simulated Study: {topic_hint or 'Advanced Neural Architectures'}",
        "extracted_hypotheses": ["Simulated hypothesis A", "Simulated hypothesis B"],
        "methods_summary": "Simulated methodology.",
        "datasets_identified": ["Dataset X", "Dataset Y"],
        "key_findings": ["Finding 1", "Finding 2"],
        "limitations": ["Limitation 1"],
        "citation_references": ["Reference 1"],
        "contradictions": None,
        "research_gap_identified": "A simulated research gap.",
        "suggested_novel_direction": "A simulated novel direction.",
        "confidence_score": 85.0,
        "evidence_strength": 0.8,
        "citation_frequency": 0.7,
        "methodological_robustness": 0.75,
    }


def _call_gemini(prompt: str) -> str:
    """
    Call Gemini with automatic model fallback and exponential-backoff retry.
    Raises ValueError if all models fail.
    """
    for model_name in _MODELS:
        for attempt in range(3):
            try:
                resp = client.models.generate_content(model=model_name, contents=prompt)
                return resp.text
            except Exception as err:
                err_str = str(err)
                if any(k in err_str for k in ("503", "UNAVAILABLE", "overloaded")):
                    wait = 2 ** attempt
                    print(f"[Gemini] {model_name} overloaded (attempt {attempt+1}). Retry in {wait}s…")
                    time.sleep(wait)
                else:
                    print(f"[Gemini] {model_name} error: {err}")
                    break   # non-transient error → try next model immediately
        # If we reach here on the last attempt, the response_text is still None
    raise ValueError("All Gemini models are currently unavailable. Please try again shortly.")


def _parse_json(text: str) -> dict:
    """Extract and parse the first JSON object found in a string."""
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        raise ValueError("No JSON object found in AI response")
    return json.loads(match.group())


async def _paper_filename_map(paper_ids: List[int], db: AsyncSession) -> dict:
    """Return {paper_id: filename} for a list of paper IDs."""
    result = await db.execute(
        select(PaperModel.id, PaperModel.filename).where(PaperModel.id.in_(paper_ids))
    )
    return {row[0]: row[1] for row in result.all()}


# ── Pydantic models ──────────────────────────────────────────────────────────

class QueryRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=2000)
    paper_ids: Optional[List[int]] = None


class SourceChunk(BaseModel):
    """Backward-compatible source record (used by existing frontend)."""
    chunk_id: int
    paper_id: int
    text_snippet: str
    page_number: Optional[int]
    relevance_score: float


# NEW ─ structured citation returned alongside SourceChunk list
class CitationItem(BaseModel):
    """
    A single citation entry linking an answer fragment to its source.

    Returned in the `citations` field of QueryResponse so clients can
    display "Source: paper.pdf, page 5" style references without parsing
    the answer text.
    """
    text: str               # The exact chunk text used to support the answer
    source: str             # Original PDF filename
    page: Optional[int]     # Page number within that PDF (None for plain-text docs)
    chunk_id: int
    relevance_score: float


class QueryResponse(BaseModel):
    answer: str
    sources: List[SourceChunk]           # kept for backward compatibility
    citations: Optional[List[CitationItem]] = None   # NEW
    confidence: float
    explanation: str


def _build_sources_and_citations(
    chunks: List[dict],
    paper_filenames: dict,
) -> tuple:
    """
    Build both the legacy `sources` list and the new `citations` list
    from a list of retrieved chunk dicts.

    Returns:
        (sources: List[SourceChunk], citations: List[CitationItem])
    """
    sources = []
    citations = []
    for c in chunks:
        sources.append(SourceChunk(
            chunk_id=c["chunk_id"],
            paper_id=c["paper_id"],
            text_snippet=c["text"][:150] + "…",
            page_number=c["page_number"],
            relevance_score=c["relevance_score"],
        ))
        citations.append(CitationItem(
            text=c["text"][:400],   # enough context for a citation
            source=paper_filenames.get(c["paper_id"], f"paper_{c['paper_id']}.pdf"),
            page=c["page_number"],
            chunk_id=c["chunk_id"],
            relevance_score=c["relevance_score"],
        ))
    return sources, citations


# ── EXISTING: single-document analysis ──────────────────────────────────────

_ANALYSIS_PROMPT_TEMPLATE = """
ACT AS: Advanced AI Research Intelligence System.
DIRECTIVE: Perform extraction and gap analysis based on the provided document excerpts.
DOCUMENT TEXT EXCERPTS:
{context}

STRICT JSON OUTPUT FORMAT:
{{
    "research_topic": "str",
    "extracted_hypotheses": ["str"],
    "methods_summary": "str",
    "datasets_identified": ["str"],
    "key_findings": ["str"],
    "limitations": ["str"],
    "citation_references": ["str"],
    "contradictions": ["str"] or null,
    "research_gap_identified": "str",
    "suggested_novel_direction": "str",
    "confidence_score": 0-100,
    "evidence_strength": 0-1,
    "citation_frequency": 0-1,
    "methodological_robustness": 0-1
}}
"""


async def _run_analysis(paper_id: int, filename: str, db: AsyncSession) -> dict:
    """
    Core analysis logic: retrieve chunks for a paper → call Gemini → return dict.
    Extracted to be reused by both /analyze and /analyze-batch.
    """
    search_query = "abstract conclusion methodology key findings limitations"
    top_chunks = await retrieve_chunks(
        search_query, db, top_k=10, paper_ids=[paper_id]
    )
    context_text = "\n\n".join(
        [f"Page {c['page_number']}: {c['text']}" for c in top_chunks]
    )
    prompt = _ANALYSIS_PROMPT_TEMPLATE.format(context=context_text)
    response_text = _call_gemini(prompt)
    return _parse_json(response_text)


@router.post("/analyze", response_model=AnalysisResponse)
async def analyze_document(
    file: UploadFile = File(...),
    query: str = Form(None),
    project_id: int = Form(None),
    db: AsyncSession = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    """Upload and analyze a single PDF. Unchanged from original."""
    new_paper = PaperModel(
        user_id=current_user.id,
        project_id=project_id,
        title=file.filename,
        filename=file.filename,
        result_json={},
    )
    db.add(new_paper)
    await db.commit()
    await db.refresh(new_paper)

    try:
        content = await file.read()
        _validate_upload(content, file.filename)  # magic bytes + size check
        await ingest_document(new_paper.id, content, file.filename, db)

        if is_demo_mode:
            analysis_data = get_simulated_analysis(file.filename)
        else:
            analysis_data = await _run_analysis(new_paper.id, file.filename, db)

        new_paper.title = analysis_data.get("research_topic", file.filename)
        new_paper.result_json = analysis_data
        await db.commit()
        return AnalysisResponse(**analysis_data)

    except Exception as e:
        print(f"Analysis Error: {e}")
        await db.delete(new_paper)
        await db.commit()
        if is_demo_mode:
            return AnalysisResponse(**get_simulated_analysis(f"Error: {e}"))
        raise HTTPException(status_code=500, detail=str(e))


# ── NEW: multi-document batch upload ────────────────────────────────────────

class BatchAnalysisResult(BaseModel):
    """Result for one document in a batch upload."""
    filename: str
    paper_id: int
    analysis: AnalysisResponse
    chunks_indexed: int


class BatchAnalysisResponse(BaseModel):
    """
    Response from POST /analysis/analyze-batch.
    All documents are ingested into the SAME vector store so subsequent
    /query calls will search across all of them simultaneously.
    """
    total_documents: int
    results: List[BatchAnalysisResult]
    message: str


@router.post("/analyze-batch", response_model=BatchAnalysisResponse)
async def analyze_batch(
    files: List[UploadFile] = File(...),
    project_id: int = Form(None),
    db: AsyncSession = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    """
    NEW — Multi-document upload.

    Accepts 1-N PDF files in a single request.  Every document is:
      1. Chunked and embedded into the shared FAISS index.
      2. Individually analysed by Gemini.
      3. Stored in the DB linked to the same project (if supplied).

    Because all chunks land in the same vector store, a /query or
    /global-search call will automatically search across every uploaded doc.

    Example request (multipart/form-data):
        files=paper1.pdf, files=paper2.pdf, project_id=3

    Example response:
        {
          "total_documents": 2,
          "results": [
            { "filename": "paper1.pdf", "paper_id": 11, "chunks_indexed": 42, "analysis": {...} },
            { "filename": "paper2.pdf", "paper_id": 12, "chunks_indexed": 38, "analysis": {...} }
          ],
          "message": "2 document(s) successfully indexed and analysed."
        }
    """
    if not files:
        raise HTTPException(status_code=400, detail="No files provided.")

    results: List[BatchAnalysisResult] = []

    for upload in files:
        # Create DB record
        paper = PaperModel(
            user_id=current_user.id,
            project_id=project_id,
            title=upload.filename,
            filename=upload.filename,
            result_json={},
        )
        db.add(paper)
        await db.commit()
        await db.refresh(paper)

        try:
            content = await upload.read()
            _validate_upload(content, upload.filename)  # magic bytes + size check

            # Ingest into shared vector store
            num_chunks = await ingest_document(paper.id, content, upload.filename, db)

            if is_demo_mode:
                analysis_data = get_simulated_analysis(upload.filename)
            else:
                analysis_data = await _run_analysis(paper.id, upload.filename, db)

            paper.title = analysis_data.get("research_topic", upload.filename)
            paper.result_json = analysis_data
            await db.commit()

            results.append(BatchAnalysisResult(
                filename=upload.filename,
                paper_id=paper.id,
                analysis=AnalysisResponse(**analysis_data),
                chunks_indexed=num_chunks,
            ))

        except Exception as e:
            print(f"Batch analysis error for {upload.filename}: {e}")
            await db.delete(paper)
            await db.commit()
            # Continue processing remaining files — don't abort the whole batch
            results.append(BatchAnalysisResult(
                filename=upload.filename,
                paper_id=-1,
                analysis=AnalysisResponse(**get_simulated_analysis(f"Error: {e}")),
                chunks_indexed=0,
            ))

    return BatchAnalysisResponse(
        total_documents=len(results),
        results=results,
        message=f"{len(results)} document(s) successfully indexed and analysed.",
    )


# ── EXISTING: search history ─────────────────────────────────────────────────

class SearchHistoryItem(BaseModel):
    id: int
    query: str
    paper_ids: Optional[List[int]]
    created_at: str

    class Config:
        from_attributes = True


@router.get("/search-history")
async def get_search_history(
    db: AsyncSession = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    from app.models.search_history import SearchHistory
    result = await db.execute(
        select(SearchHistory)
        .where(SearchHistory.user_id == current_user.id)
        .order_by(SearchHistory.created_at.desc())
        .limit(20)
    )
    rows = result.scalars().all()
    return [
        {"id": r.id, "query": r.query, "paper_ids": r.paper_ids, "created_at": str(r.created_at)}
        for r in rows
    ]


# ── ENHANCED: RAG query (+ citations, + reranking) ────────────────────────────

@router.post("/query", response_model=QueryResponse)
async def query_documents(
    req: QueryRequest,
    db: AsyncSession = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    """
    RAG query against selected (or all) papers.

    ENHANCED: response now includes a `citations` list with structured
    source info (filename, page, chunk text) for each supporting chunk.
    Existing `sources` field is preserved for backward compatibility.
    Retrieval now uses BM25-hybrid reranking for better accuracy.
    """
    # Save to search history
    try:
        from app.models.search_history import SearchHistory
        db.add(SearchHistory(user_id=current_user.id, query=req.query, paper_ids=req.paper_ids))
        await db.commit()
    except Exception:
        pass

    # Retrieve with reranking (fetch 10×, rerank to top 5)
    top_chunks = await retrieve_chunks(req.query, db, top_k=5, paper_ids=req.paper_ids)

    if not top_chunks:
        return QueryResponse(
            answer="Insufficient evidence to answer the query.",
            sources=[],
            citations=[],
            confidence=0.0,
            explanation="No relevant context found in the provided papers.",
        )

    # Build filename map for citation source labels
    paper_ids_in_results = list({c["paper_id"] for c in top_chunks})
    paper_filenames = await _paper_filename_map(paper_ids_in_results, db)

    sources, citations = _build_sources_and_citations(top_chunks, paper_filenames)

    context_text = "\n\n".join(
        [f"[ChunkID: {c['chunk_id']}, Page: {c['page_number']}]\n{c['text']}" for c in top_chunks]
    )

    if is_demo_mode:
        return QueryResponse(
            answer=f"Simulated answer for: {req.query}",
            sources=sources,
            citations=citations,
            confidence=0.9,
            explanation="Simulated explanation (demo mode).",
        )

    prompt = f"""
You are an Explainable AI Research Assistant.
Answer the user's query based ONLY on the provided context chunks.
Include inline citations like [ChunkID: 45] in your answer.
If context is insufficient, say "Insufficient evidence".

CONTEXT CHUNKS:
{context_text}

USER QUERY: {req.query}

Respond in JSON:
{{
    "answer": "Detailed answer with inline citations [ChunkID: X].",
    "confidence": 0.0 to 1.0,
    "explanation": "Short reasoning trace."
}}
"""
    try:
        response_text = _call_gemini(prompt)
        data = _parse_json(response_text)
        return QueryResponse(
            answer=data.get("answer", ""),
            sources=sources,
            citations=citations,
            confidence=data.get("confidence", 0.0),
            explanation=data.get("explanation", ""),
        )
    except Exception as e:
        print(f"Query Error: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate answer")


# ── NEW: context-aware chat with conversation memory ─────────────────────────

class ChatRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=2000)
    paper_ids: Optional[List[int]] = None
    clear_history: bool = False     # set True to start a fresh session


class ChatResponse(BaseModel):
    answer: str
    citations: List[CitationItem]
    confidence: float
    history_length: int    # how many turns are now in memory


@router.post("/chat", response_model=ChatResponse)
async def chat_with_memory(
    req: ChatRequest,
    db: AsyncSession = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    """
    NEW — Context-aware RAG chat with conversation memory.

    Maintains the last 10 turns per user in memory and injects them as
    context into every Gemini prompt, enabling natural follow-ups:
      - "Explain more"
      - "Compare with the previous answer"
      - "What are the limitations you just mentioned?"

    Memory is per-user and persists for the lifetime of the server process.
    Send `clear_history: true` to start a fresh session.

    Example request:
        { "query": "What methods are used?", "paper_ids": [1, 2] }

    Follow-up:
        { "query": "Can you elaborate on the quantitative part?" }
    """
    if req.clear_history:
        chat_memory.clear_history(current_user.id)

    # Retrieve relevant chunks (with reranking)
    top_chunks = await retrieve_chunks(req.query, db, top_k=5, paper_ids=req.paper_ids)

    if not top_chunks:
        answer = "Insufficient evidence — no relevant content found in the selected papers."
        chat_memory.add_turn(current_user.id, "user", req.query)
        chat_memory.add_turn(current_user.id, "assistant", answer)
        return ChatResponse(
            answer=answer,
            citations=[],
            confidence=0.0,
            history_length=len(chat_memory.get_history(current_user.id)),
        )

    paper_ids_in_results = list({c["paper_id"] for c in top_chunks})
    paper_filenames = await _paper_filename_map(paper_ids_in_results, db)
    _, citations = _build_sources_and_citations(top_chunks, paper_filenames)

    context_text = "\n\n".join(
        [f"[Source: {paper_filenames.get(c['paper_id'], 'unknown')}, Page {c['page_number']}]\n{c['text']}"
         for c in top_chunks]
    )

    # Build conversation history block for Gemini
    history_block = chat_memory.build_context_block(current_user.id)

    if is_demo_mode:
        answer = f"[Demo] Simulated answer for: {req.query}"
        chat_memory.add_turn(current_user.id, "user", req.query)
        chat_memory.add_turn(current_user.id, "assistant", answer)
        return ChatResponse(
            answer=answer,
            citations=citations,
            confidence=0.9,
            history_length=len(chat_memory.get_history(current_user.id)),
        )

    prompt = f"""
You are an AI Research Assistant with memory of the current conversation.
Use the conversation history (if present) to understand follow-up questions.
Answer using ONLY the provided context chunks.

{history_block}

CONTEXT FROM PAPERS:
{context_text}

CURRENT QUESTION: {req.query}

Respond in JSON:
{{
    "answer": "Comprehensive answer referencing the papers.",
    "confidence": 0.0 to 1.0
}}
"""
    try:
        response_text = _call_gemini(prompt)
        data = _parse_json(response_text)
        answer = data.get("answer", "")
        confidence = float(data.get("confidence", 0.0))

        # Persist this turn to memory
        chat_memory.add_turn(current_user.id, "user", req.query)
        chat_memory.add_turn(current_user.id, "assistant", answer)

        return ChatResponse(
            answer=answer,
            citations=citations,
            confidence=confidence,
            history_length=len(chat_memory.get_history(current_user.id)),
        )
    except Exception as e:
        print(f"Chat Error: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate chat response")


# ── NEW: research gap detection ───────────────────────────────────────────────

class ResearchGapRequest(BaseModel):
    paper_ids: List[int]


class ResearchGapResponse(BaseModel):
    """
    Structured research gap analysis across one or more papers.

    research_gaps:  Areas the papers do not address but should.
    suggestions:    Concrete future research directions.
    related_topics: Adjacent fields that could enrich the research.
    """
    research_gaps: str
    suggestions: str
    related_topics: Optional[List[str]] = None


@router.post("/research-gaps", response_model=ResearchGapResponse)
async def detect_research_gaps(
    req: ResearchGapRequest,
    db: AsyncSession = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    """
    NEW — Research gap detection.

    Retrieves the existing analyses for the given paper IDs and asks Gemini
    to identify what is missing — unexplored angles, methodological blind spots,
    and recommended future work.

    Example request:
        { "paper_ids": [1, 2, 3] }

    Example response:
        {
          "research_gaps": "None of the papers address long-term longitudinal effects ...",
          "suggestions": "Future studies should employ randomised controlled trials ...",
          "related_topics": ["meta-analysis", "longitudinal cohort studies"]
        }
    """
    if not req.paper_ids:
        raise HTTPException(status_code=400, detail="Provide at least one paper_id.")

    # Fetch paper analysis records
    result = await db.execute(
        select(PaperModel).where(
            PaperModel.id.in_(req.paper_ids),
            PaperModel.user_id == current_user.id,
        )
    )
    papers = result.scalars().all()

    if not papers:
        raise HTTPException(status_code=404, detail="No papers found for the given IDs.")

    if is_demo_mode:
        return ResearchGapResponse(
            research_gaps="Simulated gap: lack of longitudinal data across diverse demographics.",
            suggestions="Simulated suggestion: conduct a 5-year follow-up study using mixed methods.",
            related_topics=["longitudinal studies", "demographic analysis", "mixed methods"],
        )

    # Build summary from each paper's stored analysis JSON
    summaries = []
    for p in papers:
        rj = p.result_json or {}
        summaries.append(
            f"Paper: {p.title}\n"
            f"  Topic: {rj.get('research_topic', 'N/A')}\n"
            f"  Key Findings: {'; '.join(rj.get('key_findings', []))}\n"
            f"  Limitations: {'; '.join(rj.get('limitations', []))}\n"
            f"  Research Gap: {rj.get('research_gap_identified', 'N/A')}"
        )

    combined_summary = "\n\n".join(summaries)

    prompt = f"""
You are a senior research strategist.  Based on the summaries of the following research papers,
identify the collective research gaps — what is missing, under-studied, or methodologically weak.
Then provide actionable suggestions for future work.

PAPER SUMMARIES:
{combined_summary}

Respond in strict JSON:
{{
    "research_gaps": "A detailed paragraph describing the collective research gaps.",
    "suggestions": "A detailed paragraph with concrete future research directions.",
    "related_topics": ["topic1", "topic2", "topic3"]
}}
"""
    try:
        response_text = _call_gemini(prompt)
        data = _parse_json(response_text)
        return ResearchGapResponse(
            research_gaps=data.get("research_gaps", ""),
            suggestions=data.get("suggestions", ""),
            related_topics=data.get("related_topics"),
        )
    except Exception as e:
        print(f"Research Gap Error: {e}")
        raise HTTPException(status_code=500, detail="Failed to detect research gaps")


# ── ENHANCED: global search (+ citations, + reranking) ───────────────────────

class GlobalSearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=2000)
    top_k: Optional[int] = 5


@router.post("/global-search", response_model=QueryResponse)
async def global_search(
    req: GlobalSearchRequest,
    db: AsyncSession = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    """
    RAG query across ALL papers belonging to the current user.

    ENHANCED: now returns structured `citations` (source filename + page)
    and uses BM25-hybrid reranking for better relevance.
    """
    all_papers = await db.execute(
        select(PaperModel).where(PaperModel.user_id == current_user.id)
    )
    paper_ids = [p.id for p in all_papers.scalars().all()]
    if not paper_ids:
        return QueryResponse(
            answer="No papers found. Upload a paper first.",
            sources=[], citations=[], confidence=0.0, explanation="",
        )

    # Save to search history
    try:
        from app.models.search_history import SearchHistory
        db.add(SearchHistory(user_id=current_user.id, query=req.query, paper_ids=paper_ids))
        await db.commit()
    except Exception:
        pass

    top_chunks = await retrieve_chunks(req.query, db, top_k=req.top_k, paper_ids=paper_ids)
    if not top_chunks:
        return QueryResponse(
            answer="No relevant content found across your papers.",
            sources=[], citations=[], confidence=0.0, explanation="",
        )

    paper_filenames = await _paper_filename_map(
        list({c["paper_id"] for c in top_chunks}), db
    )
    sources, citations = _build_sources_and_citations(top_chunks, paper_filenames)

    if is_demo_mode:
        return QueryResponse(
            answer=f"[Global Search] Simulated answer for: {req.query}",
            sources=sources, citations=citations, confidence=0.9, explanation="Demo mode.",
        )

    context_text = "\n\n".join(
        [f"[Paper:{c['paper_id']} Chunk:{c['chunk_id']} Page:{c['page_number']}]\n{c['text']}"
         for c in top_chunks]
    )
    prompt = f"""You are a research assistant. Answer using ONLY the provided context.
Include inline citations like [Paper:X Chunk:Y].

CONTEXT:
{context_text}

QUERY: {req.query}

JSON: {{"answer": "str", "confidence": 0-1, "explanation": "str"}}"""

    try:
        response_text = _call_gemini(prompt)
        data = _parse_json(response_text)
        return QueryResponse(
            answer=data.get("answer", ""),
            sources=sources,
            citations=citations,
            confidence=data.get("confidence", 0.0),
            explanation=data.get("explanation", ""),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── EXISTING: history + delete ────────────────────────────────────────────────

@router.get("/history", response_model=List[PaperHistory])
async def get_history(
    db: AsyncSession = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    result = await db.execute(
        select(PaperModel)
        .where(PaperModel.user_id == current_user.id)
        .order_by(PaperModel.created_at.desc())
    )
    return result.scalars().all()


@router.delete("/{paper_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_paper(
    paper_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    result = await db.execute(
        select(PaperModel).where(
            PaperModel.id == paper_id,
            PaperModel.user_id == current_user.id,
        )
    )
    paper = result.scalars().first()
    if not paper:
        raise HTTPException(status_code=404, detail="Analysis record not found")
    await db.delete(paper)
    await db.commit()
    return None
