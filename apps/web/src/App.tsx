import { DEFAULT_NEW_CHAT_TITLE, type ChatMessage, type ChatSummary } from "@enterprise-demo/shared";
import { FormEvent, useEffect, useMemo, useState } from "react";

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
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [configuredModelLabel, setConfiguredModelLabel] = useState<string | null>(null);
  const [loadingChats, setLoadingChats] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadChats();
    void loadMeta();
  }, []);

  useEffect(() => {
    if (!selectedChatId) return;
    void loadMessages(selectedChatId);
  }, [selectedChatId]);

  const selectedChat = useMemo(
    () => chats.find((chat) => chat.id === selectedChatId) ?? null,
    [chats, selectedChatId],
  );

  async function loadChats() {
    setLoadingChats(true);
    setError(null);

    try {
      const data = await fetchJson<ChatListResponse>("/api/chats");
      setChats(data.chats);

      if (!selectedChatId && data.chats.length > 0) {
        setSelectedChatId(data.chats[0].id);
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
    setError(null);

    try {
      const data = await fetchJson<{ chat: ChatSummary }>("/api/chats", {
        method: "POST",
        body: JSON.stringify({ title: DEFAULT_NEW_CHAT_TITLE }),
      });

      setChats((current) => [data.chat, ...current]);
      setSelectedChatId(data.chat.id);
      setMessages([]);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();

    const text = draft.trim();
    if (!text || !selectedChatId || sending) return;

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
      const data = await fetchJson<MessagesResponse>(`/api/chats/${selectedChatId}/messages`, {
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

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div>
            <h1>Chats</h1>
          </div>
          <button className="primary-button" onClick={() => void createChat()} type="button">
            New
          </button>
        </div>

        <div className="chat-list">
          {loadingChats ? <p className="muted">Loading chats...</p> : null}
          {!loadingChats && chats.length === 0 ? <p className="muted">No chats yet.</p> : null}

          {chats.map((chat) => (
            <button
              key={chat.id}
              className={`chat-list-item ${chat.id === selectedChatId ? "is-active" : ""}`}
              onClick={() => setSelectedChatId(chat.id)}
              type="button"
            >
              <span>{chat.title}</span>
              <span className="timestamp">{formatTimestamp(chat.updatedAt)}</span>
            </button>
          ))}
        </div>
      </aside>

      <main className="chat-panel">
        <header className="chat-header">
          <h2>{selectedChat?.title ?? "Chat"}</h2>
          {configuredModelLabel ? <p className="muted">{configuredModelLabel}</p> : null}
          {error ? <p className="error-text">{error}</p> : null}
        </header>

        <section className="message-list">
          {!selectedChatId ? <p className="empty-state">Create a chat.</p> : null}
          {selectedChatId && loadingMessages ? <p className="muted">Loading messages...</p> : null}
          {selectedChatId && !loadingMessages && messages.length === 0 ? (
            <p className="empty-state">No messages yet.</p>
          ) : null}

          {messages.map((message) => (
            <article key={message.id} className={`message message-${message.role}`}>
              <div className="message-meta">
                <strong>{message.role === "assistant" ? "Assistant" : "You"}</strong>
                <span>{formatTimestamp(message.createdAt)}</span>
              </div>
              {message.role === "assistant" && message.providerID && message.modelID ? (
                <div className="message-meta">
                  <span>{`${message.providerID}/${message.modelID}`}</span>
                </div>
              ) : null}
              <p>{message.text}</p>
            </article>
          ))}
        </section>

        <form className="composer" onSubmit={onSubmit}>
          <textarea
            aria-label="Message"
            className="composer-input"
            disabled={!selectedChatId || sending}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={selectedChatId ? "Message" : "Create a chat"}
            rows={4}
            value={draft}
          />
          <div className="composer-actions">
            <button className="primary-button" disabled={!selectedChatId || sending || !draft.trim()} type="submit">
              {sending ? "Sending..." : "Send"}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
