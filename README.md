# AIM Learning Companion

A Socratic AI companion for adult learners in professional training contexts. Uses a strict 5-phase Socratic protocol to guide learners through critical thinking, grounded in course materials via RAG.

## Architecture

- **Backend**: FastAPI (Python)
- **LLM**: Ollama with `mistral:instruct` (local, no external API calls)
- **Vector Store**: ChromaDB (local)
- **Embeddings**: sentence-transformers (`all-MiniLM-L6-v2`, local)
- **Frontend**: Vanilla HTML/CSS/JS

## Prerequisites

1. **Install Ollama**: https://ollama.ai
2. **Pull the model**:
   ```bash
   ollama pull mistral:instruct
   ```
3. **Ensure Ollama is running**:
   ```bash
   ollama serve
   ```

## Quick Start

```bash
docker-compose up --build
```

Open http://localhost:8000 in your browser.

## Corpus

Place `.pdf` and `.txt` files in the `/corpus` directory. The RAG pipeline will load and index them on startup. A sample file is included for testing.

The `/corpus` directory is volume-mounted — you can add or swap documents without rebuilding the container.

## Features

- **Two modes**: TUTOR (guided learning) and CRITIC (logical audit)
- **5-phase Socratic protocol**: Ciblage → Clarification → Mécanisme → Vérification → Stress-test
- **RAG-grounded questioning**: Questions are informed by course materials
- **Session analysis**: End-of-session cognitive assessment with 6 scored dimensions
- **JSON export**: Download full session data
- **Privacy**: All processing is local — no external API calls, no data retention

## Privacy

- No external API calls during inference
- All processing in-memory or local filesystem
- No retention of learner inputs after session ends
- No login, no authentication
