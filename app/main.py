"""FastAPI application for AIM Learning Companion."""

import re
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from app.rag import load_corpus, retrieve
from app.llm import build_system_prompt, chat, analyze_session


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load corpus on startup."""
    load_corpus()
    yield


app = FastAPI(title="AIM Learning Companion", lifespan=lifespan)

STATIC_DIR = Path(__file__).parent.parent / "static"
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


class ChatRequest(BaseModel):
    message: str
    mode: str = "TUTOR"
    topic: str = ""
    phase: int = 0
    history: list[dict] = []


class ChatResponse(BaseModel):
    reply: str
    phase: int


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


@app.get("/")
async def index():
    return FileResponse(str(STATIC_DIR / "index.html"))


def _detect_phase(reply: str, current_phase: int) -> int:
    """Extract phase number from the companion's reply."""
    match = re.search(r"Phase:\s*(\d)", reply)
    if match:
        return int(match.group(1))
    return current_phase


@app.post("/api/chat", response_model=ChatResponse)
async def api_chat(req: ChatRequest):
    rag_chunks = retrieve(req.message)
    system_prompt = build_system_prompt(req.mode, req.topic, req.phase, rag_chunks)

    messages = [{"role": m["role"], "content": m["content"]} for m in req.history]
    messages.append({"role": "user", "content": req.message})

    reply = await chat(system_prompt, messages)
    detected_phase = _detect_phase(reply, req.phase)

    return ChatResponse(reply=reply, phase=detected_phase)


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
    return {"status": "ok"}
