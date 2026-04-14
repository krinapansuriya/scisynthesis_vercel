"""
RERANKER MODULE  (IMPROVED)
============================
Hybrid reranking combining:
  - FAISS semantic scores  (L2 distance → 0-1)
  - BM25 lexical scores    (rank_bm25, keyword overlap)

Improvements vs original:
  - Semantic weight raised  0.60 → 0.65  (better paraphrase recall)
  - Lexical weight lowered  0.40 → 0.35
  - Length normalisation: very short chunks get a slight penalty so they
    don't outrank richer, longer chunks on keyword overlap alone.
  - Duplicate suppression: chunks that are near-identical (same text prefix)
    after ranking are deduplicated — prevents the same sentence appearing
    twice just from overlapping chunk windows.

Pipeline (unchanged from caller's perspective):
  FAISS retrieves N candidates  →  BM25 scores each  →  hybrid sort  →  top-k
"""

from typing import Any, Dict, List

from rank_bm25 import BM25Okapi

# ── Weighting ─────────────────────────────────────────────────────────────────
SEMANTIC_WEIGHT = 0.65   # FAISS L2-derived similarity score
LEXICAL_WEIGHT  = 0.35   # BM25 Okapi keyword-overlap score

# Chunks shorter than this word count get a slight lexical penalty
# (avoids one-line header chunks scoring well just from BM25 keyword hit)
SHORT_CHUNK_THRESHOLD = 30   # words
SHORT_CHUNK_PENALTY   = 0.85  # multiply BM25 score by this factor

# Deduplicate chunks whose first N characters are identical
DEDUP_PREFIX_LEN = 120


def _tokenize(text: str) -> List[str]:
    """
    Lightweight tokenizer: lowercase + whitespace split.
    Keeps stop words in because BM25Okapi handles IDF weighting internally —
    removing stops would hurt recall for queries like "what is the difference".
    """
    return text.lower().split()


def _word_count(text: str) -> int:
    return len(text.split())


def rerank_chunks(
    query: str,
    chunks: List[Dict[str, Any]],
    top_k: int = 3,
) -> List[Dict[str, Any]]:
    """
    Rerank a list of retrieved chunks using BM25 + FAISS hybrid scoring.

    Args:
        query:   The user's original query string.
        chunks:  Candidate chunks from FAISS retrieval. Each dict must have:
                   "text"            : str
                   "relevance_score" : float  (0-1, FAISS-derived semantic score)
                   any other metadata (chunk_id, paper_id, page_number, …)
        top_k:   Number of chunks to return after reranking.

    Returns:
        Top-k chunks sorted by hybrid score (descending).
        Each chunk's "relevance_score" is updated to the hybrid value.
    """
    if not chunks:
        return []

    # Fast path: already at or below top_k — no reranking needed
    if len(chunks) <= top_k:
        return chunks

    # ── Build BM25 corpus ─────────────────────────────────────────────────────
    tokenized_corpus = [_tokenize(c["text"]) for c in chunks]
    bm25 = BM25Okapi(tokenized_corpus)

    tokenized_query = _tokenize(query)
    raw_bm25_scores = bm25.get_scores(tokenized_query)   # numpy array

    # Normalise BM25 scores to [0, 1]
    max_score = float(max(raw_bm25_scores)) if float(max(raw_bm25_scores)) > 0 else 1.0
    norm_bm25 = [float(s) / max_score for s in raw_bm25_scores]

    # ── Compute hybrid scores ─────────────────────────────────────────────────
    ranked: List[Dict[str, Any]] = []
    for i, chunk in enumerate(chunks):
        bm25_score = norm_bm25[i]

        # Apply length penalty for very short chunks
        if _word_count(chunk["text"]) < SHORT_CHUNK_THRESHOLD:
            bm25_score *= SHORT_CHUNK_PENALTY

        hybrid = (
            SEMANTIC_WEIGHT * chunk["relevance_score"]
            + LEXICAL_WEIGHT  * bm25_score
        )
        ranked.append({**chunk, "relevance_score": round(hybrid, 4)})

    # Sort by hybrid score (highest first)
    ranked.sort(key=lambda x: x["relevance_score"], reverse=True)

    # ── Duplicate suppression ─────────────────────────────────────────────────
    # After sorting, remove chunks that share the same text prefix as a
    # higher-ranked chunk (arises from overlapping chunk windows at ingestion).
    seen_prefixes: set = set()
    deduplicated: List[Dict[str, Any]] = []
    for c in ranked:
        prefix = c["text"][:DEDUP_PREFIX_LEN].strip()
        if prefix not in seen_prefixes:
            seen_prefixes.add(prefix)
            deduplicated.append(c)
        if len(deduplicated) >= top_k:
            break

    return deduplicated
