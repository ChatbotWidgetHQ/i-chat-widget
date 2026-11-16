(function () {
    // 1. Find our script tag on the host page and grab the client ID
    const currentScript = document.currentScript || document.querySelector('script[data-client-id]');
    if (!currentScript) {
        console.error("Chat Widget Error: Missing script tag or data-client-id attribute.");
        return;
    }
    const CLIENT_ID = currentScript.getAttribute('data-client-id');
    const HEADER_TITLE = currentScript.getAttribute('data-title') || "Store Virtual Assistant";
    const WEBHOOK_URL = "https://a1b2u3derya.app.n8n.cloud/webhook/chat";
    const MAX_LENGTH = 2000;
    const SORRY_TEXT = "Sorry, I couldn't process that. Please try again.";

    // 2. Secure, persistent session ID for the visitor (hard to guess)
    function makeSessionId() {
        if (window.crypto && typeof window.crypto.randomUUID === "function") {
            return "s-" + window.crypto.randomUUID();
        }
        const bytes = new Uint8Array(16);
        window.crypto.getRandomValues(bytes);
        return "s-" + Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
    }
    let sessionId = localStorage.getItem("chatSessionId");
    if (!sessionId || !/^[A-Za-z0-9_-]{20,100}$/.test(sessionId)) {
        // Replaces old short IDs automatically
        sessionId = makeSessionId();
        localStorage.setItem("chatSessionId", sessionId);
    }

    // 3. Inject CSS styles into the host page head
    const style = document.createElement('style');
    style.innerHTML = `
        #store-ai-chat-wrapper {
            position: fixed;
            bottom: 20px;
            right: 20px;
            z-index: 999999;
            font-family: Arial, sans-serif;
        }
        #store-ai-chat-bubble {
            width: 60px;
            height: 60px;
            background: #4f46e5;
            border-radius: 50%;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            color: white;
            font-size: 24px;
            transition: transform 0.2s;
        }
        #store-ai-chat-bubble:hover {
            transform: scale(1.05);
        }
        #store-ai-chat-wrapper .ai-tooltip {
            position: absolute;
            right: 75px;
            bottom: 12px;
            background: white;
            color: #1f2937;
            padding: 8px 14px;
            border-radius: 20px;
            font-size: 13px;
            font-weight: 600;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            white-space: nowrap;
            pointer-events: none;
        }
        #store-ai-chat-container {
            display: none;
            width: 380px;
            height: 500px;
            background: white;
            border-radius: 12px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.2);
            flex-direction: column;
            overflow: hidden;
            position: absolute;
            bottom: 75px;
            right: 0;
            border: 1px solid #e5e7eb;
        }
        #store-ai-chat-container.open {
            display: flex;
        }
        #store-ai-chat-wrapper .chat-header { background: #4f46e5; color: white; padding: 16px; font-weight: bold; text-align: center; display: flex; justify-content: space-between; align-items: center; }
        #store-ai-chat-wrapper .chat-header button { background: none; border: none; color: white; font-size: 18px; cursor: pointer; }
        #store-ai-chat-wrapper .chat-messages { flex: 1; padding: 16px; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; background: #fafafa; }
        #store-ai-chat-wrapper .message { max-width: 80%; padding: 10px 14px; border-radius: 8px; font-size: 14px; line-height: 1.4; word-wrap: break-word; white-space: pre-wrap; }
        #store-ai-chat-wrapper .message.user { background: #4f46e5; color: white; align-self: flex-end; }
        #store-ai-chat-wrapper .message.assistant { background: #e5e7eb; color: #1f2937; align-self: flex-start; }

        #store-ai-chat-wrapper .message.typing { background: #e5e7eb; color: #4b5563; font-style: italic; display: flex; align-items: center; gap: 4px; }
        #store-ai-chat-wrapper .typing-dots span {
            height: 6px; width: 6px; float: left; margin: 0 1px;
            background-color: #9ca3af; border-radius: 50%; display: inline-block;
            animation: aiw-bounce 1.3s infinite ease-in-out;
        }
        #store-ai-chat-wrapper .typing-dots span:nth-child(2) { animation-delay: -1.1s; }
        #store-ai-chat-wrapper .typing-dots span:nth-child(3) { animation-delay: -0.9s; }
        @keyframes aiw-bounce {
            0%, 60%, 100% { transform: translateY(0); }
            30% { transform: translateY(-4px); }
        }

        #store-ai-chat-wrapper .chat-input-area { display: flex; padding: 12px; background: white; border-top: 1px solid #e5e7eb; }
        #store-ai-chat-wrapper .chat-input-area input { flex: 1; padding: 10px; border: 1px solid #d1d5db; border-radius: 6px; outline: none; font-size: 14px; }
        #store-ai-chat-wrapper .chat-input-area input:disabled { background: #f3f4f6; }
        #store-ai-chat-wrapper .chat-input-area button { background: #4f46e5; color: white; border: none; padding: 10px 16px; margin-left: 8px; border-radius: 6px; cursor: pointer; font-weight: bold; }
        #store-ai-chat-wrapper .chat-input-area button:hover { background: #4338ca; }
        #store-ai-chat-wrapper .chat-input-area button:disabled { background: #a5b4fc; cursor: not-allowed; }
    `;
    document.head.appendChild(style);

    // 4. Inject Widget HTML structure into the body
    const wrapper = document.createElement('div');
    wrapper.id = 'store-ai-chat-wrapper';
    wrapper.innerHTML = `
        <div class="ai-tooltip">Chat with AI assistant ✨</div>
        <div id="store-ai-chat-container">
            <div class="chat-header">
                <span id="aiw-title"></span>
                <button id="aiw-close" aria-label="Close chat">&times;</button>
            </div>
            <div id="aiw-messages" class="chat-messages">
                <div class="message assistant">Hello! How can I help you today?</div>
            </div>
            <div class="chat-input-area">
                <input type="text" id="aiw-input" placeholder="Type a message..." autocomplete="off" maxlength="${MAX_LENGTH}">
                <button id="aiw-send">Send</button>
            </div>
        </div>
        <div id="store-ai-chat-bubble">💬</div>
    `;
    document.body.appendChild(wrapper);

    // 5. Element references & Event Handlers
    const bubble = wrapper.querySelector("#store-ai-chat-bubble");
    const container = wrapper.querySelector("#store-ai-chat-container");
    const closeBtn = wrapper.querySelector("#aiw-close");
    const sendBtn = wrapper.querySelector("#aiw-send");
    const inputField = wrapper.querySelector("#aiw-input");
    const messagesDiv = wrapper.querySelector("#aiw-messages");
    wrapper.querySelector("#aiw-title").textContent = HEADER_TITLE;

    let isSending = false;

    bubble.addEventListener("click", () => {
        container.classList.toggle("open");
        if (container.classList.contains("open")) {
            inputField.focus();
        }
    });

    closeBtn.addEventListener("click", () => {
        container.classList.remove("open");
    });

    function setSending(state) {
        isSending = state;
        sendBtn.disabled = state;
        inputField.disabled = state;
        if (!state) inputField.focus();
    }

    async function sendMessage() {
        if (isSending) return;
        const messageText = inputField.value.trim().slice(0, MAX_LENGTH);
        if (!messageText) return;

        setSending(true);
        appendMessage(messageText, "user");
        inputField.value = "";

        const typingMsgId = appendTypingIndicator("Assistant is thinking...");
        const slowTimer = setTimeout(() => {
            updateTypingIndicator(typingMsgId, "This is taking a bit longer than usual, still working on it...");
        }, 6000);

        try {
            const response = await fetch(WEBHOOK_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    clientId: CLIENT_ID,
                    sessionId: sessionId,
                    message: messageText
                })
            });

            clearTimeout(slowTimer);
            removeMessage(typingMsgId);

            if (!response.ok) {
                throw new Error("Server error");
            }

            const data = await response.json();

            let botReply = SORRY_TEXT;
            if (typeof data === 'string' && data.trim()) {
                botReply = data;
            } else if (data && typeof data === 'object') {
                const candidate = data.output || data.response || data.content || data.message || data.error;
                if (typeof candidate === 'string' && candidate.trim()) {
                    botReply = candidate;
                }
            }

            appendMessage(botReply, "assistant");
        } catch (error) {
            clearTimeout(slowTimer);
            removeMessage(typingMsgId);
            console.error("Chat Widget Error:", error);
            appendMessage("Connection error. Please try again later.", "assistant");
        } finally {
            setSending(false);
        }
    }

    function appendMessage(text, sender) {
        const msgDiv = document.createElement("div");
        msgDiv.className = `message ${sender}`;
        msgDiv.textContent = text;
        messagesDiv.appendChild(msgDiv);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }

    function appendTypingIndicator(text) {
        const uniqueId = "aiw-msg-" + Date.now();
        const msgDiv = document.createElement("div");
        msgDiv.id = uniqueId;
        msgDiv.className = "message assistant typing";

        const textSpan = document.createElement("span");
        textSpan.id = uniqueId + "-text";
        textSpan.textContent = text;

        const dots = document.createElement("div");
        dots.className = "typing-dots";
        dots.innerHTML = "<span></span><span></span><span></span>";

        msgDiv.appendChild(textSpan);
        msgDiv.appendChild(dots);
        messagesDiv.appendChild(msgDiv);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
        return uniqueId;
    }

    function updateTypingIndicator(uniqueId, newText) {
        const textSpan = document.getElementById(uniqueId + "-text");
        if (textSpan) {
            textSpan.textContent = newText;
        }
    }

    function removeMessage(uniqueId) {
        const msgDiv = document.getElementById(uniqueId);
        if (msgDiv) {
            msgDiv.remove();
        }
    }

    sendBtn.addEventListener("click", sendMessage);
    inputField.addEventListener("keydown", function (event) {
        if (event.key === "Enter" && !event.isComposing) {
            event.preventDefault();
            sendMessage();
        }
    });
})();
