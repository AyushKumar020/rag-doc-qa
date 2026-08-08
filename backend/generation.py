import os
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

client = Groq(api_key=os.getenv("GROQ_API_KEY"))

def generate_answer(query: str, context_chunks: list[str]) -> str:
    context = "\n\n".join(context_chunks)

    prompt = f"""Answer the question using ONLY the context below. If the answer isn't in the context, say "I don't have enough information to answer that."

Context:
{context}

Question: {query}

Answer:"""

    response = client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2,
    )

    return response.choices[0].message.content


def generate_answer_stream(query: str, context_chunks: list[str]):
    context = "\n\n".join(context_chunks)

    prompt = f"""Answer the question using ONLY the context below. If the answer isn't in the context, say "I don't have enough information to answer that."

Context:
{context}

Question: {query}

Answer:"""

    stream = client.chat.completions.create(
        model="llama-3.1-8b-instant",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2,
        stream=True,
    )

    for chunk in stream:
        delta = chunk.choices[0].delta.content
        if delta:
            yield delta