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
        phaseTurns: 0,
        history: [],      // {role, content}
        timestamps: [],   // epoch ms for every message (user & assistant alternating)
        analysisResult: null,
        uploadedDocs: []  // filenames uploaded this session
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
    var docsBadge   = document.getElementById("docs-badge");
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

    // Upload refs
    var uploadZone  = document.getElementById("upload-zone");
    var fileInput   = document.getElementById("file-input");
    var uploadList  = document.getElementById("upload-list");
    var uploadStatus = document.getElementById("upload-status");

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
    function stripPhaseMarker(text) {
        // Remove "---\nPhase: ..." block from the end of assistant messages
        var idx = text.indexOf("\n---");
        if (idx === -1) idx = text.indexOf("---\nPhase");
        return idx >= 0 ? text.substring(0, idx).trim() : text;
    }

    function addMessage(role, content) {
        var div = document.createElement("div");
        div.className = "message " + role;
        div.textContent = role === "assistant" ? stripPhaseMarker(content) : content;
        messagesEl.insertBefore(div, typingEl);
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function setTyping(on) {
        typingEl.style.display = on ? "block" : "none";
        if (on) messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    /* ===== File Upload ===== */

    function formatFileSize(bytes) {
        if (bytes < 1024) return bytes + " o";
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " Ko";
        return (bytes / (1024 * 1024)).toFixed(1) + " Mo";
    }

    function renderUploadList() {
        uploadList.innerHTML = "";
        state.uploadedDocs.forEach(function (doc) {
            var item = document.createElement("div");
            item.className = "upload-item";

            var icon = doc.filename.toLowerCase().endsWith(".pdf") ? "PDF" :
                       doc.filename.toLowerCase().endsWith(".pptx") ? "PPT" :
                       doc.filename.toLowerCase().endsWith(".ppt") ? "PPT" : "TXT";

            item.innerHTML =
                '<span class="upload-item-icon">' + icon + '</span>' +
                '<span class="upload-item-name">' + doc.filename + '</span>' +
                '<span class="upload-item-chunks">' + doc.chunks + ' chunks</span>' +
                '<button class="upload-item-delete" data-filename="' + doc.filename + '">X</button>';
            uploadList.appendChild(item);
        });

        // Bind delete buttons
        uploadList.querySelectorAll(".upload-item-delete").forEach(function (btn) {
            btn.addEventListener("click", function () {
                deleteDoc(btn.dataset.filename);
            });
        });
    }

    function uploadFiles(fileList) {
        if (!fileList || fileList.length === 0) return;

        var formData = new FormData();
        for (var i = 0; i < fileList.length; i++) {
            formData.append("files", fileList[i]);
        }

        uploadStatus.textContent = "Upload en cours...";
        uploadStatus.className = "upload-status uploading";
        uploadZone.classList.add("uploading");

        fetch("/api/upload", {
            method: "POST",
            body: formData
        })
        .then(function (res) { return res.json(); })
        .then(function (data) {
            uploadZone.classList.remove("uploading");
            var ok = 0;
            var errors = [];

            (data.results || []).forEach(function (r) {
                if (r.status === "ok") {
                    ok++;
                    state.uploadedDocs.push({ filename: r.filename, chunks: r.chunks });
                } else {
                    errors.push(r.filename + ": " + (r.message || "erreur"));
                }
            });

            (data.skipped || []).forEach(function (s) {
                errors.push(s.filename + ": " + s.reason);
            });

            if (ok > 0 && errors.length === 0) {
                uploadStatus.textContent = ok + " fichier(s) ajoute(s) au corpus";
                uploadStatus.className = "upload-status success";
            } else if (ok > 0 && errors.length > 0) {
                uploadStatus.textContent = ok + " OK, " + errors.length + " erreur(s): " + errors.join("; ");
                uploadStatus.className = "upload-status warning";
            } else {
                uploadStatus.textContent = "Erreur: " + errors.join("; ");
                uploadStatus.className = "upload-status error";
            }

            renderUploadList();
        })
        .catch(function () {
            uploadZone.classList.remove("uploading");
            uploadStatus.textContent = "Erreur de connexion. Reessaye.";
            uploadStatus.className = "upload-status error";
        });
    }

    function deleteDoc(filename) {
        fetch("/api/documents/" + encodeURIComponent(filename), { method: "DELETE" })
        .then(function (res) { return res.json(); })
        .then(function () {
            state.uploadedDocs = state.uploadedDocs.filter(function (d) {
                return d.filename !== filename;
            });
            renderUploadList();
            uploadStatus.textContent = filename + " supprime";
            uploadStatus.className = "upload-status success";
        });
    }

    // Upload zone events
    uploadZone.addEventListener("click", function () {
        fileInput.click();
    });

    fileInput.addEventListener("change", function () {
        uploadFiles(fileInput.files);
        fileInput.value = "";
    });

    uploadZone.addEventListener("dragover", function (e) {
        e.preventDefault();
        uploadZone.classList.add("dragover");
    });

    uploadZone.addEventListener("dragleave", function () {
        uploadZone.classList.remove("dragover");
    });

    uploadZone.addEventListener("drop", function (e) {
        e.preventDefault();
        uploadZone.classList.remove("dragover");
        uploadFiles(e.dataTransfer.files);
    });

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
                phase_turns: state.phaseTurns,
                history: state.history.slice(0, -1)
            })
        })
        .then(function (res) {
            if (!res.ok) {
                return res.json().then(function (err) {
                    throw new Error(err.error || "Erreur serveur " + res.status);
                });
            }
            return res.json();
        })
        .then(function (data) {
            setTyping(false);
            if (!data.reply) {
                addMessage("assistant", "Reponse vide du serveur. Verifiez la configuration API.");
                btnSend.disabled = false;
                return;
            }
            state.phase = data.phase;
            state.phaseTurns = data.phase_turns || 0;
            state.history.push({ role: "assistant", content: data.reply });
            state.timestamps.push(Date.now());
            addMessage("assistant", data.reply);
            renderPhaseIndicator();
            btnSend.disabled = false;
            chatInput.focus();
        })
        .catch(function (err) {
            setTyping(false);
            console.error("sendMessage error:", err);
            addMessage("assistant", "Erreur: " + (err.message || "Connexion impossible. Veuillez reessayer."));
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
        state.phaseTurns = 0;
        state.history = [];
        state.timestamps = [];
        state.analysisResult = null;
        state.uploadedDocs = [];

        topicInput.value = "";
        chatInput.value = "";
        messagesEl.querySelectorAll(".message").forEach(function (el) { el.remove(); });
        uploadList.innerHTML = "";
        uploadStatus.textContent = "";

        modeBtns.forEach(function (btn) {
            btn.classList.toggle("selected", btn.dataset.mode === "TUTOR");
        });

        btnStart.disabled = true;
        btnEnd.disabled = false;
        btnSend.disabled = false;

        // Load existing documents
        loadDocumentList();

        showScreen(setupScreen);
    }

    /* ===== Load existing documents on page load ===== */
    function loadDocumentList() {
        fetch("/api/documents")
        .then(function (res) { return res.json(); })
        .then(function (data) {
            state.uploadedDocs = (data.documents || []).map(function (d) {
                return { filename: d.filename, chunks: "?" };
            });
            renderUploadList();
        })
        .catch(function () {});
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
        state.phase = 0;
        state.phaseTurns = 0;
        state.history = [];
        state.timestamps = [];
        modeBadge.textContent = state.mode === "TUTOR" ? "Tuteur" : "Critique";
        topicBadge.textContent = topic;

        // Show doc count badge
        if (state.uploadedDocs.length > 0) {
            docsBadge.textContent = state.uploadedDocs.length + " doc(s)";
            docsBadge.style.display = "inline-block";
        } else {
            docsBadge.style.display = "none";
        }

        renderPhaseIndicator();
        showScreen(chatScreen);
        chatInput.focus();

        // Auto-send first message to get the companion's opening question
        startSession();
    });

    function startSession() {
        setTyping(true);
        btnSend.disabled = true;

        fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                message: "Bonjour, je souhaite explorer le sujet : " + state.topic,
                mode: state.mode,
                topic: state.topic,
                phase: state.phase,
                phase_turns: state.phaseTurns,
                history: []
            })
        })
        .then(function (res) {
            if (!res.ok) {
                return res.json().then(function (err) {
                    throw new Error(err.error || "Erreur serveur " + res.status);
                });
            }
            return res.json();
        })
        .then(function (data) {
            setTyping(false);
            if (!data.reply) {
                addMessage("assistant", "Reponse vide du serveur. Verifiez la configuration API.");
                btnSend.disabled = false;
                return;
            }
            state.phase = data.phase;
            state.phaseTurns = data.phase_turns || 0;
            state.history.push({ role: "assistant", content: data.reply });
            state.timestamps.push(Date.now());
            addMessage("assistant", data.reply);
            renderPhaseIndicator();
            btnSend.disabled = false;
            chatInput.focus();
        })
        .catch(function (err) {
            setTyping(false);
            console.error("startSession error:", err);
            addMessage("assistant", "Erreur: " + (err.message || "Connexion impossible. Veuillez reessayer."));
            btnSend.disabled = false;
        });
    }

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

    // Load existing docs on startup
    loadDocumentList();

})();
