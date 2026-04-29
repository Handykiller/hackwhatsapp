/*const API_BASE = 'http://localhost:3000';
const socket = io(API_BASE);

const statusText = document.getElementById('statusText');
const connectionPill = document.getElementById('connectionPill');
const qrImage = document.getElementById('qrImage');
const qrPlaceholder = document.getElementById('qrPlaceholder');
const qrHelp = document.getElementById('qrHelp');
const refreshQrBtn = document.getElementById('refreshQrBtn');

const chatSearch = document.getElementById('chatSearch');
const chatList = document.getElementById('chatList');
const chatTitle = document.getElementById('chatTitle');
const chatMeta = document.getElementById('chatMeta');
const messageArea = document.getElementById('messageArea');
const messageForm = document.getElementById('messageForm');
const messageInput = document.getElementById('messageInput');

let allChats = [];
let activeChat = null;
let lastReadyState = false;

function setStatus(text, ready) {
  statusText.textContent = text;
  connectionPill.textContent = ready ? 'Online' : 'Offline';
  connectionPill.style.background = ready
    ? 'rgba(37, 211, 102, 0.12)'
    : 'rgba(255,255,255,0.08)';
  connectionPill.style.color = ready ? '#7dffb2' : '#e9edef';

  if (ready) {
    qrImage.style.display = 'none';
    qrPlaceholder.style.display = 'grid';
    qrPlaceholder.textContent = 'Logged in';
    qrHelp.textContent = 'Account connected successfully';
  }
}

function initials(name) {
  const value = String(name || 'Chat').trim();
  const parts = value.split(' ').filter(Boolean);
  if (parts.length === 0) return 'C';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function renderChats() {
  const query = chatSearch.value.trim().toLowerCase();

  const filtered = allChats.filter((chat) => {
    const haystack = `${chat.name} ${chat.lastMessage}`.toLowerCase();
    return haystack.includes(query);
  });

  chatList.innerHTML = '';

  if (!filtered.length) {
    chatList.innerHTML = lastReadyState
      ? '<div class="muted">Chats are still syncing. Wait a few seconds and refresh.</div>'
      : '<div class="muted">No chats found.</div>';
    return;
  }

  filtered.forEach((chat) => {
    const item = document.createElement('div');
    item.className = `chat-item ${activeChat?.id === chat.id ? 'active' : ''}`;

    item.innerHTML = `
      <div class="avatar">${initials(chat.name)}</div>
      <div class="chat-info">
        <strong>${escapeHtml(chat.name)}</strong>
        <p>${escapeHtml(chat.lastMessage || 'No messages yet')}</p>
      </div>
      ${chat.unreadCount ? `<div class="badge">${chat.unreadCount}</div>` : ''}
    `;

    item.addEventListener('click', () => selectChat(chat));
    chatList.appendChild(item);
  });
}

function renderMessages(messages) {
  messageArea.innerHTML = '';

  if (!messages || !messages.length) {
    messageArea.innerHTML = '<div class="empty-state">No messages in this chat.</div>';
    return;
  }

  messages.forEach((msg) => {
    const div = document.createElement('div');
    div.className = `msg ${msg.fromMe ? 'me' : 'other'}`;
    div.innerHTML = `
      <div>${escapeHtml(msg.body || '')}</div>
      <span class="time">${msg.time || ''}</span>
    `;
    messageArea.appendChild(div);
  });

  messageArea.scrollTop = messageArea.scrollHeight;
}

async function loadChats() {
  try {
    const res = await fetch(`${API_BASE}/api/chats`);
    const data = await res.json();

    if (data.ok) {
      lastReadyState = !!data.ready;
      allChats = data.chats || [];
      renderChats();

      if (lastReadyState && allChats.length === 0) {
        setStatus('Connected. Waiting for chat sync...', true);
      }
    }
  } catch (error) {
    chatList.innerHTML = '<div class="muted">Failed to load chats.</div>';
  }
}

async function loadMessages(chatId) {
  try {
    const res = await fetch(`${API_BASE}/api/messages/${encodeURIComponent(chatId)}`);
    const data = await res.json();

    if (data.ok) {
      renderMessages(data.messages || []);
    } else {
      messageArea.innerHTML = '<div class="empty-state">Could not load messages.</div>';
    }
  } catch (error) {
    messageArea.innerHTML = '<div class="empty-state">Could not load messages.</div>';
  }
}

async function selectChat(chat) {
  activeChat = chat;
  chatTitle.textContent = chat.name;
  chatMeta.textContent = chat.isGroup ? 'Group chat' : 'Private chat';
  messageInput.placeholder = `Message ${chat.name}`;
  await loadMessages(chat.id);
  renderChats();
}

messageForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!activeChat) {
    alert('Select a chat first.');
    return;
  }

  const text = messageInput.value.trim();
  if (!text) return;

  try {
    const res = await fetch(`${API_BASE}/api/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatId: activeChat.id,
        text
      })
    });

    const data = await res.json();

    if (data.ok) {
      messageInput.value = '';
      await loadMessages(activeChat.id);
      await loadChats();
    } else {
      alert(data.message || 'Message failed.');
    }
  } catch (error) {
    alert('Message failed.');
  }
});

chatSearch.addEventListener('input', renderChats);

refreshQrBtn.addEventListener('click', async () => {
  try {
    const res = await fetch(`${API_BASE}/api/qr`);
    const data = await res.json();

    if (data.qrDataUrl) {
      qrImage.src = data.qrDataUrl;
      qrImage.style.display = 'block';
      qrPlaceholder.style.display = 'none';
      qrHelp.textContent = 'Scan this QR in WhatsApp > Linked devices';
    }
  } catch (error) {}
});

socket.on('wa-status', (data) => {
  lastReadyState = !!data.ready;
  setStatus(data.text || 'Connected', !!data.ready);

  if (data.ready) {
    loadChats();
  }
});

socket.on('wa-qr', (data) => {
  if (data?.qrDataUrl) {
    qrImage.src = data.qrDataUrl;
    qrImage.style.display = 'block';
    qrPlaceholder.style.display = 'none';
    qrHelp.textContent = 'Scan this QR in WhatsApp > Linked devices';
  } else {
    qrImage.style.display = 'none';
    qrPlaceholder.style.display = 'grid';
  }
});

socket.on('wa-chats', (chats) => {
  allChats = chats || [];
  renderChats();
});

socket.on('wa-message', async (message) => {
  if (activeChat && message.chatId === activeChat.id) {
    await loadMessages(activeChat.id);
  }
  await loadChats();
});

window.addEventListener('DOMContentLoaded', async () => {
  setStatus('Connecting...', false);
  qrImage.style.display = 'none';
  qrPlaceholder.style.display = 'grid';
  qrPlaceholder.textContent = 'Waiting for QR...';

  await loadChats();
  setInterval(loadChats, 5000);

  try {
    const res = await fetch(`${API_BASE}/api/qr`);
    const data = await res.json();
    if (data.qrDataUrl) {
      qrImage.src = data.qrDataUrl;
      qrImage.style.display = 'block';
      qrPlaceholder.style.display = 'none';
    }
  } catch (error) {}
});
*/


