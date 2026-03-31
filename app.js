const socket = io();

const qrView = document.getElementById("qrView");
const chatView = document.getElementById("chatView");
const qrImage = document.getElementById("qrImage");
const qrPlaceholder = document.getElementById("qrPlaceholder");
const qrState = document.getElementById("qrState");
const connectionBadge = document.getElementById("connectionBadge");
const onlineStatus = document.getElementById("onlineStatus");
const chatList = document.getElementById("chatList");
const chatCount = document.getElementById("chatCount");
const searchInput = document.getElementById("searchInput");
const messageList = document.getElementById("messageList");
const composer = document.getElementById("composer");
const messageInput = document.getElementById("messageInput");
const activeChatName = document.getElementById("activeChatName");
const activeChatMeta = document.getElementById("activeChatMeta");
const chatAvatar = document.getElementById("chatAvatar");

let appState = {
    connectionStatus: "connecting",
    ready: false,
    chats: [],
    contacts: {},
    activeJid: null,
    messagesByJid: new Map()
};

function setBadge(text, kind = "default") {
    connectionBadge.textContent = text;
    qrState.textContent = text;
    onlineStatus.textContent = text;
    connectionBadge.className = `badge ${kind}`;
    qrState.className = `badge ${kind}`;
}

function normalizeJid(jid) {
    return String(jid || "").replace(/:.*@/g, "@");
}

function initials(name) {
    const parts = String(name || "")
        .replace(/[^a-z0-9 ]/gi, " ")
        .trim()
        .split(/\s+/)
        .filter(Boolean);

    if (!parts.length) return "WA";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
}

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
}

function formatPreview(text) {
    if (!text) return "No messages yet";
    return text.length > 68 ? `${text.slice(0, 68)}…` : text;
}

function renderChats() {
    const filter = searchInput.value.trim().toLowerCase();
    const chats = appState.chats.filter((chat) => {
        const name = (chat.name || chat.id).toLowerCase();
        const preview = (chat.lastMessage?.text || "").toLowerCase();
        return !filter || name.includes(filter) || preview.includes(filter);
    });

    chatCount.textContent = `${chats.length}`;
    chatList.innerHTML = "";

    if (!chats.length) {
        chatList.innerHTML = `<div class="no-chat">No chats found.</div>`;
        return;
    }

    for (const chat of chats) {
        const item = document.createElement("div");
        item.className = `chat-item ${appState.activeJid === chat.id ? "active" : ""}`;

        item.innerHTML = `
      <div class="avatar">${initials(chat.name || chat.id)}</div>
      <div>
        <p class="title">${escapeHtml(chat.name || chat.id)}</p>
        <p class="preview">${escapeHtml(formatPreview(chat.lastMessage?.text))}</p>
      </div>
      <div class="meta">
        <div>${escapeHtml(chat.lastMessage?.time || "")}</div>
        ${chat.unreadCount ? `<div class="unread">${chat.unreadCount}</div>` : ""}
      </div>
    `;

        item.addEventListener("click", () => openChat(chat.id));
        chatList.appendChild(item);
    }
}

function renderMessages(jid) {
    const messages = appState.messagesByJid.get(jid) || [];
    messageList.innerHTML = "";

    if (!messages.length) {
        messageList.innerHTML = `
      <div class="no-chat">
        <h3>No messages loaded yet</h3>
        <p>When this chat syncs, messages will appear here.</p>
      </div>
    `;
        return;
    }

    let lastDate = "";

    for (const msg of messages) {
        if (msg.date && msg.date !== lastDate) {
            lastDate = msg.date;
            const separator = document.createElement("div");
            separator.className = "no-chat";
            separator.style.padding = "6px 0";
            separator.style.fontSize = "0.82rem";
            separator.textContent = lastDate;
            messageList.appendChild(separator);
        }

        const row = document.createElement("div");
        row.className = `message-row ${msg.fromMe ? "me" : "them"}`;

        row.innerHTML = `
      <div class="bubble">
        <div>${escapeHtml(msg.text || `[${msg.type}]`)}</div>
        <div class="meta">${escapeHtml(msg.time || "")}</div>
      </div>
    `;

        messageList.appendChild(row);
    }

    messageList.scrollTop = messageList.scrollHeight;
}

