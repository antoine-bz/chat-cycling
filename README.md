# Chat Cycling

A polished chat interface built with Next.js that connects to Mistral’s chat completion API. Enter a prompt, send it to the backend API route, and view the streamed response once it returns.

## Getting started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a `.env.local` file in the project root and add your Mistral API key:

   ```bash
   MISTRAL_API_KEY=your_api_key_here
   ```

3. Run the development server:

   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) to view the chat experience.

## How it works

- The frontend is a single-page chat experience built with the Next.js App Router (`app/page.tsx`).
- Messages are sent to the `/api/chat` route where the server securely calls `https://api.mistral.ai/v1/chat/completions` using the `MISTRAL_API_KEY` environment variable.
- Responses are returned to the client and appended to the conversation history.

The design relies solely on handcrafted CSS (no utility frameworks required) and aims to keep the focus on the dialogue while providing clear error feedback when the API cannot be reached.