const API_BASE = 'http://localhost:3000';
const socket = io(API_BASE);

const statusText = document.getElementById('statusText');
const connectionDot = document.getElementById('connectionDot');
const unreadBadge = document.getElementById('unreadBadge');

const qrPanel = document.getElementById('qrPanel');
const qrImage = document.getElementById('qrImage');
const qrPlaceholder = document.getElementById('qrPlaceholder');
const qrHelp = document.getElementById('qrHelp');
const refreshQrBtn = document.getElementById('refreshQrBtn');
const manualRefreshBtn = document.getElementById('manualRefreshBtn');

const chatSearch = document.getElementById('chatSearch');
const chatList = document.getElementById('chatList');

const listView = document.getElementById('listView');
const chatView = document.getElementById('chatView');
const backBtn = document.getElementById('backBtn');

const chatAvatar = document.getElementById('chatAvatar');
const chatTitle = document.getElementById('chatTitle');
const chatMeta = document.getElementById('chatMeta');
const messageArea = document.getElementById('messageArea');

const messageForm = document.getElementById('messageForm');
const messageInput = document.getElementById('messageInput');

let allChats = [];
let activeChat = null;
let isReady = false;
let chatPollTimer = null;
let qrPollTimer = null;

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text ?? '';
  return div.innerHTML;
}

