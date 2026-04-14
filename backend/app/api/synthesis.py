from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import PlainTextResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from typing import List, Optional
from pydantic import BaseModel
from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User as UserModel
from app.models.project import Project as ProjectModel
from google import genai
import os
import json
import re
import time
from datetime import datetime

router = APIRouter(prefix="/synthesis", tags=["Synthesis"])

api_key = os.getenv("GOOGLE_API_KEY")
is_demo_mode = not api_key or api_key == "your_gemini_api_key_here"
client = None
if not is_demo_mode:
    client = genai.Client(api_key=api_key)

class SynthesisResponse(BaseModel):
    overall_theme: str
    consensus_findings: List[str]
    major_contradictions: List[str]
    combined_research_gap: str
    strategic_next_steps: List[str]
    confidence_score: float

@router.get("/{project_id}/export", response_class=PlainTextResponse)
async def export_synthesis(
    project_id: int,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(ProjectModel)
        .where(ProjectModel.id == project_id, ProjectModel.user_id == current_user.id)
        .options(selectinload(ProjectModel.papers))
    )
    project = result.scalars().first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    lines = [
        f"SYNTHESIS REPORT — {project.name}",
        f"Generated: {datetime.utcnow().strftime('%B %d, %Y %H:%M UTC')}",
        "=" * 60,
        "",
        f"Description: {project.description or 'N/A'}",
        f"Total Papers: {len(project.papers)}",
        "",
    ]
    for i, paper in enumerate(project.papers, 1):
        rj = paper.result_json or {}
        lines += [
            f"PAPER {i}: {paper.title}",
            "-" * 40,
            f"Topic: {rj.get('research_topic', 'N/A')}",
            f"Methods: {rj.get('methods_summary', 'N/A')}",
            f"Research Gap: {rj.get('research_gap_identified', 'N/A')}",
            f"Suggested Direction: {rj.get('suggested_novel_direction', 'N/A')}",
            f"Confidence Score: {rj.get('confidence_score', 'N/A')}",
            "",
            "Key Findings:",
        ]
        for f in rj.get("key_findings", []):
            lines.append(f"  • {f}")
        lines += ["", "Limitations:"]
        for lim in rj.get("limitations", []):
            lines.append(f"  • {lim}")
        lines.append("")

    return "\n".join(lines)


@router.post("/{project_id}", response_model=SynthesisResponse)
async def synthesize_project(
    project_id: int,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(ProjectModel)
        .where(ProjectModel.id == project_id, ProjectModel.user_id == current_user.id)
        .options(selectinload(ProjectModel.papers))
    )
    project = result.scalars().first()
    if not project or not project.papers:
        raise HTTPException(status_code=404, detail="Project not found or contains no papers")

    # Aggregate data for AI
    papers_data = []
    for paper in project.papers:
        papers_data.append({
            "title": paper.title,
            "analysis": paper.result_json
        })

    if is_demo_mode:
        return SynthesisResponse(
            overall_theme=f"Aggregated Study of {project.name}",
            consensus_findings=["Consensus point 1", "Consensus point 2"],
            major_contradictions=["Conflict A vs B"],
            combined_research_gap="Synthesized gap from all papers.",
            strategic_next_steps=["Step 1", "Step 2"],
            confidence_score=92.0
        )

    prompt = f"""
    ACT AS: Advanced Research Synthesis Engine.
    PROJECT: {project.name}
    DESCRIPTION: {project.description}
    INPUT DATA (Multiple Paper Analyses):
    {json.dumps(papers_data, indent=2)}

    DIRECTIVE: Synthesize the input analyses. Identify consensus, find contradictions between papers, and propose a strategic unified research gap.
    STRICT JSON OUTPUT FORMAT (replace every placeholder with actual content — do NOT return placeholder text like "str"):
    {{
        "overall_theme": "A concise title describing the collective research theme across all papers (e.g. 'Deep Learning Approaches for Medical Image Segmentation')",
        "consensus_findings": ["Key finding agreed upon by multiple papers", "Another shared conclusion"],
        "major_contradictions": ["Paper A says X while Paper B says Y", "..."],
        "combined_research_gap": "A single paragraph describing the unified research gap across all papers",
        "strategic_next_steps": ["Concrete next research step 1", "Concrete next research step 2"],
        "confidence_score": 85
    }}
    """

    # Try with retries and exponential backoff for 503/overload errors
    models_to_try = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash']
    last_error = None

    for model_name in models_to_try:
        for attempt in range(3):
            try:
                response = client.models.generate_content(model=model_name, contents=prompt)
                json_match = re.search(r'\{.*\}', response.text, re.DOTALL)
                if json_match:
                    return SynthesisResponse(**json.loads(json_match.group()))
                raise ValueError("Could not parse AI response as JSON")
            except Exception as e:
                last_error = e
                err_str = str(e)
                if '503' in err_str or 'UNAVAILABLE' in err_str or 'overloaded' in err_str.lower():
                    wait = 2 ** attempt  # 1s, 2s, 4s
                    print(f"Model {model_name} overloaded (attempt {attempt+1}). Retrying in {wait}s...")
                    time.sleep(wait)
                    continue
                # Non-retryable error — try next model
                print(f"Model {model_name} failed: {e}")
                break

    print(f"All synthesis attempts failed. Last error: {last_error}")
    raise HTTPException(status_code=503, detail="AI synthesis service is temporarily overloaded. Please try again in a moment.")
