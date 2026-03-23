/**
 * AIM Learning Companion - Frontend Application
 */

const state = {
    mode: "TUTOR",
    topic: "",
    phase: 0,
    history: [],       // {role, content}
    timestamps: [],    // timestamps for each message
    sending: false,
};

// DOM elements
const $ = (sel) => document.querySelector(sel);
const setupScreen = $("#setup-screen");
const chatScreen = $("#chat-screen");
const analysisScreen = $("#analysis-screen");
const topicInput = $("#topic-input");
const startBtn = $("#start-btn");
const chatMessages = $("#chat-messages");
const chatInput = $("#chat-input");
const sendBtn = $("#send-btn");
const endSessionBtn = $("#end-session-btn");
const resetBtn = $("#reset-btn");
const exportBtn = $("#export-btn");
const newSessionBtn = $("#new-session-btn");

// Setup: mode selection
document.querySelectorAll(".mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".mode-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        state.mode = btn.dataset.mode;
    });
});

// Setup: enable start when topic is entered
topicInput.addEventListener("input", () => {
    startBtn.disabled = !topicInput.value.trim();
});

// Start session
startBtn.addEventListener("click", () => {
    state.topic = topicInput.value.trim();
    if (!state.topic) return;
    state.phase = 0;
    state.history = [];
    state.timestamps = [];
    $("#header-mode").textContent = state.mode;
    $("#header-topic").textContent = state.topic;
    showScreen("chat");
    updatePhaseIndicator();
    addSystemMessage(`Session démarrée — Mode: ${state.mode} — Sujet: ${state.topic}`);
    // Send initial message to get companion's opening question
    sendMessage(`Je souhaite explorer le sujet suivant : ${state.topic}`);
});

// Send message
sendBtn.addEventListener("click", () => sendUserMessage());
chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendUserMessage();
    }
});

function sendUserMessage() {
    const text = chatInput.value.trim();
    if (!text || state.sending) return;
    chatInput.value = "";
    addMessage("user", text);
    state.timestamps.push(Date.now() / 1000);
    sendMessage(text);
}

async function sendMessage(text) {
    state.sending = true;
    sendBtn.disabled = true;
    chatInput.disabled = true;

    // Show typing indicator
    const typing = document.createElement("div");
    typing.className = "typing-indicator";
    typing.textContent = "Companion réfléchit...";
    chatMessages.appendChild(typing);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    try {
        const resp = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                message: text,
                mode: state.mode,
                topic: state.topic,
                phase: state.phase,
                history: state.history,
                timestamp: Date.now() / 1000,
            }),
        });

        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();

        // Remove typing indicator
        typing.remove();

        // Update phase
        state.phase = data.phase;
        updatePhaseIndicator();

        // Add to history and display
        state.history.push({ role: "user", content: text });
        state.history.push({ role: "assistant", content: data.reply });
        state.timestamps.push(Date.now() / 1000);

        addMessage("assistant", data.reply);
    } catch (err) {
        typing.remove();
        addSystemMessage(`Erreur de connexion: ${err.message}. Vérifiez qu'Ollama est en cours d'exécution.`);
    } finally {
        state.sending = false;
        sendBtn.disabled = false;
        chatInput.disabled = false;
        chatInput.focus();
    }
}

function addMessage(role, content) {
    const div = document.createElement("div");
    div.className = `message ${role}`;
    div.textContent = content;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addSystemMessage(text) {
    const div = document.createElement("div");
    div.className = "message system";
    div.textContent = text;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function updatePhaseIndicator() {
    document.querySelectorAll(".phase-step").forEach((step) => {
        const p = parseInt(step.dataset.phase);
        step.classList.remove("active", "done");
        if (p === state.phase) step.classList.add("active");
        else if (p < state.phase) step.classList.add("done");
    });
}

function showScreen(name) {
    [setupScreen, chatScreen, analysisScreen].forEach((s) => s.classList.remove("active"));
    if (name === "setup") setupScreen.classList.add("active");
    else if (name === "chat") chatScreen.classList.add("active");
    else if (name === "analysis") analysisScreen.classList.add("active");
}

// End session
endSessionBtn.addEventListener("click", async () => {
    if (state.history.length === 0) {
        addSystemMessage("Aucun message dans la session.");
        return;
    }
    showScreen("analysis");
    $("#analysis-loading").classList.remove("hidden");
    $("#analysis-content").classList.add("hidden");

    try {
        const resp = await fetch("/api/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                history: state.history,
                timestamps: state.timestamps,
            }),
        });

        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        displayAnalysis(data);
    } catch (err) {
        $("#analysis-loading").textContent = `Erreur: ${err.message}`;
    }
});

function displayAnalysis(data) {
    $("#analysis-loading").classList.add("hidden");
    $("#analysis-content").classList.remove("hidden");

    const scores = [
        { key: "reasoningScore", label: "Raisonnement", color: "#6c5ce7" },
        { key: "clarityScore", label: "Clarté", color: "#00cec9" },
        { key: "skepticismScore", label: "Scepticisme", color: "#e17055" },
        { key: "processScore", label: "Processus", color: "#00b894" },
        { key: "reflectionScore", label: "Réflexion", color: "#fdcb6e" },
        { key: "integrityScore", label: "Intégrité", color: "#a29bfe" },
    ];

    const grid = $("#scores-grid");
    grid.innerHTML = "";
    scores.forEach(({ key, label, color }) => {
        const val = data[key] || 0;
        const card = document.createElement("div");
        card.className = "score-card";
        card.innerHTML = `
            <div class="score-value" style="color: ${color}">${val}</div>
            <div class="score-label">${label}</div>
            <div class="score-bar">
                <div class="score-bar-fill" style="width: ${val}%; background: ${color}"></div>
            </div>
        `;
        grid.appendChild(card);
    });

    $("#analysis-summary").textContent = data.summary || "Aucune analyse disponible.";

    const strengthsList = $("#analysis-strengths");
    strengthsList.innerHTML = "";
    (data.keyStrengths || []).forEach((s) => {
        const li = document.createElement("li");
        li.textContent = s;
        strengthsList.appendChild(li);
    });

    const weaknessesList = $("#analysis-weaknesses");
    weaknessesList.innerHTML = "";
    (data.weaknesses || []).forEach((w) => {
        const li = document.createElement("li");
        li.textContent = w;
        weaknessesList.appendChild(li);
    });

    $("#analysis-rhythm").textContent =
        `Nombre de réponses avec un rythme anormalement rapide (< 8s) : ${data.rhythmBreakCount || 0}`;
}

// Export JSON
exportBtn.addEventListener("click", () => {
    const exportData = {
        topic: state.topic,
        mode: state.mode,
        history: state.history,
        timestamps: state.timestamps,
        exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `aim-session-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
});

// Reset / New session
resetBtn.addEventListener("click", () => {
    if (!confirm("Réinitialiser la session ? Toutes les données seront perdues.")) return;
    resetState();
    showScreen("setup");
});

newSessionBtn.addEventListener("click", () => {
    resetState();
    showScreen("setup");
});

function resetState() {
    state.phase = 0;
    state.history = [];
    state.timestamps = [];
    chatMessages.innerHTML = "";
    topicInput.value = "";
    startBtn.disabled = true;
}
