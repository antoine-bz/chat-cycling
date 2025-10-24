"use client";

import { useCallback, useState } from "react";
import { ChatInput } from "./components/chat-input";
import { ChatMessage, MessageList } from "./components/message-list";

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
      setIsLoading(true);
      try {
        const assistantMessage = await sendChat(
          nextMessages.map(({ role, content: itemContent }) => ({
            role,
            content: itemContent
          }))
        );

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
        <h1 className="page__title">Project Copilot</h1>
        <p className="page__subtitle">
          A focused chat interface for exploring ideas with Mistral’s large language models.
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
