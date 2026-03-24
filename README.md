# AIM - Compagnon socratique d'apprentissage

Moteur de questionnement socratique pour apprenants adultes en formation professionnelle. Applique un protocole strict en 5 phases pour guider la reflexion critique, ancre dans les documents de cours via RAG.

## Architecture

- **Backend** : FastAPI (Python)
- **LLM** : OpenRouter ou Ollama (configurable via `.env`)
- **Vector Store** : ChromaDB (local, persistant)
- **Embeddings** : sentence-transformers (`all-MiniLM-L6-v2`)
- **Frontend** : Vanilla HTML/CSS/JS (servi par FastAPI)

## Demarrage rapide

1. Copier le fichier d'environnement :
   ```bash
   cp .env.example .env
   ```

2. Configurer la cle API dans `.env` (voir section "Configuration LLM" ci-dessous)

3. Lancer :
   ```bash
   docker-compose up --build
   ```

4. Ouvrir http://localhost:8000

## Configuration LLM

### Option A : Test (OpenRouter)

```env
OPENROUTER_API_KEY=sk-or-v1-votre-cle-ici
LLM_BASE_URL=https://openrouter.ai/api/v1
LLM_MODEL=mistralai/mistral-7b-instruct
```

### Option B : Production (Ollama local)

```env
OPENROUTER_API_KEY=ollama
LLM_BASE_URL=http://localhost:11434/v1
LLM_MODEL=mistral:instruct
```

Prerequis pour Ollama :
```bash
ollama pull mistral:instruct
ollama serve
```

## Migration vers deploiement local

L'application est concue pour rendre la migration triviale :

1. **LLM** : Changer uniquement `LLM_BASE_URL` et `LLM_MODEL` dans `.env`
   - Remplacer `https://openrouter.ai/api/v1` par `http://localhost:11434/v1`
   - Remplacer `mistralai/mistral-7b-instruct` par `mistral:instruct`
   - Mettre `OPENROUTER_API_KEY=ollama` (Ollama n'exige pas de cle mais le champ doit etre non-vide)

2. **Aucune modification de code requise** : le `base_url` et l'`api_key` sont charges exclusivement depuis `.env`

3. **Resultat** : inference 100% locale, aucune donnee ne quitte le reseau client

## Corpus

Placer des fichiers `.pdf` et `.txt` dans le dossier `/corpus`. Le pipeline RAG les charge et les indexe au demarrage.

Le dossier `/corpus` est monte en volume — ajout ou remplacement de documents sans reconstruction du conteneur.

Un fichier `sample.txt` est inclus pour tester le RAG immediatement.

## Fonctionnalites

- **Deux modes** : TUTEUR (accompagnement) et CRITIQUE (audit logique)
- **Protocole socratique en 5 phases** : Ciblage → Clarification → Mecanisme → Verification → Stress-test
- **Une seule question par reponse** — jamais de reponse directe
- **RAG** : questions ancrees dans les documents de cours
- **Analyse de fin de session** : 6 dimensions notees (0-100) + bilan + export JSON
- **Stateless** : aucune donnee persistee apres fermeture de l'onglet

## Confidentialite

- Sessions sans etat : aucune donnee persistee apres fermeture de l'onglet
- Pas de localStorage pour l'historique
- Pas de comptes utilisateurs, pas d'authentification
- Pas de cookies, pas de tracking
