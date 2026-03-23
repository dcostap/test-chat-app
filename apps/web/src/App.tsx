import { DEFAULT_NEW_CHAT_TITLE, type ChatMessage, type ChatSummary } from "@enterprise-demo/shared";
import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";

type ChatListResponse = {
  chats: ChatSummary[];
};

type MessagesResponse = {
  messages: ChatMessage[];
};

type MetaResponse = {
  configuredModel: {
    providerID: string;
    modelID: string;
  };
};

const DRAFT_CHAT_ID = "__draft__";

async function fetchJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

function formatTimestamp(value: string | null): string {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export default function App() {
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string>(DRAFT_CHAT_ID);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [configuredModelLabel, setConfiguredModelLabel] = useState<string | null>(null);
  const [loadingChats, setLoadingChats] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messageListRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    void loadChats();
    void loadMeta();
  }, []);

  useEffect(() => {
    if (selectedChatId === DRAFT_CHAT_ID) {
      setMessages([]);
      setLoadingMessages(false);
      return;
    }

    void loadMessages(selectedChatId);
  }, [selectedChatId]);

  useEffect(() => {
    if (!messageListRef.current) return;
    messageListRef.current.scrollTo({
      top: messageListRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, selectedChatId, sending]);

  const selectedChat = useMemo(
    () =>
      selectedChatId === DRAFT_CHAT_ID
        ? {
            id: DRAFT_CHAT_ID,
            title: DEFAULT_NEW_CHAT_TITLE,
            updatedAt: null,
          }
        : chats.find((chat) => chat.id === selectedChatId) ?? null,
    [chats, selectedChatId],
  );
  const isDraftChat = selectedChatId === DRAFT_CHAT_ID;
  const selectedAssistantModel = useMemo(
    () => [...messages].reverse().find((message) => message.role === "assistant" && message.providerID && message.modelID),
    [messages],
  );

  async function loadChats() {
    setLoadingChats(true);
    setError(null);

    try {
      const data = await fetchJson<ChatListResponse>("/api/chats");
      setChats(data.chats);
      if (selectedChatId !== DRAFT_CHAT_ID && !data.chats.some((chat) => chat.id === selectedChatId)) {
        setSelectedChatId(DRAFT_CHAT_ID);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoadingChats(false);
    }
  }

  async function loadMeta() {
    try {
      const data = await fetchJson<MetaResponse>("/api/meta");
      setConfiguredModelLabel(`${data.configuredModel.providerID}/${data.configuredModel.modelID}`);
    } catch {
      setConfiguredModelLabel(null);
    }
  }

  async function loadMessages(chatId: string) {
    setLoadingMessages(true);
    setError(null);

    try {
      const data = await fetchJson<MessagesResponse>(`/api/chats/${chatId}/messages`);
      setMessages(data.messages);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoadingMessages(false);
    }
  }

  async function createChat() {
    setSelectedChatId(DRAFT_CHAT_ID);
    setMessages([]);
    setDraft("");
    setError(null);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();

    const text = draft.trim();
    if (!text || sending) return;

    setSending(true);
    setError(null);
    setDraft("");

    const optimisticMessage: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: "user",
      text,
      createdAt: new Date().toISOString(),
    };

    setMessages((current) => [...current, optimisticMessage]);

    try {
      let activeChatId = selectedChatId;

      if (activeChatId === DRAFT_CHAT_ID) {
        const chatResponse = await fetchJson<{ chat: ChatSummary }>("/api/chats", {
          method: "POST",
          body: JSON.stringify({ title: DEFAULT_NEW_CHAT_TITLE }),
        });

        activeChatId = chatResponse.chat.id;
        setChats((current) => [chatResponse.chat, ...current.filter((chat) => chat.id !== chatResponse.chat.id)]);
        setSelectedChatId(activeChatId);
      }

      const data = await fetchJson<MessagesResponse>(`/api/chats/${activeChatId}/messages`, {
        method: "POST",
        body: JSON.stringify({ text }),
      });

      setMessages(data.messages);
      await loadChats();
    } catch (err) {
      setMessages((current) => current.filter((message) => message.id !== optimisticMessage.id));
      setError((err as Error).message);
      setDraft(text);
    } finally {
      setSending(false);
    }
  }

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    void onSubmit(event as unknown as FormEvent);
  }

  return (
    <div className="page-shell">
      <div className="ambient ambient-left" />
      <div className="ambient ambient-right" />

      <div className="app-shell">
        <aside className="sidebar">
          <div className="sidebar-header">
            <div className="brand-block">
              <span className="brand-dot" />
              <div>
                <p className="sidebar-label">Workspace</p>
                <h1>Assistant</h1>
              </div>
            </div>
            <button className="primary-button secondary-button" onClick={() => void createChat()} type="button">
              New chat
            </button>
          </div>

          <button
            className={`draft-chat-card ${isDraftChat ? "is-active" : ""}`}
            onClick={() => void createChat()}
            type="button"
          >
            <span className="draft-chat-title">New chat</span>
            <span className="draft-chat-copy">Start from an empty thread</span>
          </button>

          <div className="sidebar-section">
            <div className="sidebar-section-header">
              <span className="sidebar-label">Recent</span>
              {loadingChats ? <span className="muted">Syncing</span> : null}
            </div>

            <div className="chat-list">
              {!loadingChats && chats.length === 0 ? <p className="muted">No saved chats yet.</p> : null}

              {chats.map((chat) => (
                <button
                  key={chat.id}
                  className={`chat-list-item ${chat.id === selectedChatId ? "is-active" : ""}`}
                  onClick={() => setSelectedChatId(chat.id)}
                  type="button"
                >
                  <span className="chat-list-title">{chat.title}</span>
                  <span className="timestamp">{formatTimestamp(chat.updatedAt) || "Just now"}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="sidebar-footer">
            <span className="status-pill">
              <span className="status-dot" />
              Internal demo
            </span>
          </div>
        </aside>

        <main className="chat-panel">
          <header className="chat-header">
            <div>
              <p className="sidebar-label">Conversation</p>
              <h2>{selectedChat?.title ?? DEFAULT_NEW_CHAT_TITLE}</h2>
            </div>

            <div className="chat-header-meta">
              {configuredModelLabel ? <span className="status-pill">{configuredModelLabel}</span> : null}
              {selectedAssistantModel?.providerID && selectedAssistantModel.modelID ? (
                <span className="status-pill subtle-pill">
                  Last reply: {selectedAssistantModel.providerID}/{selectedAssistantModel.modelID}
                </span>
              ) : null}
            </div>
          </header>

          {error ? <p className="error-banner">{error}</p> : null}

          <section className="message-list" ref={messageListRef}>
            {isDraftChat && messages.length === 0 ? (
              <div className="empty-state-card">
                <span className="sidebar-label">New chat</span>
                <h3>Ask for anything in a fresh thread.</h3>
                <p>
                  Start typing below. The first message will create the chat automatically and keep the same flow as
                  existing threads.
                </p>
              </div>
            ) : null}

            {!isDraftChat && loadingMessages ? <p className="muted">Loading messages...</p> : null}
            {!isDraftChat && !loadingMessages && messages.length === 0 ? <p className="empty-state">No messages yet.</p> : null}

            {messages.map((message) => (
              <article key={message.id} className={`message message-${message.role}`}>
                <div className="message-meta">
                  <strong>{message.role === "assistant" ? "Assistant" : "You"}</strong>
                  <span>{formatTimestamp(message.createdAt)}</span>
                </div>
                {message.role === "assistant" && message.providerID && message.modelID ? (
                  <div className="message-model">{`${message.providerID}/${message.modelID}`}</div>
                ) : null}
                <p>{message.text}</p>
              </article>
            ))}

            {sending ? <div className="typing-indicator">Working on a reply...</div> : null}
          </section>

          <form className="composer" onSubmit={onSubmit}>
            <textarea
              aria-label="Message"
              className="composer-input"
              disabled={sending}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onComposerKeyDown}
              placeholder="Ask a question or describe the task"
              rows={3}
              value={draft}
            />
            <div className="composer-actions">
              <p className="muted">Enter to send. Shift+Enter for a new line.</p>
              <button className="primary-button" disabled={sending || !draft.trim()} type="submit">
                {sending ? "Sending..." : "Send"}
              </button>
            </div>
          </form>
        </main>
      </div>
    </div>
  );
}
