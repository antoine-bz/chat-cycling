"use client";

import { useCallback, useState } from "react";
import { ChatInput } from "./components/chat-input";
import { ChatMessage, MessageList } from "./components/message-list";
import { buildGpxReply, parseGpxRequest } from "./lib/gpx";

const DEFAULT_SYSTEM_PROMPT = [
  "You are CycloCoach 🚴, a dedicated cycling assistant.",
  "Provide tailored guidance on training, ride planning, and bike maintenance while asking clarifying questions when needed.",
  "When a rider wants a GPX route, collect their start address, target distance in kilometers, desired elevation gain (D+), and preferred riding practice.",
  "Once every parameter is available, instruct them to use the /gpx command in the format '/gpx address: …; distance: … km; elevation: … m; practice: …' so the interface can generate a downloadable file.",
  "If any details are missing, ask focused follow-up questions before proceeding."
].join(" ");

type ApiMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

async function sendChat(messages: ApiMessage[]): Promise<ApiMessage> {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ messages })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error?.error ?? "Failed to reach the chat service");
  }

  const data = (await response.json()) as { reply: ApiMessage };
  return data.reply;
}

export default function Page() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSend = useCallback(
    async (content: string) => {
      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content
      };
      const nextMessages = [...messages, userMessage];
      setMessages(nextMessages);
      setError(null);

      const gpxRequest = parseGpxRequest(content);

      if (gpxRequest) {
        const { message } = buildGpxReply(gpxRequest);
        setMessages((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: message
          }
        ]);
        return;
      }

      setIsLoading(true);
      try {
        const assistantMessage = await sendChat([
          { role: "system", content: DEFAULT_SYSTEM_PROMPT },
          ...nextMessages.map(({ role, content: itemContent }) => ({
            role,
            content: itemContent
          }))
        ]);

        setMessages((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            role: assistantMessage.role,
            content: assistantMessage.content
          }
        ]);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        setMessages((current) => current.filter((item) => item.id !== userMessage.id));
      } finally {
        setIsLoading(false);
      }
    },
    [messages]
  );

  return (
    <main className="page">
      <header className="page__header">
        <p className="page__eyebrow">Powered by Mistral</p>
        <h1 className="page__title">CycloCoach 🚴</h1>
        <p className="page__subtitle">
          Your conversational co-pilot for improving rides, planning training, keeping your bike in top shape,
          and instantly generating GPX files from your address, distance, D+, and practice type. 🚴
        </p>
      </header>

      <section className="chat-panel">
        <MessageList messages={messages} isLoading={isLoading} />
        {error ? <p className="error-card">{error}</p> : null}
      </section>

      <ChatInput onSend={handleSend} disabled={isLoading} />

      <footer className="page__footer">
        You will need a <code>MISTRAL_API_KEY</code> in your environment to send messages.
      </footer>
    </main>
  );
}
