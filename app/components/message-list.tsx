"use client";

import clsx from "clsx";
import { Fragment } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";

const markdownComponents: Components = {
  a: ({ node: _node, ...props }) => (
    <a
      {...props}
      target="_blank"
      rel={[props.rel, "noreferrer", "noopener"].filter(Boolean).join(" ") || undefined}
    />
  )
};

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
        Kick things off by asking your cycling questions. 🚴
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
              {message.role === "assistant" ? "CycloCoach 🚴" : "You"}
            </header>
            <div className="message__content">
              <ReactMarkdown components={markdownComponents}>
                {message.content}
              </ReactMarkdown>
            </div>
          </article>
        </Fragment>
      ))}
      {isLoading ? <div className="loading-indicator">CycloCoach 🚴 is thinking…</div> : null}
    </div>
  );
}
