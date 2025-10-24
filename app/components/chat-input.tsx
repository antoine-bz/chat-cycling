"use client";

import { useState } from "react";

type ChatInputProps = {
  onSend: (message: string) => Promise<void> | void;
  disabled?: boolean;
};

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [value, setValue] = useState(
    "/gpx address: 10 Downing Street, London; distance: 60 km; elevation: 800 m; practice: road"
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }
    setValue("");
    await onSend(trimmed);
  }

  return (
    <form onSubmit={handleSubmit} className="chat-form">
      <textarea
        className="chat-form__textarea"
        placeholder="Ask anything about cycling or request a GPX with '/gpx address: …; distance: … km; elevation: … m; practice: …' 🚴"
        rows={2}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        disabled={disabled}
        required
      />
      <button type="submit" className="chat-form__button" disabled={disabled}>
        Send
      </button>
    </form>
  );
}
