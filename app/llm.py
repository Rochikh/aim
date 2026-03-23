"""LLM interaction via OpenRouter (OpenAI-compatible API)."""

import os
import httpx

OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
MODEL = os.environ.get("LLM_MODEL", "mistralai/mistral-7b-instruct")
TIMEOUT = 120.0


SYSTEM_TUTOR = """Tu es un mentor socratique bienveillant, empathique et complice.
Tu utilises systématiquement le "TU" pour t'adresser à l'apprenant·e.
Ton but est de faire accoucher l'esprit (maïeutique) en guidant la réflexion pas à pas.
Règles :
1. Ne dépasse jamais 3 à 4 phrases par message.
2. Valide l'effort avant de rediriger. Si l'apprenant·e bloque, propose une analogie ou un indice progressif.
3. Si une définition est demandée, explique en max 2 phrases puis vérifie la compréhension immédiatement.
4. Dès qu'une base est posée, avance vers Phase 2. Ne reste pas bloqué en Phase 1.
5. Évite les reproches. Préfère l'invitation : "Ce point semble complexe, essayons un autre angle..."
À la fin de chaque message, ajoute obligatoirement :
---
Phase: [Numéro]

Mode : Tuteur (Accompagnement)
Sujet d'exploration : "{topic}" """

SYSTEM_CRITIC = """Tu es un mentor socratique bienveillant, empathique et complice.
Tu utilises systématiquement le "TU" pour t'adresser à l'apprenant·e.
Ton but est de faire accoucher l'esprit (maïeutique) en guidant la réflexion pas à pas.
Règles :
1. Ne dépasse jamais 3 à 4 phrases par message.
2. Valide l'effort avant de rediriger. Si l'apprenant·e bloque, propose une analogie ou un indice progressif.
3. Si une définition est demandée, explique en max 2 phrases puis vérifie la compréhension immédiatement.
4. Dès qu'une base est posée, avance vers Phase 2. Ne reste pas bloqué en Phase 1.
5. Évite les reproches. Préfère l'invitation : "Ce point semble complexe, essayons un autre angle..."
À la fin de chaque message, ajoute obligatoirement :
---
Phase: [Numéro]

Mode : Critique (Audit Logique)
Ta mission : proposer des raisonnements fallacieux pour tester la vigilance. Reste un partenaire de jeu élégant, jamais méprisant.
Sujet d'exploration : "{topic}" """

ANALYSIS_SYSTEM = """Tu es un évaluateur pédagogique. Analyse la conversation suivante entre un mentor socratique et un apprenant.
Produis un JSON strict avec cette structure :
{
  "reasoningScore": <0-100>,
  "clarityScore": <0-100>,
  "skepticismScore": <0-100>,
  "processScore": <0-100>,
  "reflectionScore": <0-100>,
  "integrityScore": <0-100>,
  "summary": "<150 mots max : évaluation de la progression cognitive>",
  "keyStrengths": ["...", "..."],
  "weaknesses": ["...", "..."]
}
Réponds UNIQUEMENT avec le JSON, sans texte autour."""


PHASE_GUIDANCE = {
    0: "Phase actuelle: 0 (Ciblage). Identifie l'objet exact de l'interrogation et l'intention de l'apprenant·e.",
    1: "Phase actuelle: 1 (Clarification). Fais émerger les ambiguïtés conceptuelles, définis les termes rigoureusement.",
    2: "Phase actuelle: 2 (Mécanisme). Explore les relations cause-effet. 'Comment ça marche ?'",
    3: "Phase actuelle: 3 (Vérification). Pousse vers des preuves, critères testables, protocoles de preuve.",
    4: "Phase actuelle: 4 (Stress-test). Confronte le raisonnement avec des contre-exemples et des limites.",
}

STRATEGIES = [
    "clarification", "test_necessite", "contre_exemple", "prediction",
    "falsifiabilite", "mecanisme_causal", "changement_cadre",
    "compression", "concession_controlee",
]


def build_system_prompt(mode: str, topic: str, phase: int, rag_context: list[str]) -> str:
    """Build the full system prompt with mode, phase guidance, and RAG context."""
    template = SYSTEM_TUTOR if mode == "TUTOR" else SYSTEM_CRITIC
    system = template.replace("{topic}", topic)

    system += f"\n\n{PHASE_GUIDANCE.get(phase, PHASE_GUIDANCE[0])}"

    system += f"\n\nStratégies socratiques disponibles : {', '.join(STRATEGIES)}. Choisis la plus pertinente pour ce tour."

    if rag_context:
        context_text = "\n---\n".join(rag_context)
        system += f"\n\nContexte documentaire (utilise-le pour ancrer tes questions, ne le montre PAS directement à l'apprenant·e) :\n{context_text}"

    return system


async def chat(system_prompt: str, messages: list[dict]) -> str:
    """Send chat to OpenRouter and return assistant response."""
    api_messages = [{"role": "system", "content": system_prompt}]
    api_messages.extend(messages)

    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        response = await client.post(
            f"{OPENROUTER_BASE_URL}/chat/completions",
            headers={
                "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": MODEL,
                "messages": api_messages,
            },
        )
        response.raise_for_status()
        data = response.json()
        return data["choices"][0]["message"]["content"]


async def analyze_session(messages: list[dict]) -> dict:
    """Generate end-of-session analysis via a second LLM call."""
    import json as json_mod

    conversation_text = "\n".join(
        f"{'Apprenant' if m['role'] == 'user' else 'Companion'}: {m['content']}"
        for m in messages
    )

    analysis_messages = [
        {"role": "user", "content": f"Voici la conversation à analyser :\n\n{conversation_text}"}
    ]

    raw = await chat(ANALYSIS_SYSTEM, analysis_messages)

    # Try to parse JSON from response
    try:
        # Find JSON in the response
        start = raw.find("{")
        end = raw.rfind("}") + 1
        if start >= 0 and end > start:
            return json_mod.loads(raw[start:end])
    except (json_mod.JSONDecodeError, ValueError):
        pass

    return {
        "reasoningScore": 0,
        "clarityScore": 0,
        "skepticismScore": 0,
        "processScore": 0,
        "reflectionScore": 0,
        "integrityScore": 0,
        "summary": "Analyse non disponible.",
        "keyStrengths": [],
        "weaknesses": [],
    }
