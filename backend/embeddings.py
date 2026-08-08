from sentence_transformers import SentenceTransformer

# Loads once when the server starts (small model, ~80MB, runs on CPU fine)
model = SentenceTransformer("all-MiniLM-L6-v2")

def get_embedding(text: str) -> list[float]:
    embedding = model.encode(text)
    return embedding.tolist()