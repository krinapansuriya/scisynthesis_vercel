import io
import re
from typing import List, Dict, Tuple
from pypdf import PdfReader
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.chunk import DocumentChunk
from app.rag.embeddings import get_embeddings
from app.rag.vector_store import vector_store

# Chunking parameters
CHUNK_SIZE = 500 # rough word count
CHUNK_OVERLAP = 100

def chunk_text(text: str, page_num: int = None) -> List[Dict]:
    words = text.split()
    chunks = []
    
    # Handle small texts
    if len(words) <= CHUNK_SIZE:
        chunks.append({"text": text, "page": page_num})
        return chunks
        
    start = 0
    while start < len(words):
        end = min(start + CHUNK_SIZE, len(words))
        chunk_words = words[start:end]
        chunk_text = " ".join(chunk_words)
        chunks.append({"text": chunk_text, "page": page_num})
        start += (CHUNK_SIZE - CHUNK_OVERLAP)
        
    return chunks

def extract_and_chunk_pdf(content: bytes) -> List[Dict]:
    reader = PdfReader(io.BytesIO(content))
    all_chunks = []
    for i, page in enumerate(reader.pages):
        page_text = page.extract_text()
        if page_text:
            page_text = re.sub(r'\s+', ' ', page_text).strip()
            page_chunks = chunk_text(page_text, page_num=i + 1)
            all_chunks.extend(page_chunks)
    return all_chunks

def chunk_plain_text(text: str) -> List[Dict]:
    text = re.sub(r'\s+', ' ', text).strip()
    return chunk_text(text, page_num=None)

async def ingest_document(paper_id: int, file_content: bytes, filename: str, db: AsyncSession) -> int:
    """
    Ingests a document, chunks it, generates embeddings, saves to DB, and adds to FAISS.
    Returns the number of chunks processed.
    """
    if filename.endswith(".pdf"):
        chunks_data = extract_and_chunk_pdf(file_content)
    else:
        text = file_content.decode("utf-8")
        chunks_data = chunk_plain_text(text)

    # 1. Save chunks to DB
    db_chunks = []
    for index, data in enumerate(chunks_data):
        chunk = DocumentChunk(
            paper_id=paper_id,
            text=data["text"],
            page_number=data["page"],
            chunk_index=index
        )
        db.add(chunk)
        db_chunks.append(chunk)
        
    await db.commit()
    
    # Needs a fresh query to get auto-generated IDs
    for chunk in db_chunks:
        await db.refresh(chunk)

    # 2. Get Embeddings
    texts = [chunk.text for chunk in db_chunks]
    embeddings = get_embeddings(texts)

    # 3. Save to Vector Store
    chunk_ids = [chunk.id for chunk in db_chunks]
    vector_store.add_embeddings(chunk_ids, embeddings)
    
    return len(db_chunks)
