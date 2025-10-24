"use client";

import clsx from "clsx";
import { Fragment } from "react";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
};

type MessageListProps = {
  messages: ChatMessage[];
  isLoading?: boolean;
};

export function MessageList({ messages, isLoading }: MessageListProps) {
  if (!messages.length) {
    return (
      <p className="message-list__empty">
        Start the conversation by asking anything about your project.
      </p>
    );
  }

  return (
    <div className="message-list">
      {messages.map((message) => (
        <Fragment key={message.id}>
          <article
            className={clsx("message", {
              "message--user": message.role === "user"
            })}
          >
            <header className="message__role">
              {message.role === "assistant" ? "Mistral" : "You"}
            </header>
            <p className="message__content">{message.content}</p>
          </article>
        </Fragment>
      ))}
      {isLoading ? <div className="loading-indicator">Mistral is thinking…</div> : null}
    </div>
  );
}
