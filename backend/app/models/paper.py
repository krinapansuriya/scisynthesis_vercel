from sqlalchemy import Column, Integer, String, JSON, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from app.core.database import Base

class Paper(Base):
    __tablename__ = "papers"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)
    title = Column(String, nullable=False)
    filename = Column(String, nullable=False)
    result_json = Column(JSON, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    owner = relationship("User", back_populates="papers")
    project = relationship("Project", back_populates="papers")
    notes = relationship("Note", back_populates="paper", cascade="all, delete-orphan")
    chunks = relationship("DocumentChunk", back_populates="paper", cascade="all, delete-orphan")

