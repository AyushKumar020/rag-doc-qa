import json
from fastapi.responses import StreamingResponse
from generation import generate_answer, generate_answer_stream
from fastapi import FastAPI, UploadFile, File, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from database import get_db, engine, Base
from models import Document, Chunk
from pdf_parser import extract_text_from_pdf
from chunking import chunk_text
from embeddings import get_embedding
from retrieval import search_similar_chunks
from generation import generate_answer

app = FastAPI(title="RAG Doc Q&A API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def health_check():
    return {"status": "ok", "message": "RAG Doc Q&A backend running"}


@app.post("/upload")
async def upload_document(file: UploadFile = File(...), db: Session = Depends(get_db)):
    file_bytes = await file.read()
    text = extract_text_from_pdf(file_bytes)

    if not text.strip():
        return {"error": "Could not extract text from this PDF."}

    # Save document record
    doc = Document(filename=file.filename)
    db.add(doc)
    db.commit()
    db.refresh(doc)

    # Chunk the text
    chunks = chunk_text(text)

    # Save chunks with embeddings
    for idx, chunk_content in enumerate(chunks):
        embedding_vector = get_embedding(chunk_content)
        chunk = Chunk(
            document_id=doc.id,
            content=chunk_content,
            embedding=embedding_vector,
            chunk_index=idx
        )
        db.add(chunk)
    db.commit()

    return {
        "message": "Document uploaded and chunked successfully",
        "document_id": doc.id,
        "filename": doc.filename,
        "num_chunks": len(chunks)
    }

@app.get("/search")
def search(query: str, db: Session = Depends(get_db)):
    results = search_similar_chunks(query, db)
    return {
        "query": query,
        "results": [
            {
                "chunk_id": r.id,
                "document_id": r.document_id,
                "content": r.content,
                "chunk_index": r.chunk_index
            }
            for r in results
        ]
    }

@app.get("/ask")
def ask(query: str, document_id: int | None = None, db: Session = Depends(get_db)):
    chunks = search_similar_chunks(query, db, document_id=document_id)
    context_texts = [c.content for c in chunks]

    answer = generate_answer(query, context_texts)

    return {
        "query": query,
        "answer": answer,
        "sources": [
            {
                "chunk_id": c.id,
                "document_id": c.document_id,
                "chunk_index": c.chunk_index,
                "content": c.content[:200] + "..."
            }
            for c in chunks
        ]
    }

@app.get("/ask/stream")
def ask_stream(query: str, document_id: int | None = None, db: Session = Depends(get_db)):
    chunks = search_similar_chunks(query, db, document_id=document_id)
    context_texts = [c.content for c in chunks]

    sources_payload = [
        {
            "chunk_id": c.id,
            "document_id": c.document_id,
            "chunk_index": c.chunk_index,
            "content": c.content[:200] + "..."
        }
        for c in chunks
    ]

    def event_generator():
        # Send sources first, as JSON, followed by a unique delimiter
        yield json.dumps(sources_payload)
        yield "\n---SOURCES-END---\n"

        # Then stream the actual answer tokens
        for token in generate_answer_stream(query, context_texts):
            yield token

    return StreamingResponse(event_generator(), media_type="text/plain")

@app.get("/documents")
def list_documents(db: Session = Depends(get_db)):
    docs = db.query(Document).all()
    return [
        {"id": d.id, "filename": d.filename, "uploaded_at": d.uploaded_at}
        for d in docs
    ]