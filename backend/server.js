const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');
const { Server } = require('socket.io');
const QRCode = require('qrcode');
const { Client, LocalAuth } = require('whatsapp-web.js');

const PORT = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

let clientReady = false;
let statusText = 'Starting WhatsApp client...';
let qrDataUrl = '';
let chatsCache = [];
let activeClientInfo = null;
let currentState = 'UNKNOWN';
let loadingChats = false;

const client = new Client({
  authStrategy: new LocalAuth({
    clientId: 'wa-portal'
  }),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    protocolTimeout: 300000
  },
  authTimeoutMs: 60000,
  takeoverOnConflict: true,
  takeoverTimeoutMs: 0
});

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function emitStatus(text) {
  statusText = text;
  io.emit('wa-status', {
    ok: true,
    ready: clientReady,
    state: currentState,
    text: statusText
  });
}

function formatTime(timestamp) {
  if (!timestamp) return '';
  const ms = timestamp > 9999999999 ? timestamp : timestamp * 1000;
  return new Date(ms).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  });
}

function simplifyChat(chat) {
  return {
    id: chat.id?._serialized || chat.id || '',
    name:
      chat.name ||
      chat.contact?.pushname ||
      chat.contact?.name ||
      chat.id?.user ||
      'Unknown',
    lastMessage: chat.lastMessage?.body || '',
    unreadCount: chat.unreadCount || 0,
    isGroup: !!chat.isGroup,
    timestamp: chat.timestamp || null
  };
}

function simplifyMessage(message) {
  return {
    id: message.id?._serialized || message.id || String(Date.now()),
    chatId: message.fromMe ? message.to : message.from,
    fromMe: !!message.fromMe,
    body: message.body || '',
    time: formatTime(message.timestamp),
    type: message.type || 'chat'
  };
}

async function safeGetState() {
  try {
    currentState = await client.getState();
  } catch (error) {
    currentState = 'UNKNOWN';
  }
  return currentState;
}

async function loadChatsOnce() {
  if (!clientReady || loadingChats) return chatsCache;

  loadingChats = true;
  try {
    await safeGetState();

    if (currentState !== 'CONNECTED') {
      return chatsCache;
    }

    const chats = await client.getChats();
    chatsCache = chats.slice(0, 200).map(simplifyChat);
    io.emit('wa-chats', chatsCache);
    return chatsCache;
  } catch (error) {
    emitStatus(`Chat load error: ${error.message}`);
    return chatsCache;
  } finally {
    loadingChats = false;
  }
}

async function loadChatsWithRetry(retries = 6, waitMs = 5000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    const chats = await loadChatsOnce();

    if (chats && chats.length > 0) {
      return chats;
    }

    emitStatus(`Syncing chats... attempt ${attempt}/${retries}`);
    await delay(waitMs);
  }

  return chatsCache;
}

client.on('qr', async (qr) => {
  try {
    qrDataUrl = await QRCode.toDataURL(qr, {
      margin: 1,
      scale: 8
    });

    io.emit('wa-qr', {
      ok: true,
      qrDataUrl
    });

    clientReady = false;
    currentState = 'PAIRING';
    emitStatus('Scan the QR code in WhatsApp > Linked devices');
  } catch (error) {
    emitStatus(`QR generation failed: ${error.message}`);
  }
});

client.on('authenticated', () => {
  emitStatus('Authenticated. Loading chats...');
});

client.on('ready', async () => {
  clientReady = true;
  activeClientInfo = client.info || null;
  currentState = 'CONNECTED';
  emitStatus('Connected and ready');

  qrDataUrl = '';
  io.emit('wa-qr', {
    ok: true,
    qrDataUrl: ''
  });

  await delay(7000);
  await loadChatsWithRetry(8, 4000);
});

client.on('change_state', async (state) => {
  currentState = state;
  emitStatus(`State: ${state}`);

  if (state === 'CONNECTED' && clientReady) {
    await loadChatsWithRetry(4, 3000);
  }
});

client.on('auth_failure', (message) => {
  clientReady = false;
  currentState = 'UNPAIRED';
  emitStatus(`Authentication failed: ${message}`);
});

client.on('disconnected', (reason) => {
  clientReady = false;
  currentState = 'DISCONNECTED';
  chatsCache = [];
  activeClientInfo = null;
  emitStatus(`Disconnected: ${reason}`);
  io.emit('wa-chats', []);
});

client.on('message', async (message) => {
  io.emit('wa-message', simplifyMessage(message));
  if (clientReady) {
    loadChatsOnce().catch(() => {});
  }
});

io.on('connection', (socket) => {
  socket.emit('wa-status', {
    ok: true,
    ready: clientReady,
    state: currentState,
    text: statusText
  });

  if (qrDataUrl) {
    socket.emit('wa-qr', {
      ok: true,
      qrDataUrl
    });
  }

  if (chatsCache.length) {
    socket.emit('wa-chats', chatsCache);
  }
});

app.get('/api/health', async (req, res) => {
  await safeGetState();
  res.json({
    ok: true,
    ready: clientReady,
    state: currentState,
    statusText,
    info: activeClientInfo,
    chatsCount: chatsCache.length
  });
});

app.get('/api/qr', (req, res) => {
  res.json({
    ok: true,
    ready: clientReady,
    qrDataUrl,
    statusText
  });
});

app.get('/api/chats', async (req, res) => {
  try {
    if (!clientReady) {
      return res.json({ ok: true, chats: [], ready: false });
    }

    const chats = await loadChatsWithRetry(3, 2000);
    res.json({
      ok: true,
      ready: clientReady,
      chats
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: error.message
    });
  }
});

app.get('/api/messages/:chatId', async (req, res) => {
  try {
    if (!clientReady) {
      return res.status(503).json({
        ok: false,
        message: 'Client is not ready yet'
      });
    }

    const { chatId } = req.params;
    const chat = await client.getChatById(chatId);
    const messages = await chat.fetchMessages({ limit: 30 });

    res.json({
      ok: true,
      messages: messages.map(simplifyMessage).reverse()
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: error.message
    });
  }
});

app.post('/api/send', async (req, res) => {
  try {
    if (!clientReady) {
      return res.status(503).json({
        ok: false,
        message: 'Client is not ready yet'
      });
    }

    const { chatId, text } = req.body || {};
    const cleanText = String(text || '').trim();

    if (!chatId || !cleanText) {
      return res.status(400).json({
        ok: false,
        message: 'chatId and text are required'
      });
    }

    const sent = await client.sendMessage(chatId, cleanText);
    await loadChatsOnce().catch(() => {});

    res.json({
      ok: true,
      message: simplifyMessage(sent)
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: error.message
    });
  }
});

app.use((req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

client.initialize();

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});