from sqlalchemy.orm import Session
from models import Chunk
from embeddings import get_embedding

def search_similar_chunks(query: str, db: Session, top_k: int = 3, document_id: int | None = None):
    query_embedding = get_embedding(query)

    q = db.query(Chunk)

    if document_id is not None:
        q = q.filter(Chunk.document_id == document_id)

    results = (
        q.order_by(Chunk.embedding.cosine_distance(query_embedding))
        .limit(top_k)
        .all()
    )
    return results