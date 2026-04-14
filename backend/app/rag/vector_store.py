import os
import faiss
import numpy as np
from typing import List, Tuple

# On Vercel / Lambda the filesystem is read-only except for /tmp/.
# Fall back automatically when running in those environments.
_is_serverless = bool(os.getenv("VERCEL") or os.getenv("AWS_LAMBDA_FUNCTION_NAME"))
_default_data_dir = "/tmp/data" if _is_serverless else (
    "/app/data" if os.path.exists("/app/data") else "./data"
)
DATA_DIR = os.getenv("VECTOR_DATA_DIR", _default_data_dir)
FAISS_INDEX_PATH = os.path.join(DATA_DIR, "faiss.index")
EMBEDDING_DIM = 768 # Google text-embedding-004 output dimension

class VectorStore:
    def __init__(self):
        if not os.path.exists(DATA_DIR):
            os.makedirs(DATA_DIR, exist_ok=True)
            
        if os.path.exists(FAISS_INDEX_PATH):
            try:
                self.index = faiss.read_index(FAISS_INDEX_PATH)
            except Exception as e:
                print(f"Error loading FAISS index: {e}")
                self._create_new_index()
        else:
            self._create_new_index()

    def _create_new_index(self):
        # We use IndexIDMap to map integer IDs to vectors
        base_index = faiss.IndexFlatL2(EMBEDDING_DIM)
        self.index = faiss.IndexIDMap(base_index)

    def add_embeddings(self, ids: List[int], embeddings: List[List[float]]):
        if not embeddings:
            return
            
        emb_matrix = np.array(embeddings).astype("float32")
        id_array = np.array(ids).astype("int64")
        self.index.add_with_ids(emb_matrix, id_array)
        self.save()

    def search(self, query_embedding: List[float], top_k: int = 5) -> List[Tuple[int, float]]:
        if self.index.ntotal == 0:
            return []
            
        query_vector = np.array([query_embedding]).astype("float32")
        distances, indices = self.index.search(query_vector, top_k)
        
        results = []
        for i in range(len(indices[0])):
            idx = int(indices[0][i])
            if idx != -1: # FAISS returns -1 for empty slots
                results.append((idx, float(distances[0][i])))
                
        return results

    def save(self):
        try:
            faiss.write_index(self.index, FAISS_INDEX_PATH)
        except Exception as e:
            print(f"Error saving FAISS index: {e}")

    def get_total_vectors(self):
        return self.index.ntotal

# Singleton instance
vector_store = VectorStore()
