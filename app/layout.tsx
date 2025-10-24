import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mistral Chat",
  description: "Chat with a Mistral model"
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
