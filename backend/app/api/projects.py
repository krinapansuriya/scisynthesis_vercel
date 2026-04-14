from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from typing import List
from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User as UserModel
from app.models.project import Project as ProjectModel, Note as NoteModel
from app.models.schemas import Project, ProjectCreate, Note, NoteCreate, PaperHistory

router = APIRouter(prefix="/projects", tags=["Projects & Notes"])

@router.get("/", response_model=List[Project])
async def list_projects(
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(ProjectModel)
        .where(ProjectModel.user_id == current_user.id)
        .options(selectinload(ProjectModel.papers))
    )
    return result.scalars().all()

@router.post("/", response_model=Project)
async def create_project(
    project_in: ProjectCreate,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    new_project = ProjectModel(**project_in.model_dump(), user_id=current_user.id)
    db.add(new_project)
    await db.commit()
    await db.refresh(new_project)
    return new_project

@router.get("/{project_id}", response_model=Project)
async def get_project(
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
    return project

@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: int,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(ProjectModel).where(ProjectModel.id == project_id, ProjectModel.user_id == current_user.id))
    project = result.scalars().first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    await db.delete(project)
    await db.commit()
    return None

@router.post("/notes", response_model=Note)
async def create_note(
    note_in: NoteCreate,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    new_note = NoteModel(**note_in.model_dump(), user_id=current_user.id)
    db.add(new_note)
    await db.commit()
    await db.refresh(new_note)
    return new_note

@router.get("/notes/{paper_id}", response_model=List[Note])
async def list_notes_for_paper(
    paper_id: int,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(NoteModel).where(NoteModel.paper_id == paper_id, NoteModel.user_id == current_user.id))
    return result.scalars().all()
