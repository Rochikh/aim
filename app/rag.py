"""RAG layer: load corpus, chunk, embed, and retrieve."""

import os

import chromadb
from sentence_transformers import SentenceTransformer

CORPUS_DIR = os.environ.get("CORPUS_DIR", "corpus")
CHROMA_DIR = os.environ.get("CHROMA_DIR", "chroma_data")
CHUNK_SIZE = 500   # approximate token count (words used as proxy)
CHUNK_OVERLAP = 50
TOP_K = 3

_model: SentenceTransformer | None = None
_collection: chromadb.Collection | None = None


def _get_model() -> SentenceTransformer:
    global _model
    if _model is None:
        _model = SentenceTransformer("all-MiniLM-L6-v2")
    return _model


def _approximate_token_split(text: str, size: int, overlap: int) -> list[str]:
    """Split text into chunks of approximately `size` words with `overlap`."""
    words = text.split()
    chunks = []
    start = 0
    while start < len(words):
        end = start + size
        chunk = " ".join(words[start:end])
        chunks.append(chunk)
        start = end - overlap
    return chunks


def _read_txt(path: str) -> str:
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def _read_pdf(path: str) -> str:
    try:
        from PyPDF2 import PdfReader
        reader = PdfReader(path)
        pages = [page.extract_text() or "" for page in reader.pages]
        return "\n".join(pages)
    except Exception:
        return ""


def load_corpus() -> None:
    """Load all .pdf and .txt files from corpus, chunk, embed, store in ChromaDB."""
    global _collection

    client = chromadb.Client(chromadb.config.Settings(
        persist_directory=CHROMA_DIR,
        anonymized_telemetry=False,
        is_persistent=True,
    ))

    try:
        client.delete_collection("corpus")
    except Exception:
        pass

    _collection = client.create_collection(
        name="corpus",
        metadata={"hnsw:space": "cosine"},
    )

    model = _get_model()
    all_chunks: list[str] = []
    all_ids: list[str] = []
    all_meta: list[dict] = []

    if not os.path.isdir(CORPUS_DIR):
        return

    for filename in sorted(os.listdir(CORPUS_DIR)):
        filepath = os.path.join(CORPUS_DIR, filename)
        if filename.lower().endswith(".txt"):
            text = _read_txt(filepath)
        elif filename.lower().endswith(".pdf"):
            text = _read_pdf(filepath)
        else:
            continue

        if not text.strip():
            continue

        chunks = _approximate_token_split(text, CHUNK_SIZE, CHUNK_OVERLAP)
        for i, chunk in enumerate(chunks):
            chunk_id = f"{filename}_{i}"
            all_chunks.append(chunk)
            all_ids.append(chunk_id)
            all_meta.append({"source": filename, "chunk_index": i})

    if all_chunks:
        embeddings = model.encode(all_chunks).tolist()
        _collection.add(
            ids=all_ids,
            embeddings=embeddings,
            documents=all_chunks,
            metadatas=all_meta,
        )


def retrieve(query: str, top_k: int = TOP_K) -> list[str]:
    """Retrieve the top_k most relevant chunks for a query."""
    if _collection is None or _collection.count() == 0:
        return []

    model = _get_model()
    query_embedding = model.encode([query]).tolist()
    results = _collection.query(
        query_embeddings=query_embedding,
        n_results=min(top_k, _collection.count()),
    )
    return results["documents"][0] if results["documents"] else []
