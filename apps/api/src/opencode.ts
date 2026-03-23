import {
  DEFAULT_NEW_CHAT_TITLE,
  type ChatMessage,
  type ChatSummary,
  type ProviderSelection,
} from "@enterprise-demo/shared";
import { createOpencodeClient } from "@opencode-ai/sdk";

type ClientWrapper = ReturnType<typeof createOpencodeClient>;

function unwrapData<T>(value: unknown): T {
  const fields = value as { data?: T };
  if (fields && "data" in fields && fields.data !== undefined) {
    return fields.data;
  }
  return value as T;
}

function toIsoString(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  return null;
}

function extractText(parts: Array<Record<string, unknown>> | undefined): string {
  if (!parts) return "";

  return parts
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => String(part.text))
    .join("\n")
    .trim();
}

function mapRole(role: unknown): "user" | "assistant" | "system" {
  if (role === "assistant" || role === "system") return role;
  return "user";
}

export class OpencodeClient {
  private readonly client: ClientWrapper;
  private readonly authorization: string | null;
  private readonly baseUrl: string;

  constructor(
    baseUrl: string,
    username?: string,
    password?: string,
  ) {
    this.baseUrl = baseUrl;
    this.authorization =
      password && password.length > 0
        ? `Basic ${Buffer.from(`${username ?? "opencode"}:${password}`).toString("base64")}`
        : null;

    this.client = createOpencodeClient({
      baseUrl,
      responseStyle: "data",
      throwOnError: true,
      fetch: async (request: Request) => {
        const nextRequest = new Request(request);
        if (this.authorization) {
          nextRequest.headers.set("Authorization", this.authorization);
        }

        return fetch(nextRequest);
      },
    });
  }

  async health() {
    const headers = new Headers();
    if (this.authorization) {
      headers.set("Authorization", this.authorization);
    }

    const response = await fetch(new URL("/global/health", this.baseUrl), { headers });
    if (!response.ok) {
      throw new Error(`OpenCode health request failed (${response.status})`);
    }

    return response.json() as Promise<{ healthy: boolean; version: string }>;
  }

  async listChats(): Promise<ChatSummary[]> {
    const result = unwrapData<Array<{
      id: string;
      title?: string | null;
      time?: { updated?: number | string | null; created?: number | string | null };
    }>>(await this.client.session.list({
      responseStyle: "data",
      throwOnError: true,
    }));
    return result
      .map((session) => ({
        id: session.id,
        title: session.title?.trim() || DEFAULT_NEW_CHAT_TITLE,
        updatedAt: toIsoString(session.time?.updated) ?? toIsoString(session.time?.created),
      }))
      .sort((a: ChatSummary, b: ChatSummary) => {
        const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return bTime - aTime;
      });
  }

  async createChat(title?: string): Promise<ChatSummary> {
    const result = unwrapData<{
      id: string;
      title?: string | null;
      time?: { updated?: number | string | null; created?: number | string | null };
    }>(await this.client.session.create({
      responseStyle: "data",
      throwOnError: true,
      body: {
        title: title?.trim() || DEFAULT_NEW_CHAT_TITLE,
      },
    }));

    return {
      id: result.id,
      title: result.title?.trim() || DEFAULT_NEW_CHAT_TITLE,
      updatedAt: toIsoString(result.time?.updated) ?? toIsoString(result.time?.created),
    };
  }

  async listMessages(chatId: string): Promise<ChatMessage[]> {
    const result = unwrapData<
      Array<{
        info: {
          id: string;
          role?: string | null;
          time?: { created?: number | string | null };
        };
        parts?: Array<Record<string, unknown>>;
      }>
    >(await this.client.session.messages({
      responseStyle: "data",
      throwOnError: true,
      path: { id: chatId },
    }));

    return result
      .map((message) => ({
        id: message.info.id,
        role: mapRole(message.info.role),
        text: extractText(message.parts as Array<Record<string, unknown>>),
        createdAt: toIsoString(message.info.time?.created),
      }))
      .filter((message: ChatMessage) => message.text.length > 0);
  }

  async sendMessage(chatId: string, text: string, selection?: ProviderSelection): Promise<ChatMessage[]> {
    const model =
      selection?.providerID && selection?.modelID
        ? {
            providerID: selection.providerID,
            modelID: selection.modelID,
          }
        : undefined;

    await this.client.session.prompt({
      responseStyle: "data",
      throwOnError: true,
      path: { id: chatId },
      body: {
        model,
        parts: [{ type: "text", text }],
      },
    });

    return this.listMessages(chatId);
  }
}