function initials(name) {
  const value = String(name || 'Chat').trim();
  const parts = value.split(' ').filter(Boolean);
  if (!parts.length) return 'W';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function setConnection(ready, text) {
  isReady = !!ready;
  statusText.textContent = text || (ready ? 'Connected and ready' : 'Connecting...');
  connectionDot.className = `dot ${ready ? 'online' : 'offline'}`;

  if (ready) {
    qrPanel.classList.add('hidden-panel');
    qrImage.style.display = 'none';
    qrPlaceholder.style.display = 'grid';
    qrPlaceholder.textContent = 'Logged in';
    qrHelp.textContent = 'Account connected successfully';
  } else {
    qrPanel.classList.remove('hidden-panel');
  }
}

function setView(view) {
  if (view === 'chat') {
    listView.classList.add('hidden');
    chatView.classList.add('show');
  } else {
    chatView.classList.remove('show');
    listView.classList.remove('hidden');
  }
}

function renderChats() {
  const query = chatSearch.value.trim().toLowerCase();

  const filtered = allChats.filter((chat) => {
    const hay = `${chat.name} ${chat.lastMessage}`.toLowerCase();
    return hay.includes(query);
  });

  unreadBadge.textContent = String(
    filtered.reduce((sum, chat) => sum + (chat.unreadCount || 0), 0)
  );

  chatList.innerHTML = '';

  if (!filtered.length) {
    chatList.innerHTML = isReady
      ? '<div class="empty-state">Chats are still syncing. Please wait a moment.</div>'
      : '<div class="empty-state">No chats found.</div>';
    return;
  }

  filtered.forEach((chat) => {
    const item = document.createElement('div');
    item.className = `chat-item ${activeChat?.id === chat.id ? 'active' : ''}`;

    item.innerHTML = `
      <div class="avatar">${escapeHtml(initials(chat.name))}</div>
      <div class="chat-info">
        <div class="chat-name-row">
          <div class="chat-name">${escapeHtml(chat.name)}</div>
          <div class="chat-time">${escapeHtml(String(chat.timestamp || '').slice(0, 5))}</div>
        </div>
        <div class="chat-preview">${escapeHtml(chat.lastMessage || 'No messages yet')}</div>
      </div>
      ${chat.unreadCount ? `<div class="unread">${chat.unreadCount > 99 ? '99+' : chat.unreadCount}</div>` : ''}
    `;

    item.addEventListener('click', () => selectChat(chat));
    chatList.appendChild(item);
  });
}

function renderMessages(messages) {
  messageArea.innerHTML = '';

  if (!messages || !messages.length) {
    messageArea.innerHTML = '<div class="empty-state">No messages in this chat.</div>';
    return;
  }

  messages.forEach((msg) => {
    const bubble = document.createElement('div');
    bubble.className = `msg ${msg.fromMe ? 'me' : 'other'}`;
    bubble.innerHTML = `
      <div>${escapeHtml(msg.body || '')}</div>
      <span class="time">${escapeHtml(msg.time || '')}</span>
    `;
    messageArea.appendChild(bubble);
  });

  messageArea.scrollTop = messageArea.scrollHeight;
}

async function loadChats(silent = false) {
  try {
    if (!silent) {
      chatList.innerHTML = isReady
        ? '<div class="empty-state">Syncing chats...</div>'
        : '<div class="empty-state">Connecting to your account...</div>';
    }

    const res = await fetch(`${API_BASE}/api/chats`);
    const data = await res.json();

    if (data.ok) {
      isReady = !!data.ready;
      allChats = Array.isArray(data.chats) ? data.chats : [];
      renderChats();
    }
  } catch (error) {
    if (!silent) {
      chatList.innerHTML = '<div class="empty-state">Failed to load chats.</div>';
    }
  }
}

async function loadMessages(chatId) {
  try {
    messageArea.innerHTML = '<div class="empty-state">Loading messages...</div>';

    const res = await fetch(`${API_BASE}/api/messages/${encodeURIComponent(chatId)}`);
    const data = await res.json();

    if (data.ok) {
      renderMessages(data.messages || []);
    } else {
      messageArea.innerHTML = `<div class="empty-state">${escapeHtml(data.message || 'Could not load messages.')}</div>`;
    }
  } catch (error) {
    messageArea.innerHTML = '<div class="empty-state">Could not load messages.</div>';
  }
}

async function selectChat(chat) {
  activeChat = chat;
  chatAvatar.textContent = initials(chat.name);
  chatTitle.textContent = chat.name;
  chatMeta.textContent = chat.isGroup ? 'Group chat' : 'Private chat';
  messageInput.placeholder = `Message ${chat.name}`;
  setView('chat');
  await loadMessages(chat.id);
  renderChats();
}

function startChatPolling() {
  if (chatPollTimer) clearInterval(chatPollTimer);
  chatPollTimer = setInterval(() => {
    if (isReady) loadChats(true);
  }, 3000);
}

function startQrPolling() {
  if (qrPollTimer) clearInterval(qrPollTimer);
  qrPollTimer = setInterval(async () => {
    if (isReady) return;

    try {
      const res = await fetch(`${API_BASE}/api/qr`);
      const data = await res.json();

      if (data.qrDataUrl) {
        qrImage.src = data.qrDataUrl;
        qrImage.style.display = 'block';
        qrPlaceholder.style.display = 'none';
        qrHelp.textContent = 'Scan this QR in WhatsApp → Linked devices';
        qrPanel.classList.remove('hidden-panel');
      }
    } catch (error) {}
  }, 4000);
}

messageForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!activeChat) return;

  const text = messageInput.value.trim();
  if (!text) return;

  try {
    const res = await fetch(`${API_BASE}/api/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chatId: activeChat.id,
        text
      })
    });

    const data = await res.json();

    if (data.ok) {
      messageInput.value = '';
      await loadMessages(activeChat.id);
      await loadChats(true);
    } else {
      alert(data.message || 'Message failed.');
    }
  } catch (error) {
    alert('Message failed.');
  }
});

chatSearch.addEventListener('input', renderChats);

refreshQrBtn.addEventListener('click', async () => {
  if (isReady) return;

  try {
    const res = await fetch(`${API_BASE}/api/qr`);
    const data = await res.json();
    if (data.qrDataUrl) {
      qrImage.src = data.qrDataUrl;
      qrImage.style.display = 'block';
      qrPlaceholder.style.display = 'none';
      qrPanel.classList.remove('hidden-panel');
    }
  } catch (error) {}
});

manualRefreshBtn.addEventListener('click', () => loadChats(false));

backBtn.addEventListener('click', () => {
  activeChat = null;
  setView('list');
});

socket.on('wa-status', (data) => {
  setConnection(!!data.ready, data.text || 'Connecting...');

  if (data.ready) {
    startChatPolling();
    loadChats(true);
  } else {
    startQrPolling();
  }
});

socket.on('wa-qr', (data) => {
  if (isReady) return;

  if (data?.qrDataUrl) {
    qrImage.src = data.qrDataUrl;
    qrImage.style.display = 'block';
    qrPlaceholder.style.display = 'none';
    qrPanel.classList.remove('hidden-panel');
  } else {
    qrImage.style.display = 'none';
    qrPlaceholder.style.display = 'grid';
    qrPlaceholder.textContent = 'Waiting for QR...';
  }
});

socket.on('wa-chats', (chats) => {
  if (Array.isArray(chats)) {
    allChats = chats;
    renderChats();
  }
});

socket.on('wa-message', async (message) => {
  if (activeChat && message.chatId === activeChat.id) {
    await loadMessages(activeChat.id);
  }
  await loadChats(true);
});

window.addEventListener('DOMContentLoaded', async () => {
  setView('list');
  setConnection(false, 'Connecting...');
  qrPlaceholder.style.display = 'grid';
  qrImage.style.display = 'none';

  await loadChats(false);
  startQrPolling();

  setInterval(() => {
    if (isReady) loadChats(true);
  }, 5000);
});
