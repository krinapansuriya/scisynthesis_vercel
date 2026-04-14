import os
import json
import re
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from google import genai

from app.core.database import get_db
from app.models.paper import Paper as PaperModel
from app.models.user import User as UserModel
from app.api.deps import get_current_user
from app.rag.retriever import retrieve_chunks

import numpy as np
from sklearn.cluster import KMeans

router = APIRouter(prefix="/analysis/advanced", tags=["Advanced Analysis"])

api_key = os.getenv("GOOGLE_API_KEY")
is_demo_mode = not api_key or api_key == "your_gemini_api_key_here" or len(api_key) < 30 or "dummy" in api_key.lower()

client = None
if not is_demo_mode:
    client = genai.Client(api_key=api_key)


class ComparePapersRequest(BaseModel):
    paper_ids: List[int]

class CompareResponse(BaseModel):
    comparison_table: List[Dict[str, str]]
    bullet_insights: List[str]

@router.post("/compare-papers", response_model=CompareResponse)
async def compare_papers(
    req: ComparePapersRequest,
    db: AsyncSession = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    if len(req.paper_ids) < 2:
        raise HTTPException(status_code=400, detail="Must provide at least 2 paper IDs to compare.")

    result = await db.execute(select(PaperModel).where(PaperModel.id.in_(req.paper_ids), PaperModel.user_id == current_user.id))
    papers = result.scalars().all()
    
    if len(papers) != len(req.paper_ids):
        raise HTTPException(status_code=404, detail="One or more papers not found.")

    if is_demo_mode:
        return CompareResponse(
            comparison_table=[{"Paper": p.title, "Method": "Method A", "Result": "Good"} for p in papers],
            bullet_insights=["Paper A is better than Paper B in accuracy."]
        )

    # Gather context from papers
    paper_contexts = []
    for paper in papers:
        # Get top chunks for each paper related to methods and results
        chunks = await retrieve_chunks("methodology results conclusion", db, top_k=5, paper_ids=[paper.id])
        context = "\\n".join([c["text"] for c in chunks])
        paper_contexts.append(f"--- PAPER: {paper.title} ---\\n{context}")

    combined_context = "\\n\\n".join(paper_contexts)

    prompt = f"""
    ACT AS: Expert Research Scientist.
    DIRECTIVE: Compare the provided papers based on Methodology, Results, Advantages/Limitations, and Key Contributions.
    
    PAPERS TEXT:
    {combined_context}
    
    STRICT JSON OUTPUT FORMAT:
    {{
        "comparison_table": [
            {{"paper_title": "str", "methodology": "str", "results": "str", "advantages": "str", "limitations": "str", "key_contributions": "str"}}
        ],
        "bullet_insights": ["str"]
    }}
    """

    try:
        response = client.models.generate_content(model='gemini-2.5-flash', contents=prompt)
        json_match = re.search(r'\{.*\}', response.text, re.DOTALL)
        if json_match:
            return CompareResponse(**json.loads(json_match.group()))
        raise ValueError("Invalid AI Response")
    except Exception as e:
        print(f"Comparison Error: {e}")
        raise HTTPException(status_code=500, detail="Failed to compare papers")

class HypothesisRequest(BaseModel):
    topic: str
    paper_ids: Optional[List[int]] = None

class HypothesisResponse(BaseModel):
    hypotheses: List[Dict[str, str]] # { "hypothesis": "...", "reasoning": "...", "how_to_test": "..." }
    research_gaps: List[str]
    future_directions: List[str]

@router.post("/generate-hypothesis", response_model=HypothesisResponse)
async def generate_hypothesis(
    req: HypothesisRequest,
    db: AsyncSession = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    chunks = await retrieve_chunks(req.topic, db, top_k=10, paper_ids=req.paper_ids)
    context_text = "\\n".join([c["text"] for c in chunks]) if chunks else "General Knowledge"

    if is_demo_mode:
        return HypothesisResponse(
            hypotheses=[{"hypothesis": "Demo H1", "reasoning": "Because demo", "how_to_test": "Test it"}],
            research_gaps=["Demo Gap"],
            future_directions=["Demo Direction"]
        )

    prompt = f"""
    ACT AS: Visionary AI Researcher.
    DIRECTIVE: Generate novel research hypotheses, identify research gaps, and suggest future directions based on the topic and context.
    
    TOPIC: {req.topic}
    CONTEXT (if any): {context_text}
    
    STRICT JSON OUTPUT FORMAT:
    {{
        "hypotheses": [
            {{"hypothesis": "str", "reasoning": "str", "how_to_test": "str"}}
        ],
        "research_gaps": ["str"],
        "future_directions": ["str"]
    }}
    """
    try:
        response = client.models.generate_content(model='gemini-2.5-flash', contents=prompt)
        json_match = re.search(r'\{.*\}', response.text, re.DOTALL)
        if json_match:
            return HypothesisResponse(**json.loads(json_match.group()))
        raise ValueError("Invalid AI Response")
    except Exception as e:
        print(f"Hypothesis Error: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate hypothesis")

class ProjectIdeaRequest(BaseModel):
    paper_ids: List[int]

class ProjectIdeaResponse(BaseModel):
    ideas: List[Dict[str, Any]] # { title, problem, tech_stack, architecture, steps, target_audience }

@router.post("/project-ideas", response_model=ProjectIdeaResponse)
async def project_ideas(
    req: ProjectIdeaRequest,
    db: AsyncSession = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    chunks = await retrieve_chunks("applications practical implementation real-world use cases", db, top_k=10, paper_ids=req.paper_ids)
    context_text = "\\n".join([c["text"] for c in chunks])

    if is_demo_mode:
        return ProjectIdeaResponse(ideas=[{
            "title": "Demo Project",
            "problem": "Demo Problem",
            "tech_stack": ["React", "FastAPI"],
            "architecture": "Client-Server",
            "steps": ["Step 1"],
            "target_audience": "Students"
        }])

    prompt = f"""
    ACT AS: Startup Founder & Tech Lead.
    DIRECTIVE: Convert the research context into real-world project ideas suitable for students or startups.
    
    RESEARCH CONTEXT:
    {context_text}
    
    STRICT JSON OUTPUT FORMAT:
    {{
        "ideas": [
            {{
                "title": "str",
                "problem_statement": "str",
                "tech_stack": ["str"],
                "architecture": "str",
                "implementation_steps": ["str"],
                "target_audience": "str (e.g. Students, Startups)"
            }}
        ]
    }}
    """
    try:
        response = client.models.generate_content(model='gemini-2.5-flash', contents=prompt)
        json_match = re.search(r'\{.*\}', response.text, re.DOTALL)
        if json_match:
            data = json.loads(json_match.group())
            # Normalize key
            for idea in data.get("ideas", []):
                if "problem_statement" in idea:
                    idea["problem"] = idea.pop("problem_statement")
            return ProjectIdeaResponse(ideas=data.get("ideas", []))
        raise ValueError("Invalid AI Response")
    except Exception as e:
        print(f"Project Idea Error: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate project ideas")

class CitationRequest(BaseModel):
    paper_id: int
    style: str = "apa"  # apa, ieee, mla

class CitationResponse(BaseModel):
    citation: str
    style: str
    title: str

@router.post("/citation", response_model=CitationResponse)
async def generate_citation(
    req: CitationRequest,
    db: AsyncSession = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    result = await db.execute(select(PaperModel).where(PaperModel.id == req.paper_id, PaperModel.user_id == current_user.id))
    paper = result.scalars().first()
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found.")

    rj = paper.result_json or {}
    title = paper.title or paper.filename
    style = req.style.lower()

    # Gather all available metadata from the stored analysis
    refs = rj.get("citation_references", [])
    topic = rj.get("research_topic", title)
    methods = rj.get("methods_summary", "")

    # Use actual paper chunks (first page text) to extract real author/journal/year
    chunks = await retrieve_chunks("author journal published year volume", db, top_k=5, paper_ids=[req.paper_id])
    chunk_text = "\n".join([c["text"] for c in chunks]) if chunks else ""

    if is_demo_mode:
        if style == "ieee":
            citation = f'A. Author, "{title}," Demo Journal, 2024.'
        elif style == "mla":
            citation = f'Author, A. "{title}." Demo Journal, 2024.'
        else:
            citation = f'Author, A. (2024). {title}. Demo Journal.'
        return CitationResponse(citation=citation, style=style, title=title)

    prompt = f"""You are an expert academic citation formatter.
Extract metadata from the paper text and references below, then generate a single formatted {style.upper()} citation.

PAPER TITLE: {title}
RESEARCH TOPIC: {topic}
CITATION REFERENCES FROM PAPER: {json.dumps(refs[:5])}
PAPER TEXT EXCERPTS (first pages):
{chunk_text[:2000]}

RULES:
- Extract real author names if present in text or references. If truly unknown, use the most plausible author from context.
- Extract publication year from text/references (look for 4-digit years like 2020, 2023, etc.)
- Extract journal/publisher name from text or references if visible.
- Format EXACTLY as {style.upper()} style requires.
- Return ONLY a JSON object, nothing else.

JSON format:
{{"citation": "the fully formatted {style.upper()} citation string", "authors": "extracted authors", "year": "extracted year", "journal": "extracted journal"}}"""

    try:
        response = client.models.generate_content(model='gemini-2.5-flash', contents=prompt)
        json_match = re.search(r'\{.*\}', response.text, re.DOTALL)
        if json_match:
            data = json.loads(json_match.group())
            return CitationResponse(citation=data.get("citation", ""), style=style, title=title)
    except Exception as e:
        print(f"Citation AI Error: {e}")

    # Fallback: format with what we have
    year_match = re.search(r'\b(19|20)\d{2}\b', chunk_text + str(refs))
    year = year_match.group() if year_match else "n.d."
    if style == "ieee":
        citation = f'Author(s), "{title}," n.d., {year}.'
    elif style == "mla":
        citation = f'Author(s). "{title}." n.d., {year}.'
    else:
        citation = f'Author(s). ({year}). {title}.'
    return CitationResponse(citation=citation, style=style, title=title)


class KeywordsResponse(BaseModel):
    keywords: List[str]
    summary: str

@router.get("/keywords/{paper_id}", response_model=KeywordsResponse)
async def extract_keywords(
    paper_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    result = await db.execute(select(PaperModel).where(PaperModel.id == paper_id, PaperModel.user_id == current_user.id))
    paper = result.scalars().first()
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found.")

    rj = paper.result_json or {}
    findings = rj.get("key_findings", [])
    topic = rj.get("research_topic", paper.title)
    methods = rj.get("methods_summary", "")

    if is_demo_mode:
        return KeywordsResponse(keywords=["AI", "Machine Learning", "Research"], summary=topic)

    prompt = f"""Extract 8-12 concise academic keywords and a one-sentence abstract summary from this research info.
Topic: {topic}
Methods: {methods}
Findings: {findings}

JSON format: {{"keywords": ["str"], "summary": "str"}}"""
    try:
        response = client.models.generate_content(model='gemini-2.5-flash', contents=prompt)
        json_match = re.search(r'\{.*\}', response.text, re.DOTALL)
        if json_match:
            data = json.loads(json_match.group())
            return KeywordsResponse(keywords=data.get("keywords", []), summary=data.get("summary", topic))
    except Exception as e:
        print(f"Keywords Error: {e}")
    return KeywordsResponse(keywords=[topic], summary=topic)


class SimilarPapersResponse(BaseModel):
    recommendations: List[Dict[str, Any]]

@router.get("/similar/{paper_id}", response_model=SimilarPapersResponse)
async def similar_papers(
    paper_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    try:
        # Get the source paper
        source_result = await db.execute(
            select(PaperModel).where(PaperModel.id == paper_id, PaperModel.user_id == current_user.id)
        )
        source_paper = source_result.scalars().first()
        if not source_paper:
            raise HTTPException(status_code=404, detail="Paper not found.")

        # Get all other papers belonging to this user
        other_result = await db.execute(
            select(PaperModel).where(
                PaperModel.user_id == current_user.id,
                PaperModel.id != paper_id
            )
        )
        other_papers = other_result.scalars().all()

        # No other papers to compare against
        if not other_papers:
            return SimilarPapersResponse(recommendations=[])

        # Use the paper's topic as query to find similar chunks in other papers
        topic = (source_paper.result_json or {}).get("research_topic") or source_paper.title or "research"
        other_ids = [p.id for p in other_papers]

        similar_chunks = await retrieve_chunks(topic, db, top_k=15, paper_ids=other_ids)

        # Deduplicate by paper, pick highest score per paper
        seen: set = set()
        recs = []
        for c in similar_chunks:
            pid = c["paper_id"]
            if pid in seen or pid == paper_id:
                continue
            seen.add(pid)
            matched_paper = next((p for p in other_papers if p.id == pid), None)
            if matched_paper:
                recs.append({
                    "paper_id": matched_paper.id,
                    "title": matched_paper.title or matched_paper.filename,
                    "relevance_score": round(c["relevance_score"], 3),
                    "topic": (matched_paper.result_json or {}).get("research_topic", matched_paper.title)
                })

        return SimilarPapersResponse(recommendations=recs[:5])

    except HTTPException:
        raise
    except Exception as e:
        print(f"Similar papers error: {e}")
        raise HTTPException(status_code=500, detail=f"Similar paper search failed: {str(e)}")


class ClusterRequest(BaseModel):
    paper_ids: List[int]
    n_clusters: Optional[int] = 3

class ClusterResponse(BaseModel):
    clusters: List[Dict[str, Any]] # { cluster_id: int, label: str, paper_ids: [int] }

@router.post("/cluster-papers", response_model=ClusterResponse)
async def cluster_papers(
    req: ClusterRequest,
    db: AsyncSession = Depends(get_db),
    current_user: UserModel = Depends(get_current_user)
):
    from app.rag.embeddings import get_embeddings
    
    result = await db.execute(select(PaperModel).where(PaperModel.id.in_(req.paper_ids), PaperModel.user_id == current_user.id))
    papers = result.scalars().all()
    
    if len(papers) < 3:
        raise HTTPException(status_code=400, detail="Need at least 3 papers to cluster.")

    # We will cluster based on the title and summary combined
    texts_to_embed = [p.title + " " + json.dumps(p.result_json) for p in papers]
    embeddings = get_embeddings(texts_to_embed)
    
    n_clusters = min(req.n_clusters, len(papers) - 1)
    if n_clusters < 1:
        n_clusters = 1
        
    kmeans = KMeans(n_clusters=n_clusters, random_state=42)
    labels = kmeans.fit_predict(embeddings)
    
    clusters_map = {}
    for idx, label in enumerate(labels):
        if label not in clusters_map:
            clusters_map[label] = []
        clusters_map[label].append(papers[idx])

    final_clusters = []
    for label, cluster_papers in clusters_map.items():
        # Ask LLM for a label for this cluster
        titles = ", ".join([p.title for p in cluster_papers])
        
        cluster_label = f"Cluster {label + 1}"
        if not is_demo_mode:
            try:
                resp = client.models.generate_content(
                    model='gemini-2.5-flash',
                    contents=f"Give a short 2-4 word topic label for a group of research papers with these titles: {titles}"
                )
                cluster_label = resp.text.strip()
            except:
                pass
                
        final_clusters.append({
            "cluster_id": int(label),
            "label": cluster_label,
            "paper_ids": [p.id for p in cluster_papers]
        })

    return ClusterResponse(clusters=final_clusters)
