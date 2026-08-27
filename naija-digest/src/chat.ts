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

interface MountChatOptions {
  // Which chat room to join. The news digest omits this (defaults to
  // 'news' on the server); the Student Tools page passes 'students' so the
  // two conversations stay separate.
  channel?: string;
  // Heading shown in the chat card. Defaults to "Live Chat".
  title?: string;
}

// A moderator opens the page with ?mod=1 to reveal the pinned-topic
// controls in the chat card — no public "moderate" button. They still need
// the CHAT_MOD_SECRET; the server rejects anything else.
const IS_MOD_ENTRY = new URLSearchParams(location.search).get('mod') === '1';

export function mountChat(root: HTMLElement, options: MountChatOptions = {}) {
  const { channel, title = 'Live Chat' } = options;
  root.innerHTML = `
    <div class="rail-card chat-card">
      <div class="chat-header">
        <span class="chat-live-dot"></span>
        <span class="chat-title">${escapeHtml(title)}</span>
        <span class="chat-presence" id="chat-presence">connecting…</span>
      </div>
      <div class="chat-topic" id="chat-topic" hidden></div>
      ${IS_MOD_ENTRY ? '<div class="chat-mod" id="chat-mod"></div>' : ''}
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
  const topicEl = root.querySelector<HTMLDivElement>('#chat-topic')!;
  const modEl = root.querySelector<HTMLDivElement>('#chat-mod');

  let currentTopic = '';
  function renderTopic(text: string) {
    currentTopic = text || '';
    if (currentTopic) {
      topicEl.innerHTML = `<strong>📌 Topic:</strong> ${escapeHtml(currentTopic)}`;
      topicEl.hidden = false;
    } else {
      topicEl.textContent = '';
      topicEl.hidden = true;
    }
  }

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

  const socket = io(CHAT_WS_URL, {
    transports: ['websocket'],
    reconnectionDelay: 1000,
    // Read server-side from socket.handshake.auth.channel. Omitted by the
    // news page → server falls back to its default room.
    auth: channel ? { channel } : {},
  });

  socket.on('connect', () => {
    presenceEl.textContent = '';
  });

  socket.on('welcome', (data: { name: string; history: ChatMessage[]; topic?: string }) => {
    messagesEl.innerHTML = '';
    data.history.forEach(appendMessage);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    renderTopic(data.topic ?? '');
  });

  socket.on('topic', (data: { text?: string }) => renderTopic(data?.text ?? ''));

  socket.on('presence', (data: { count: number }) => {
    presenceEl.textContent = data.count === 1 ? '1 online' : `${data.count} online`;
  });

  socket.on('message', (msg: ChatMessage) => appendMessage(msg));

  socket.on('rejected', (data: { reason: string }) => showStatus(data.reason));

  // --- Moderator controls (only rendered under ?mod=1) ---
  // modSecret is only set once the SERVER has confirmed it (mod:auth), so
  // "unlock" that shows the topic form means the key is genuinely right —
  // no more "unlocked but Set says wrong key".
  let modSecret: string | null = null;
  let pendingSecret: string | null = null;

  function renderKeyForm(errMsg?: string) {
    if (!modEl) return;
    modEl.innerHTML = `
      <input type="password" class="chat-mod-key" placeholder="Moderator key" autocomplete="off" />
      <button type="button" class="chat-mod-unlock">Unlock</button>
      <span class="chat-mod-hint">${errMsg ? escapeHtml(errMsg) : ''}</span>`;
    const keyInput = modEl.querySelector<HTMLInputElement>('.chat-mod-key')!;
    const unlockBtn = modEl.querySelector<HTMLButtonElement>('.chat-mod-unlock')!;
    const hint = modEl.querySelector<HTMLSpanElement>('.chat-mod-hint')!;
    const submit = () => {
      const v = keyInput.value.trim();
      if (!v) return;
      pendingSecret = v;
      unlockBtn.disabled = true;
      hint.textContent = 'Checking…';
      socket.emit('mod:auth', { secret: v });
    };
    unlockBtn.addEventListener('click', submit);
    keyInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  }

  function renderTopicForm() {
    if (!modEl) return;
    modEl.innerHTML = `
      <input type="text" class="chat-mod-topic" maxlength="200" placeholder="Pin a topic for the room…" />
      <button type="button" class="chat-mod-set">Set</button>
      <button type="button" class="chat-mod-clear">Clear</button>
      <span class="chat-mod-hint" id="chat-mod-hint"></span>`;
    const topicInput = modEl.querySelector<HTMLInputElement>('.chat-mod-topic')!;
    topicInput.value = currentTopic;
    const setBtn = modEl.querySelector<HTMLButtonElement>('.chat-mod-set')!;
    setBtn.addEventListener('click', () => {
      const t = topicInput.value.trim();
      if (!t) return;
      socket.emit('mod:set-topic', { secret: modSecret, text: t });
    });
    modEl.querySelector<HTMLButtonElement>('.chat-mod-clear')!.addEventListener('click', () => {
      socket.emit('mod:clear-topic', { secret: modSecret });
    });
    topicInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') setBtn.click(); });
  }

  socket.on('mod:result', (data: { ok?: boolean; kind?: string; reason?: string }) => {
    if (!modEl) return;
    if (data?.kind === 'auth') {
      if (data.ok) {
        modSecret = pendingSecret;
        pendingSecret = null;
        renderTopicForm();
      } else {
        pendingSecret = null;
        renderKeyForm(data.reason || 'wrong moderator key');
      }
      return;
    }
    // set / clear result
    if (data?.ok !== true) {
      modSecret = null;
      renderKeyForm(data?.reason || 'That did not work — re-enter the key.');
      return;
    }
    const hint = modEl.querySelector<HTMLSpanElement>('#chat-mod-hint');
    if (hint) {
      hint.textContent = 'Saved ✓';
      setTimeout(() => { if (hint.textContent === 'Saved ✓') hint.textContent = ''; }, 2500);
    }
  });

  if (modEl) renderKeyForm();

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