function openChat(jid) {
    const cleanJid = normalizeJid(jid);
    appState.activeJid = cleanJid;

    const chat = appState.chats.find((c) => c.id === cleanJid);
    activeChatName.textContent = chat?.name || cleanJid;
    activeChatMeta.textContent = chat ? `${chat.unreadCount || 0} unread` : cleanJid;
    chatAvatar.textContent = initials(chat?.name || cleanJid);

    qrView.classList.add("hidden");
    chatView.classList.remove("hidden");

    renderChats();
    renderMessages(cleanJid);

    socket.emit("chat:open", { jid: cleanJid });
}

function syncMessages(jid, messages) {
    const cleanJid = normalizeJid(jid);
    appState.messagesByJid.set(cleanJid, messages || []);
    if (appState.activeJid === cleanJid) renderMessages(cleanJid);
}

function appendMessage(jid, message) {
    const cleanJid = normalizeJid(jid);
    const list = appState.messagesByJid.get(cleanJid) || [];
    list.push(message);
    appState.messagesByJid.set(cleanJid, list);

    const idx = appState.chats.findIndex((c) => c.id === cleanJid);
    const existing = appState.chats[idx];

    if (existing) {
        appState.chats[idx] = {
            ...existing,
            lastMessage: {
                text: message.text,
                fromMe: message.fromMe,
                time: message.time
            },
            timestamp: message.timestamp
        };
    } else {
        appState.chats.unshift({
            id: cleanJid,
            name: cleanJid.split("@")[0],
            unreadCount: 0,
            archived: false,
            timestamp: message.timestamp,
            lastMessage: {
                text: message.text,
                fromMe: message.fromMe,
                time: message.time
            }
        });
    }

    renderChats();
    if (appState.activeJid === cleanJid) renderMessages(cleanJid);
}

socket.on("connect", () => {
    setBadge("Connecting…");
    socket.emit("ui:request-state");
});

socket.on("wa:qr", ({ qr }) => {
    qrImage.src = qr;
    qrImage.style.display = "block";
    qrPlaceholder.style.display = "none";
    setBadge("Scan QR", "warning");
});

socket.on("wa:connected", () => {
    qrView.classList.add("hidden");
    chatView.classList.remove("hidden");
    setBadge("Connected", "success");
});

socket.on("wa:status", ({ status }) => {
    const s = String(status || "").toLowerCase();
    if (s.includes("scan")) setBadge("Scan QR", "warning");
    else if (s.includes("connected") || s.includes("open")) setBadge("Connected", "success");
    else if (s.includes("disconnect")) setBadge("Disconnected", "danger");
    else setBadge("Connecting…");
});

socket.on("wa:loggedout", ({ message }) => {
    setBadge("Logged out", "danger");
    alert(message || "You were logged out.");
});

socket.on("state:update", (state) => {
    appState.connectionStatus = state.connectionStatus;
    appState.ready = state.ready;
    appState.chats = state.chats || [];
    appState.contacts = state.contacts || {};
    renderChats();

    if (state.ready) {
        qrView.classList.add("hidden");
        chatView.classList.remove("hidden");
    }
});

socket.on("state:bootstrap", (state) => {
    appState.chats = state.chats || [];
    appState.contacts = state.contacts || {};
    renderChats();
});

socket.on("chat:messages", ({ jid, messages }) => {
    syncMessages(jid, messages);
});

socket.on("message:new", ({ jid, message }) => {
    appendMessage(jid, message);
});

socket.on("message:sent", ({ jid, message }) => {
    appendMessage(jid, message);
});

socket.on("chat:update", (chat) => {
    const jid = normalizeJid(chat.id);
    const idx = appState.chats.findIndex((c) => c.id === jid);
    if (idx >= 0) {
        appState.chats[idx] = {
            ...appState.chats[idx],
            ...chat
        };
    } else {
        appState.chats.unshift(chat);
    }
    renderChats();
});

searchInput.addEventListener("input", renderChats);

composer.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = messageInput.value.trim();
    if (!text || !appState.activeJid) return;

    socket.emit("message:send", {
        jid: appState.activeJid,
        text
    });

    messageInput.value = "";
    messageInput.focus();
});

setBadge("Connecting…");