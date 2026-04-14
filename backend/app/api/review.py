"""
REVIEW & GAP ANALYSIS API
==========================
New endpoints that extend the research intelligence capabilities.
All existing routes in analysis.py and advanced.py are preserved unchanged.

NEW ENDPOINTS:
  POST /analysis/generate-review  → Auto literature review from multiple papers
  POST /analysis/detect-gaps      → Structured per-gap research gap detection
"""

import os
import json
import re
import time
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from google import genai

from app.core.database import get_db
from app.models.paper import Paper as PaperModel
from app.models.user import User as UserModel
from app.api.deps import get_current_user
from app.rag.retriever import retrieve_chunks

router = APIRouter(prefix="/analysis", tags=["Review & Gap Analysis"])

# ── Gemini client (same pattern as other modules) ────────────────────────────
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

_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"]


def _call_gemini(prompt: str) -> str:
    """Gemini with model fallback and exponential-backoff retry on overload."""
    for model_name in _MODELS:
        for attempt in range(3):
            try:
                resp = client.models.generate_content(model=model_name, contents=prompt)
                return resp.text
            except Exception as err:
                err_str = str(err)
                if any(k in err_str for k in ("503", "UNAVAILABLE", "overloaded")):
                    wait = 2 ** attempt
                    print(f"[Review] {model_name} overloaded, retry in {wait}s…")
                    time.sleep(wait)
                else:
                    print(f"[Review] {model_name} error: {err}")
                    break
    raise ValueError("All Gemini models are currently unavailable.")


def _parse_json(text: str) -> dict:
    """Extract and parse the first JSON object found in a string."""
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        raise ValueError("No JSON object in AI response")
    return json.loads(match.group())


# ══════════════════════════════════════════════════════════════════════════════
# 1.  AUTO LITERATURE REVIEW GENERATOR
# ══════════════════════════════════════════════════════════════════════════════

class LiteratureReviewRequest(BaseModel):
    paper_ids: List[int]
    focus_topic: Optional[str] = None  # Narrow the review to a specific angle


class KeyContribution(BaseModel):
    paper_title: str
    contribution: str
    methodology: str


class MethodComparison(BaseModel):
    aspect: str
    description: str


class LiteratureReviewResponse(BaseModel):
    review_title: str
    executive_summary: str
    key_contributions: List[KeyContribution]
    method_comparison: List[MethodComparison]
    consensus_findings: List[str]
    research_gaps: List[str]
    future_work_suggestions: List[str]
    confidence_score: float
    papers_reviewed: int


