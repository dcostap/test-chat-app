import {
  DEFAULT_NEW_CHAT_TITLE,
  type ChatMessage,
  type ChatSummary,
  type ProviderSelection,
} from "@enterprise-demo/shared";

const textDecoder = new TextDecoder();

type OpencodeSession = {
  id: string;
  title?: string | null;
  updatedAt?: string | null;
  time?: {
    updated?: string | null;
    created?: string | null;
  };
};

type OpencodeMessageEnvelope = {
  info?: {
    id: string;
    role?: string;
    createdAt?: string | null;
    time?: {
      created?: string | null;
    };
  };
  parts?: Array<Record<string, unknown>>;
};

function joinUrl(baseUrl: string, pathname: string): string {
  return new URL(pathname, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString();
}

function extractText(parts: Array<Record<string, unknown>> | undefined): string {
  if (!parts) return "";

  return parts
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => String(part.text))
    .join("\n")
    .trim();
}

function toChatSummary(session: OpencodeSession): ChatSummary {
  return {
    id: session.id,
    title: session.title?.trim() || DEFAULT_NEW_CHAT_TITLE,
    updatedAt: session.updatedAt ?? session.time?.updated ?? session.time?.created ?? null,
  };
}

function toChatMessage(message: OpencodeMessageEnvelope): ChatMessage {
  const role = message.info?.role;

  return {
    id: message.info?.id ?? crypto.randomUUID(),
    role: role === "assistant" || role === "system" ? role : "user",
    text: extractText(message.parts),
    createdAt: message.info?.createdAt ?? message.info?.time?.created ?? null,
  };
}

export class OpencodeClient {
  constructor(
    private readonly baseUrl: string,
    private readonly username?: string,
    private readonly password?: string,
  ) {}

  private async request<T>(pathname: string, init?: RequestInit): Promise<T> {
    const headers = new Headers(init?.headers);
    headers.set("Accept", "application/json");

    if (init?.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    if (this.password) {
      const auth = Buffer.from(`${this.username ?? "opencode"}:${this.password}`).toString("base64");
      headers.set("Authorization", `Basic ${auth}`);
    }

    const response = await fetch(joinUrl(this.baseUrl, pathname), {
      ...init,
      headers,
    });

    if (!response.ok) {
      const body = await response.arrayBuffer();
      const text = textDecoder.decode(body);
      throw new Error(`OpenCode request failed (${response.status}): ${text || response.statusText}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }

  async health() {
    return this.request<{ healthy: boolean; version: string }>("/global/health");
  }

  async listChats(): Promise<ChatSummary[]> {
    const sessions = await this.request<OpencodeSession[]>("/session");
    return sessions
      .map(toChatSummary)
      .sort((a, b) => {
        const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return bTime - aTime;
      });
  }

  async createChat(title?: string): Promise<ChatSummary> {
    const session = await this.request<OpencodeSession>("/session", {
      method: "POST",
      body: JSON.stringify({
        title: title?.trim() || DEFAULT_NEW_CHAT_TITLE,
      }),
    });

    return toChatSummary(session);
  }

  async listMessages(chatId: string): Promise<ChatMessage[]> {
    const messages = await this.request<OpencodeMessageEnvelope[]>(`/session/${chatId}/message`);
    return messages.map(toChatMessage).filter((message) => message.text.length > 0);
  }

  async sendMessage(chatId: string, text: string, selection?: ProviderSelection): Promise<ChatMessage[]> {
    const body: Record<string, unknown> = {
      parts: [{ type: "text", text }],
    };

    if (selection?.providerID || selection?.modelID) {
      body.model = {
        providerID: selection?.providerID,
        modelID: selection?.modelID,
      };
    }

    await this.request<OpencodeMessageEnvelope>(`/session/${chatId}/message`, {
      method: "POST",
      body: JSON.stringify(body),
    });

    return this.listMessages(chatId);
  }
}
