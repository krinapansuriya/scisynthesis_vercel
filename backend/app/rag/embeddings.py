import os
import json
import hashlib
from typing import List
from concurrent.futures import ThreadPoolExecutor, as_completed
from google import genai
import redis

# Redis setup for caching
redis_host = os.getenv("REDIS_HOST", "localhost")
redis_port = int(os.getenv("REDIS_PORT", "6379"))

try:
    cache = redis.Redis(host=redis_host, port=redis_port, db=0, decode_responses=True)
    cache.ping()
    HAS_REDIS = True
except redis.ConnectionError:
    HAS_REDIS = False
    print("Warning: Redis is not available. Embedding caching is disabled.")

api_key = os.getenv("GOOGLE_API_KEY")
is_demo_mode = not api_key or api_key == "your_gemini_api_key_here"

client = None
if not is_demo_mode:
    client = genai.Client(api_key=api_key)

def get_text_hash(text: str) -> str:
    return hashlib.sha256(text.encode('utf-8')).hexdigest()

def get_embedding(text: str) -> List[float]:
    """Embed a single text string."""
    if is_demo_mode:
        return [0.0] * 768

    text_hash = get_text_hash(text)
    cache_key = f"emb:{text_hash}"

    if HAS_REDIS:
        cached_emb = cache.get(cache_key)
        if cached_emb:
            return json.loads(cached_emb)

    try:
        response = client.models.embed_content(
            model='gemini-embedding-001',
            contents=text
        )
        emb = list(response.embeddings[0].values)

        if HAS_REDIS:
            cache.setex(cache_key, 86400 * 7, json.dumps(emb))

        return emb
    except Exception as e:
        print(f"Error getting embedding: {e}")
        return [0.0] * 768

def get_embeddings(texts: List[str]) -> List[List[float]]:
    """
    Embed multiple texts concurrently using a thread pool.
    Dramatically faster than sequential calls for large documents.
    """
    if not texts:
        return []

    if is_demo_mode:
        return [[0.0] * 768 for _ in texts]

    results: List[List[float]] = [[0.0] * 768] * len(texts)

    # Run up to 10 embedding calls in parallel
    with ThreadPoolExecutor(max_workers=10) as executor:
        future_to_idx = {
            executor.submit(get_embedding, text): i
            for i, text in enumerate(texts)
        }
        for future in as_completed(future_to_idx):
            idx = future_to_idx[future]
            try:
                results[idx] = future.result()
            except Exception as e:
                print(f"Embedding error at index {idx}: {e}")
                results[idx] = [0.0] * 768

    return results
