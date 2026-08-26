import { io } from 'socket.io-client';

// Real chat, real backend — deliberately not the same live chat shown in
// the reference design (that had scripted messages from named people;
// faking other visitors' activity would mean showing fabricated
// engagement as if it were real). Every message here comes from an
// actual connected visitor. No login, no required name: the server
// assigns a friendly guest name per connection.
const CHAT_WS_URL = 'https://naija-digest-chat-api.azurewebsites.net';

interface ChatMessage {
  id: string;
  name: string;
  text: string;
  at: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function mountChat(root: HTMLElement) {
  root.innerHTML = `
    <div class="rail-card chat-card">
      <div class="chat-header">
        <span class="chat-live-dot"></span>
        <span class="chat-title">Live Chat</span>
        <span class="chat-presence" id="chat-presence">connecting…</span>
      </div>
      <div class="chat-messages" id="chat-messages" role="log" aria-live="polite"></div>
      <div class="chat-status" id="chat-status"></div>
      <form class="chat-form" id="chat-form">
        <input id="chat-input" type="text" maxlength="300" placeholder="Say something…" aria-label="Chat message" autocomplete="off" />
        <button type="submit" aria-label="Send">➤</button>
      </form>
    </div>`;

  const messagesEl = root.querySelector<HTMLDivElement>('#chat-messages')!;
  const presenceEl = root.querySelector<HTMLSpanElement>('#chat-presence')!;
  const statusEl = root.querySelector<HTMLDivElement>('#chat-status')!;
  const formEl = root.querySelector<HTMLFormElement>('#chat-form')!;
  const inputEl = root.querySelector<HTMLInputElement>('#chat-input')!;

  function appendMessage(msg: ChatMessage) {
    const atBottom = messagesEl.scrollTop + messagesEl.clientHeight >= messagesEl.scrollHeight - 20;
    const div = document.createElement('div');
    div.className = 'chat-message';
    div.innerHTML = `<span class="chat-name">${escapeHtml(msg.name)}</span> <span class="chat-text">${escapeHtml(msg.text)}</span>`;
    messagesEl.appendChild(div);
    if (atBottom) messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function showStatus(text: string) {
    statusEl.textContent = text;
    if (text) setTimeout(() => { if (statusEl.textContent === text) statusEl.textContent = ''; }, 3000);
  }

  const socket = io(CHAT_WS_URL, { transports: ['websocket'], reconnectionDelay: 1000 });

  socket.on('connect', () => {
    presenceEl.textContent = '';
  });

  socket.on('welcome', (data: { name: string; history: ChatMessage[] }) => {
    messagesEl.innerHTML = '';
    data.history.forEach(appendMessage);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  });

  socket.on('presence', (data: { count: number }) => {
    presenceEl.textContent = data.count === 1 ? '1 online' : `${data.count} online`;
  });

  socket.on('message', (msg: ChatMessage) => appendMessage(msg));

  socket.on('rejected', (data: { reason: string }) => showStatus(data.reason));

  socket.on('connect_error', () => {
    presenceEl.textContent = 'offline';
  });
  socket.on('disconnect', () => {
    presenceEl.textContent = 'reconnecting…';
  });

  formEl.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = inputEl.value.trim();
    if (!text) return;
    socket.emit('message', text);
    inputEl.value = '';
  });
}
