export type ChatSummary = {
  id: string;
  title: string;
  updatedAt: string | null;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  createdAt: string | null;
};

export type CreateChatRequest = {
  title?: string;
};

export type SendMessageRequest = {
  text: string;
};

export type ProviderSelection = {
  providerID?: string;
  modelID?: string;
};

export const DEFAULT_NEW_CHAT_TITLE = "New chat";

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
