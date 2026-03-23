import "dotenv/config";

import { serve } from "@hono/node-server";
import { DEFAULT_NEW_CHAT_TITLE, isNonEmptyString } from "@enterprise-demo/shared";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";

import { OpencodeClient } from "./opencode.js";

const port = Number(process.env.PORT ?? 3001);
const opencode = new OpencodeClient(
  process.env.OPENCODE_BASE_URL ?? "http://127.0.0.1:4096",
  process.env.OPENCODE_USERNAME,
  process.env.OPENCODE_PASSWORD,
);

const modelSelection = {
  providerID: process.env.OPENCODE_PROVIDER_ID || undefined,
  modelID: process.env.OPENCODE_MODEL_ID || undefined,
};
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const app = new Hono();

app.use(
  "/api/*",
  cors({
    origin: (origin) => {
      if (!origin) return allowedOrigins[0] ?? "*";
      return allowedOrigins.includes(origin) ? origin : null;
    },
  }),
);

app.onError((error, c) => {
  console.error(error);
  const status = error instanceof HTTPException ? error.status : 500;
  return c.json(
    {
      error: error.message || "Internal server error",
    },
    status,
  );
});

app.get("/api/health", async (c) => {
  const health = await opencode.health();
  return c.json({
    api: "ok",
    opencode: health,
  });
});

app.get("/api/chats", async (c) => {
  const chats = await opencode.listChats();
  return c.json({ chats });
});

app.post("/api/chats", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const title = isNonEmptyString(body.title) ? body.title : DEFAULT_NEW_CHAT_TITLE;
  const chat = await opencode.createChat(title);
  return c.json({ chat }, 201);
});

app.get("/api/chats/:id/messages", async (c) => {
  const id = c.req.param("id");
  if (!id) {
    throw new HTTPException(400, { message: "Chat id is required" });
  }

  const messages = await opencode.listMessages(id);
  return c.json({ messages });
});

app.post("/api/chats/:id/messages", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));

  if (!id) {
    throw new HTTPException(400, { message: "Chat id is required" });
  }

  if (!isNonEmptyString(body.text)) {
    throw new HTTPException(400, { message: "Message text is required" });
  }

  const messages = await opencode.sendMessage(id, body.text, modelSelection);
  return c.json({ messages });
});

serve(
  {
    fetch: app.fetch,
    port,
  },
  (info) => {
    console.log(`API listening on http://localhost:${info.port}`);
  },
);