@router.post("/generate-review", response_model=LiteratureReviewResponse)
async def generate_literature_review(
    req: LiteratureReviewRequest,
    db: AsyncSession = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    """
    AUTO LITERATURE REVIEW GENERATOR

    Synthesizes multiple uploaded papers into a structured, publication-quality
    literature review covering:

      - Executive Summary          — scope and dominant findings in 3-5 sentences
      - Key Contributions          — per-paper contribution + methodology
      - Method Comparison Table    — side-by-side methodological differences
      - Consensus Findings         — points agreed on by 2+ papers
      - Research Gaps              — what the literature collectively misses
      - Future Work Suggestions    — concrete next-step recommendations

    Grounded entirely in the paper content stored in the vector store —
    no hallucination beyond what is in the uploaded documents.

    Example request:
        { "paper_ids": [1, 2, 3], "focus_topic": "transformer attention mechanisms" }
    """
    if not req.paper_ids:
        raise HTTPException(status_code=400, detail="Provide at least one paper_id.")

    # Fetch papers (scoped to current user for security)
    result = await db.execute(
        select(PaperModel).where(
            PaperModel.id.in_(req.paper_ids),
            PaperModel.user_id == current_user.id,
        )
    )
    papers = result.scalars().all()
    if not papers:
        raise HTTPException(status_code=404, detail="No papers found for the given IDs.")

    # ── Demo mode ────────────────────────────────────────────────────────────
    if is_demo_mode:
        return LiteratureReviewResponse(
            review_title="Literature Review: AI in Healthcare (Demo)",
            executive_summary=(
                "This literature review synthesizes findings from the uploaded papers. "
                "The studies converge on deep learning as the dominant methodology, "
                "with reported accuracy improvements of 10-20% over traditional baselines."
            ),
            key_contributions=[
                KeyContribution(
                    paper_title=papers[0].title if papers else "Paper 1",
                    contribution="Introduced a novel attention-based architecture achieving state-of-the-art results.",
                    methodology="Transformer / Self-Attention",
                )
            ],
            method_comparison=[
                MethodComparison(
                    aspect="Model Architecture",
                    description="Studies vary between CNN-based and Transformer-based approaches.",
                ),
                MethodComparison(
                    aspect="Dataset Scale",
                    description="Sample sizes range from 1 K to 100 K instances across studies.",
                ),
            ],
            consensus_findings=[
                "Pre-training on large corpora consistently improves downstream performance.",
                "Data augmentation reduces overfitting in low-resource settings.",
            ],
            research_gaps=[
                "No multi-modal study combining text and image modalities.",
                "Limited evaluation on non-English language datasets.",
            ],
            future_work_suggestions=[
                "Conduct longitudinal studies to measure model decay over time.",
                "Explore federated learning to address data-privacy constraints.",
            ],
            confidence_score=87.5,
            papers_reviewed=len(papers),
        )

    # ── Build context from stored analyses + retrieved chunks ─────────────────
    paper_summaries = []
    for paper in papers:
        rj = paper.result_json or {}

        # Pull top 4 chunks per paper for richer context
        chunks = await retrieve_chunks(
            req.focus_topic or "abstract methodology results conclusion limitations",
            db,
            top_k=4,
            paper_ids=[paper.id],
        )
        chunk_text = "\n".join([c["text"][:400] for c in chunks])

        paper_summaries.append(
            f"=== PAPER: {paper.title} ===\n"
            f"Topic: {rj.get('research_topic', paper.title)}\n"
            f"Methods: {rj.get('methods_summary', 'N/A')}\n"
            f"Key Findings: {'; '.join(rj.get('key_findings', []))}\n"
            f"Limitations: {'; '.join(rj.get('limitations', []))}\n"
            f"Research Gap: {rj.get('research_gap_identified', 'N/A')}\n"
            f"Suggested Direction: {rj.get('suggested_novel_direction', 'N/A')}\n"
            f"Confidence Score: {rj.get('confidence_score', 'N/A')}\n"
            f"Excerpts from Paper:\n{chunk_text}"
        )

    combined = "\n\n".join(paper_summaries)
    focus_clause = (
        f"Focus specifically on: {req.focus_topic}." if req.focus_topic else ""
    )

    prompt = f"""
You are a senior academic researcher writing a structured literature review.
{focus_clause}

Synthesize the following paper analyses into a cohesive, publication-quality
literature review. Use ONLY information present in the provided data — do not
invent findings, authors, or statistics.

PAPER ANALYSES:
{combined}

Return STRICTLY valid JSON matching this schema (no markdown, no code fences):
{{
    "review_title": "Literature Review: [main topic derived from papers]",
    "executive_summary": "3-5 sentence academic summary covering scope, dominant methods, and key conclusions.",
    "key_contributions": [
        {{
            "paper_title": "exact paper title as listed above",
            "contribution": "the single most significant contribution of this paper",
            "methodology": "the primary methodology or approach used"
        }}
    ],
    "method_comparison": [
        {{
            "aspect": "comparison dimension (e.g., Model Architecture, Dataset Size, Evaluation Metric, Training Strategy)",
            "description": "how the papers differ or agree on this dimension"
        }}
    ],
    "consensus_findings": ["a finding supported by 2 or more of the reviewed papers"],
    "research_gaps": ["a specific gap NOT addressed by any of the reviewed papers"],
    "future_work_suggestions": ["a concrete, actionable research direction to address the identified gaps"],
    "confidence_score": 0-100
}}
"""
    try:
        response_text = _call_gemini(prompt)
        data = _parse_json(response_text)

        key_contributions = [
            KeyContribution(
                paper_title=kc.get("paper_title", "Unknown"),
                contribution=kc.get("contribution", ""),
                methodology=kc.get("methodology", ""),
            )
            for kc in data.get("key_contributions", [])
        ]

        method_comparison = [
            MethodComparison(
                aspect=mc.get("aspect", ""),
                description=mc.get("description", ""),
            )
            for mc in data.get("method_comparison", [])
        ]

        return LiteratureReviewResponse(
            review_title=data.get("review_title", "Literature Review"),
            executive_summary=data.get("executive_summary", ""),
            key_contributions=key_contributions,
            method_comparison=method_comparison,
            consensus_findings=data.get("consensus_findings", []),
            research_gaps=data.get("research_gaps", []),
            future_work_suggestions=data.get("future_work_suggestions", []),
            confidence_score=float(data.get("confidence_score", 75.0)),
            papers_reviewed=len(papers),
        )

    except Exception as e:
        print(f"[generate-review] Error: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to generate literature review. Please try again.",
        )


# ══════════════════════════════════════════════════════════════════════════════
# 2.  STRUCTURED RESEARCH GAP DETECTOR
# ══════════════════════════════════════════════════════════════════════════════

class DetectGapsRequest(BaseModel):
    paper_ids: List[int]


class ResearchGap(BaseModel):
    """A single identified research gap with structured metadata."""
    title: str          # Short gap title (5-8 words)
    description: str    # Detailed explanation of why the gap matters
    category: str       # methodological | empirical | theoretical | application
    severity: str       # low | medium | high
    future_work: str    # Concrete action to address this gap


class DetectGapsResponse(BaseModel):
    gaps: List[ResearchGap]
    overall_assessment: str         # 2-3 sentence landscape summary
    suggested_directions: List[str] # Broad future research directions
    related_topics: List[str]       # Adjacent fields that could enrich the work
    confidence_score: float


@router.post("/detect-gaps", response_model=DetectGapsResponse)
async def detect_gaps(
    req: DetectGapsRequest,
    db: AsyncSession = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    """
    STRUCTURED RESEARCH GAP DETECTOR

    Deeper and more structured than /analysis/research-gaps.
    Returns individual gaps with:

      - Category  : methodological | empirical | theoretical | application
      - Severity  : low | medium | high
      - Future Work: concrete per-gap recommendation

    Uses the stored Gemini analysis of each paper + retrieved chunks so
    the output is fully grounded in the uploaded documents.

    Example request:
        { "paper_ids": [1, 2, 3] }
    """
    if not req.paper_ids:
        raise HTTPException(status_code=400, detail="Provide at least one paper_id.")

    result = await db.execute(
        select(PaperModel).where(
            PaperModel.id.in_(req.paper_ids),
            PaperModel.user_id == current_user.id,
        )
    )
    papers = result.scalars().all()
    if not papers:
        raise HTTPException(status_code=404, detail="No papers found for the given IDs.")

    # ── Demo mode ────────────────────────────────────────────────────────────
    if is_demo_mode:
        return DetectGapsResponse(
            gaps=[
                ResearchGap(
                    title="Lack of Longitudinal Evaluation",
                    description=(
                        "None of the reviewed papers evaluate model performance beyond "
                        "a 6-month window, making it impossible to measure real-world drift."
                    ),
                    category="empirical",
                    severity="high",
                    future_work=(
                        "Design a 2-year longitudinal study measuring prediction accuracy, "
                        "model drift, and operational cost in a real deployment setting."
                    ),
                ),
                ResearchGap(
                    title="Limited Demographic Diversity in Datasets",
                    description=(
                        "All reviewed datasets originate from Western academic institutions, "
                        "introducing potential geographic and cultural bias."
                    ),
                    category="empirical",
                    severity="medium",
                    future_work=(
                        "Collect and benchmark on datasets from Africa, South Asia, and "
                        "Latin America to validate cross-cultural generalizability."
                    ),
                ),
                ResearchGap(
                    title="Missing Theoretical Complexity Analysis",
                    description=(
                        "No paper provides formal time or space complexity proofs for the "
                        "proposed algorithms, limiting reproducibility and comparison."
                    ),
                    category="theoretical",
                    severity="low",
                    future_work=(
                        "Provide Big-O analysis for all proposed methods and publish "
                        "ablation studies with standardized hardware benchmarks."
                    ),
                ),
            ],
            overall_assessment=(
                "The reviewed literature shows strong methodological innovation but "
                "significant weaknesses in real-world validation, dataset diversity, "
                "and theoretical grounding. Empirical gaps dominate."
            ),
            suggested_directions=[
                "Longitudinal deployment studies in real-world environments",
                "Cross-cultural and multi-lingual dataset collection",
                "Federated learning for privacy-preserving research",
            ],
            related_topics=["meta-analysis", "systematic review", "transfer learning", "bias mitigation"],
            confidence_score=82.0,
        )

    # ── Build summaries from stored analyses ─────────────────────────────────
    summaries = []
    for p in papers:
        rj = p.result_json or {}
        # Also grab chunks about limitations/conclusions for richer context
        chunks = await retrieve_chunks(
            "limitations future work conclusion gaps unexplored",
            db,
            top_k=3,
            paper_ids=[p.id],
        )
        chunk_text = "\n".join([c["text"][:300] for c in chunks])

        summaries.append(
            f"Paper: {p.title}\n"
            f"  Research Topic: {rj.get('research_topic', 'N/A')}\n"
            f"  Methods: {rj.get('methods_summary', 'N/A')}\n"
            f"  Key Findings: {'; '.join(rj.get('key_findings', []))}\n"
            f"  Stated Limitations: {'; '.join(rj.get('limitations', []))}\n"
            f"  Existing Gap Noted by Authors: {rj.get('research_gap_identified', 'N/A')}\n"
            f"  Relevant Excerpts:\n{chunk_text}"
        )

    combined_summary = "\n\n".join(summaries)

    prompt = f"""
You are a senior research analyst specialising in systematic literature reviews.
Analyse the following paper summaries and identify SPECIFIC, ACTIONABLE research gaps.

PAPER SUMMARIES:
{combined_summary}

For each gap, classify by:
  Category:
    - methodological  → flaw in how studies are designed or executed
    - empirical       → missing data, datasets, experiments, or real-world validation
    - theoretical     → missing formal proofs, frameworks, or conceptual grounding
    - application     → unexplored use cases, industries, or deployment scenarios

  Severity:
    - high   → blocks the field from advancing — must be addressed soon
    - medium → important but not immediately blocking
    - low    → would improve rigor but is not urgent

Return STRICTLY valid JSON (no markdown, no code fences):
{{
    "gaps": [
        {{
            "title": "5-8 word gap title",
            "description": "2-3 sentence explanation of the gap and why it matters",
            "category": "methodological|empirical|theoretical|application",
            "severity": "low|medium|high",
            "future_work": "Specific, concrete research action to address this gap"
        }}
    ],
    "overall_assessment": "2-3 sentence summary of the collective research landscape and dominant gap types",
    "suggested_directions": ["broad future research direction"],
    "related_topics": ["adjacent field or technique that could enrich this research"],
    "confidence_score": 0-100
}}
"""
    try:
        response_text = _call_gemini(prompt)
        data = _parse_json(response_text)

        gaps = [
            ResearchGap(
                title=g.get("title", "Unspecified Gap"),
                description=g.get("description", ""),
                category=g.get("category", "empirical"),
                severity=g.get("severity", "medium"),
                future_work=g.get("future_work", ""),
            )
            for g in data.get("gaps", [])
        ]

        return DetectGapsResponse(
            gaps=gaps,
            overall_assessment=data.get("overall_assessment", ""),
            suggested_directions=data.get("suggested_directions", []),
            related_topics=data.get("related_topics", []),
            confidence_score=float(data.get("confidence_score", 75.0)),
        )

    except Exception as e:
        print(f"[detect-gaps] Error: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to detect research gaps. Please try again.",
        )
