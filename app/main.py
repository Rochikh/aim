"""FastAPI application for AIM Learning Companion."""

import logging
import re
import traceback
from contextlib import asynccontextmanager
from pathlib import Path
from typing import List

from fastapi import FastAPI, UploadFile, File
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

from app.rag import load_corpus, retrieve, add_documents, list_documents, delete_document
from app.llm import build_system_prompt, chat, analyze_session


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load corpus on startup."""
    load_corpus()
    yield


app = FastAPI(title="AIM Learning Companion", lifespan=lifespan)

STATIC_DIR = Path(__file__).parent.parent / "static"
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

ALLOWED_EXTENSIONS = {".txt", ".pdf", ".pptx", ".ppt", ".zip"}


class ChatRequest(BaseModel):
    message: str
    mode: str = "TUTOR"
    topic: str = ""
    phase: int = 0
    phase_turns: int = 0  # how many turns spent in current phase
    history: list[dict] = []


class ChatResponse(BaseModel):
    reply: str
    phase: int
    phase_turns: int = 0


class AnalysisRequest(BaseModel):
    history: list[dict] = []
    timestamps: list[float] = []


class AnalysisResponse(BaseModel):
    reasoningScore: int = 0
    clarityScore: int = 0
    skepticismScore: int = 0
    processScore: int = 0
    reflectionScore: int = 0
    integrityScore: int = 0
    summary: str = ""
    keyStrengths: list[str] = []
    weaknesses: list[str] = []
    rhythmBreakCount: int = 0


CORPUS_DIR = Path(__file__).parent.parent / "corpus"


@app.get("/")
async def index():
    return FileResponse(str(STATIC_DIR / "index.html"))


@app.get("/download/{filename}")
async def download_file(filename: str):
    """Serve a file from the corpus directory for download."""
    file_path = CORPUS_DIR / filename
    if not file_path.exists() or not file_path.is_file():
        return JSONResponse(status_code=404, content={"error": "Fichier non trouvé"})
    return FileResponse(str(file_path), filename=filename)


MAX_TURNS_PER_PHASE = 2


def _compute_phase(current_phase: int, phase_turns: int) -> tuple[int, int]:
    """Advance phase based on conversation depth.

    Returns (new_phase, new_phase_turns).
    Phase advances after MAX_TURNS_PER_PHASE learner turns in the same phase.
    """
    new_turns = phase_turns + 1
    if new_turns >= MAX_TURNS_PER_PHASE and current_phase < 4:
        return current_phase + 1, 0
    return current_phase, new_turns


@app.post("/api/chat", response_model=ChatResponse)
async def api_chat(req: ChatRequest):
    import os
    api_key = os.environ.get("OPENROUTER_API_KEY", "")
    base_url = os.environ.get("LLM_BASE_URL", "")
    model = os.environ.get("LLM_MODEL", "")
    if not api_key:
        logger.error("OPENROUTER_API_KEY is not set!")
        return JSONResponse(status_code=500, content={"error": "Cle API non configuree (OPENROUTER_API_KEY manquant)"})
    if not base_url:
        logger.warning("LLM_BASE_URL is not set, will use OpenAI default")

    try:
        # Compute phase progression server-side
        new_phase, new_phase_turns = _compute_phase(req.phase, req.phase_turns)
        logger.info(f"Chat request: mode={req.mode}, topic={req.topic[:50]}, phase={req.phase}->{new_phase}, turns={req.phase_turns}->{new_phase_turns}, model={model}")

        rag_chunks = retrieve(req.message)
        system_prompt = build_system_prompt(req.mode, req.topic, new_phase, rag_chunks)

        messages = [{"role": m["role"], "content": m["content"]} for m in req.history]
        messages.append({"role": "user", "content": req.message})

        reply = await chat(system_prompt, messages)
        logger.info(f"LLM reply received ({len(reply)} chars)")

        return ChatResponse(reply=reply, phase=new_phase, phase_turns=new_phase_turns)
    except Exception as e:
        logger.error(f"Chat error: {e}\n{traceback.format_exc()}")
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.post("/api/upload")
async def api_upload(files: List[UploadFile] = File(...)):
    """Upload one or more files (PDF, PPTX, TXT, ZIP) to the RAG corpus."""
    file_data = []
    skipped = []

    for f in files:
        ext = Path(f.filename).suffix.lower() if f.filename else ""
        if ext not in ALLOWED_EXTENSIONS:
            skipped.append({"filename": f.filename, "reason": f"Type non supporté: {ext}"})
            continue
        content = await f.read()
        file_data.append((f.filename, content))

    results = add_documents(file_data) if file_data else []
    return {"results": results, "skipped": skipped}


@app.get("/api/documents")
async def api_documents():
    """List all documents in the corpus."""
    return {"documents": list_documents()}


@app.delete("/api/documents/{filename}")
async def api_delete_document(filename: str):
    """Delete a document from the corpus."""
    ok = delete_document(filename)
    if ok:
        return {"status": "ok"}
    return {"status": "error", "message": "Fichier non trouvé"}


@app.post("/api/analyze", response_model=AnalysisResponse)
async def api_analyze(req: AnalysisRequest):
    analysis = await analyze_session(req.history)

    # Count rhythm breaks: user responses submitted in under 8 seconds
    rhythm_breaks = 0
    if len(req.timestamps) >= 2:
        for i in range(1, len(req.timestamps), 2):
            if i + 1 < len(req.timestamps):
                gap = req.timestamps[i + 1] - req.timestamps[i]
                if 0 < gap < 8:
                    rhythm_breaks += 1

    return AnalysisResponse(
        reasoningScore=analysis.get("reasoningScore", 0),
        clarityScore=analysis.get("clarityScore", 0),
        skepticismScore=analysis.get("skepticismScore", 0),
        processScore=analysis.get("processScore", 0),
        reflectionScore=analysis.get("reflectionScore", 0),
        integrityScore=analysis.get("integrityScore", 0),
        summary=analysis.get("summary", ""),
        keyStrengths=analysis.get("keyStrengths", []),
        weaknesses=analysis.get("weaknesses", []),
        rhythmBreakCount=rhythm_breaks,
    )


@app.get("/api/health")
async def health():
    import os
    return {
        "status": "ok",
        "has_api_key": bool(os.environ.get("OPENROUTER_API_KEY", "")),
        "base_url": os.environ.get("LLM_BASE_URL", "(not set)"),
        "model": os.environ.get("LLM_MODEL", "(not set)"),
    }


@app.get("/api/test-llm")
async def test_llm():
    """Quick test of the LLM connection."""
    try:
        reply = await chat("Tu es un assistant. Reponds en une phrase.", [{"role": "user", "content": "Dis bonjour."}])
        return {"status": "ok", "reply": reply}
    except Exception as e:
        logger.error(f"LLM test error: {e}\n{traceback.format_exc()}")
        return JSONResponse(status_code=500, content={"error": str(e), "type": type(e).__name__})
