/**
 * AIM Learning Companion - Frontend
 * Stateless: no localStorage, no cookies, no persistence.
 */

(function () {
    "use strict";

    /* ===== State (in-memory only, lost on tab close) ===== */
    var state = {
        mode: "TUTOR",
        topic: "",
        phase: 0,
        history: [],      // {role, content}
        timestamps: [],   // epoch ms for every message (user & assistant alternating)
        analysisResult: null
    };

    var PHASE_NAMES = [
        "Ciblage",
        "Clarification",
        "Mecanisme",
        "Verification",
        "Stress-test"
    ];

    /* ===== DOM refs ===== */
    var setupScreen   = document.getElementById("setup-screen");
    var chatScreen    = document.getElementById("chat-screen");
    var analysisScreen = document.getElementById("analysis-screen");

    var topicInput  = document.getElementById("topic-input");
    var btnStart    = document.getElementById("btn-start");
    var modeBtns    = document.querySelectorAll(".mode-btn");

    var modeBadge   = document.getElementById("mode-badge");
    var topicBadge  = document.getElementById("topic-badge");
    var phaseDots   = document.getElementById("phase-dots");
    var phaseLabels = document.getElementById("phase-labels");
    var messagesEl  = document.getElementById("messages");
    var typingEl    = document.getElementById("typing");
    var chatInput   = document.getElementById("chat-input");
    var btnSend     = document.getElementById("btn-send");
    var btnEnd      = document.getElementById("btn-end-session");
    var btnReset    = document.getElementById("btn-reset");

    var scoresGrid  = document.getElementById("scores-grid");
    var summaryEl   = document.getElementById("analysis-summary");
    var strengthsEl = document.getElementById("analysis-strengths");
    var weaknessesEl = document.getElementById("analysis-weaknesses");
    var rhythmCount = document.getElementById("rhythm-count");
    var btnExport   = document.getElementById("btn-export");
    var btnNewSession = document.getElementById("btn-new-session");

    /* ===== Screen navigation ===== */
    function showScreen(screen) {
        setupScreen.classList.remove("active");
        chatScreen.classList.remove("active");
        analysisScreen.classList.remove("active");
        screen.classList.add("active");
    }

    /* ===== Phase indicator ===== */
    function renderPhaseIndicator() {
        phaseDots.innerHTML = "";
        phaseLabels.innerHTML = "";

        for (var i = 0; i < 5; i++) {
            if (i > 0) {
                var conn = document.createElement("div");
                conn.className = "phase-connector" + (i <= state.phase ? " done" : "");
                phaseDots.appendChild(conn);
            }
            var dot = document.createElement("div");
            dot.className = "phase-dot";
            if (i === state.phase) dot.className += " active";
            else if (i < state.phase) dot.className += " done";
            dot.textContent = i;
            phaseDots.appendChild(dot);

            var lbl = document.createElement("div");
            lbl.className = "phase-label-text" + (i === state.phase ? " active" : "");
            lbl.textContent = PHASE_NAMES[i];
            phaseLabels.appendChild(lbl);
        }
    }

    /* ===== Messages ===== */
    function addMessage(role, content) {
        var div = document.createElement("div");
        div.className = "message " + role;
        div.textContent = content;
        messagesEl.insertBefore(div, typingEl);
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function setTyping(on) {
        typingEl.style.display = on ? "block" : "none";
        if (on) messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    /* ===== API calls ===== */
    function sendMessage(text) {
        state.history.push({ role: "user", content: text });
        state.timestamps.push(Date.now());
        addMessage("user", text);

        chatInput.value = "";
        btnSend.disabled = true;
        setTyping(true);

        fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                message: text,
                mode: state.mode,
                topic: state.topic,
                phase: state.phase,
                history: state.history.slice(0, -1) // send history before this message
            })
        })
        .then(function (res) { return res.json(); })
        .then(function (data) {
            setTyping(false);
            state.phase = data.phase;
            state.history.push({ role: "assistant", content: data.reply });
            state.timestamps.push(Date.now());
            addMessage("assistant", data.reply);
            renderPhaseIndicator();
            btnSend.disabled = false;
            chatInput.focus();
        })
        .catch(function (err) {
            setTyping(false);
            addMessage("assistant", "Erreur de connexion. Veuillez reessayer.");
            btnSend.disabled = false;
        });
    }

    function requestAnalysis() {
        btnEnd.disabled = true;
        setTyping(true);

        fetch("/api/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                history: state.history,
                timestamps: state.timestamps
            })
        })
        .then(function (res) { return res.json(); })
        .then(function (data) {
            setTyping(false);
            state.analysisResult = data;
            renderAnalysis(data);
            showScreen(analysisScreen);
        })
        .catch(function () {
            setTyping(false);
            btnEnd.disabled = false;
            alert("Erreur lors de l'analyse. Veuillez reessayer.");
        });
    }

    /* ===== Analysis rendering ===== */
    function renderAnalysis(data) {
        var scores = [
            { key: "reasoningScore", label: "Raisonnement" },
            { key: "clarityScore", label: "Clarte" },
            { key: "skepticismScore", label: "Scepticisme" },
            { key: "processScore", label: "Processus" },
            { key: "reflectionScore", label: "Reflexion" },
            { key: "integrityScore", label: "Integrite" }
        ];

        scoresGrid.innerHTML = "";
        scores.forEach(function (s) {
            var val = data[s.key] || 0;
            var card = document.createElement("div");
            card.className = "score-card";
            card.innerHTML =
                '<div class="score-value">' + val + '</div>' +
                '<div class="score-label">' + s.label + '</div>' +
                '<div class="score-bar"><div class="score-bar-fill" style="width:' + val + '%"></div></div>';
            scoresGrid.appendChild(card);
        });

        summaryEl.textContent = data.summary || "Aucun bilan disponible.";

        strengthsEl.innerHTML = "";
        (data.keyStrengths || []).forEach(function (s) {
            var li = document.createElement("li");
            li.textContent = s;
            strengthsEl.appendChild(li);
        });

        weaknessesEl.innerHTML = "";
        (data.weaknesses || []).forEach(function (w) {
            var li = document.createElement("li");
            li.textContent = w;
            weaknessesEl.appendChild(li);
        });

        rhythmCount.textContent = data.rhythmBreakCount || 0;
    }

    /* ===== JSON export ===== */
    function exportJSON() {
        var payload = {
            mode: state.mode,
            topic: state.topic,
            messages: state.history,
            timestamps: state.timestamps,
            scores: state.analysisResult
        };
        var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = "aim-session-" + new Date().toISOString().slice(0, 10) + ".json";
        a.click();
        URL.revokeObjectURL(url);
    }

    /* ===== Reset ===== */
    function resetSession() {
        state.mode = "TUTOR";
        state.topic = "";
        state.phase = 0;
        state.history = [];
        state.timestamps = [];
        state.analysisResult = null;

        topicInput.value = "";
        chatInput.value = "";
        messagesEl.querySelectorAll(".message").forEach(function (el) { el.remove(); });

        modeBtns.forEach(function (btn) {
            btn.classList.toggle("selected", btn.dataset.mode === "TUTOR");
        });

        btnStart.disabled = true;
        btnEnd.disabled = false;
        btnSend.disabled = false;

        showScreen(setupScreen);
    }

    /* ===== Event listeners ===== */

    // Mode selection
    modeBtns.forEach(function (btn) {
        btn.addEventListener("click", function () {
            modeBtns.forEach(function (b) { b.classList.remove("selected"); });
            btn.classList.add("selected");
            state.mode = btn.dataset.mode;
        });
    });

    // Topic input enables start button
    topicInput.addEventListener("input", function () {
        btnStart.disabled = !topicInput.value.trim();
    });

    // Start session
    btnStart.addEventListener("click", function () {
        var topic = topicInput.value.trim();
        if (!topic) return;

        state.topic = topic;
        modeBadge.textContent = state.mode === "TUTOR" ? "Tuteur" : "Critique";
        topicBadge.textContent = topic;

        renderPhaseIndicator();
        showScreen(chatScreen);
        chatInput.focus();
    });

    // Send message
    btnSend.addEventListener("click", function () {
        var text = chatInput.value.trim();
        if (text) sendMessage(text);
    });

    chatInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
            var text = chatInput.value.trim();
            if (text) sendMessage(text);
        }
    });

    // End session -> analysis
    btnEnd.addEventListener("click", function () {
        if (state.history.length === 0) {
            alert("Aucun echange a analyser.");
            return;
        }
        requestAnalysis();
    });

    // Reset
    btnReset.addEventListener("click", resetSession);

    // Export JSON
    btnExport.addEventListener("click", exportJSON);

    // New session from analysis screen
    btnNewSession.addEventListener("click", resetSession);

})();
