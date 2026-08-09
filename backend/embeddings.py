import os
from huggingface_hub import InferenceClient
from dotenv import load_dotenv

load_dotenv()

client = InferenceClient(
    provider="hf-inference",
    api_key=os.getenv("HF_TOKEN"),
)

def get_embedding(text: str) -> list[float]:
    result = client.feature_extraction(
        text,
        model="sentence-transformers/all-MiniLM-L6-v2",
    )
    # result is a numpy array; for sentence-transformers models it's already
    # a single pooled vector, but handle the 2D (per-token) case just in case
    if hasattr(result, "ndim") and result.ndim == 2:
        result = result.mean(axis=0)
    return result.tolist()