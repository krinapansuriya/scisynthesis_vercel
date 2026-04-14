"""
RETRIEVER MODULE  (OPTIMISED)
==============================
Hybrid retrieval pipeline:

  1. Embed the query with Gemini embedding-001  (768-dim)
  2. FAISS vector search  →  top (top_k × CANDIDATE_MULTIPLIER) candidates
  3. Filter by paper_ids if supplied
  4. BM25 + FAISS hybrid reranking  →  final top_k chunks
  5. Minimum-score filter removes irrelevant results

Performance improvements vs original:
  - CANDIDATE_MULTIPLIER raised 10 → 15  (better recall before reranking)
  - MIN_RELEVANCE_SCORE threshold (0.05) filters out noise chunks
  - Chunk diversity filter: at most MAX_CHUNKS_PER_PAPER from a single paper
    when searching across multiple papers (prevents one paper dominating)
  - Early-return fast path when candidates ≤ top_k (skip reranker overhead)
"""

from typing import Any, Dict, List, Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.models.chunk import DocumentChunk
from app.rag.embeddings import get_embedding
from app.rag.reranker import rerank_chunks
from app.rag.vector_store import vector_store

# ── Tuning constants ──────────────────────────────────────────────────────────

# How many FAISS candidates to fetch per desired top_k result.
# Higher value → better reranker recall, slight increase in DB query size.
CANDIDATE_MULTIPLIER = 15

# Drop chunks whose semantic score is below this threshold.
# Prevents very low-quality matches from polluting the context.
MIN_RELEVANCE_SCORE = 0.05

# When doing cross-paper search (paper_ids is None or len > 1),
# cap how many chunks can come from a single paper to avoid dominance.
MAX_CHUNKS_PER_PAPER = 3


async def retrieve_chunks(
    query: str,
    db: AsyncSession,
    top_k: int = 5,
    paper_ids: Optional[List[int]] = None,
    apply_reranking: bool = True,   # set False to skip BM25 (e.g. unit tests)
) -> List[Dict[str, Any]]:
    """
    Retrieve the most relevant document chunks for a query.

    Args:
        query:           Natural-language query string.
        db:              Async SQLAlchemy session.
        top_k:           Number of final chunks to return.
        paper_ids:       Restrict results to these paper IDs.
                         Pass None to search across ALL indexed chunks.
        apply_reranking: Whether to run BM25 hybrid reranking.

    Returns:
        List of dicts (sorted by relevance_score descending):
            chunk_id, paper_id, text, page_number, relevance_score
    """
    # ── Step 1: embed query ──────────────────────────────────────────────────
    query_emb = get_embedding(query)

    # ── Step 2: FAISS over-fetch ─────────────────────────────────────────────
    fetch_k = top_k * CANDIDATE_MULTIPLIER
    faiss_results = vector_store.search(query_emb, top_k=fetch_k)

    if not faiss_results:
        return []

    chunk_ids = [res[0] for res in faiss_results]

    # ── Step 3: DB lookup + optional paper_id filter ─────────────────────────
    stmt = select(DocumentChunk).where(DocumentChunk.id.in_(chunk_ids))
    if paper_ids:
        stmt = stmt.where(DocumentChunk.paper_id.in_(paper_ids))

    db_result = await db.execute(stmt)
    chunks = db_result.scalars().all()

    chunk_map = {chunk.id: chunk for chunk in chunks}

    # ── Step 4: build candidate list with semantic scores ────────────────────
    candidates: List[Dict[str, Any]] = []
    for chunk_id, distance in faiss_results:
        if chunk_id not in chunk_map:
            continue
        chunk = chunk_map[chunk_id]

        # Convert L2 distance → 0-1 similarity score
        # distance == 0 → perfect match (score 1.0)
        # distance == 2 → opposite vectors (score 0.0)
        semantic_score = max(0.0, 1.0 - (distance / 2.0))

        # Drop very low-quality matches early to keep context clean
        if semantic_score < MIN_RELEVANCE_SCORE:
            continue

        candidates.append({
            "chunk_id":        chunk.id,
            "paper_id":        chunk.paper_id,
            "text":            chunk.text,
            "page_number":     chunk.page_number,
            "relevance_score": semantic_score,
        })

    if not candidates:
        return []

    # ── Step 5: cross-paper diversity cap ────────────────────────────────────
    # Only apply when searching across multiple (or all) papers so a single
    # large paper does not crowd out results from other documents.
    cross_paper_search = not paper_ids or len(paper_ids) > 1
    if cross_paper_search:
        per_paper_count: Dict[int, int] = {}
        diverse_candidates = []
        for c in candidates:
            pid = c["paper_id"]
            if per_paper_count.get(pid, 0) < MAX_CHUNKS_PER_PAPER:
                diverse_candidates.append(c)
                per_paper_count[pid] = per_paper_count.get(pid, 0) + 1
        # Re-fill to at least top_k using original list if diversity filter cut too many
        if len(diverse_candidates) < top_k:
            seen_ids = {c["chunk_id"] for c in diverse_candidates}
            for c in candidates:
                if c["chunk_id"] not in seen_ids:
                    diverse_candidates.append(c)
                if len(diverse_candidates) >= top_k * 2:
                    break
        candidates = diverse_candidates

    # ── Step 6: rerank ───────────────────────────────────────────────────────
    # Skip reranker when we already have ≤ top_k candidates — it would be a no-op
    # and BM25 index building has non-trivial overhead.
    if apply_reranking and len(candidates) > top_k:
        return rerank_chunks(query, candidates, top_k=top_k)

    return candidates[:top_k]
