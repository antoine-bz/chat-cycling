import { NextResponse } from "next/server";

type ChatCompletionResponse = {
  choices: Array<{
    message: {
      role: "assistant" | "user" | "system";
      content: string;
    };
  }>;
};

type ChatRequest = {
  messages: Array<{
    role: "assistant" | "user" | "system";
    content: string;
  }>;
};

const MISTRAL_ENDPOINT = "https://api.mistral.ai/v1/chat/completions";
const DEFAULT_MODEL = "mistral-small-latest";

export async function POST(request: Request) {
  let body: ChatRequest;

  try {
    body = (await request.json()) as ChatRequest;
  } catch (error) {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const apiKey = process.env.MISTRAL_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      {
        error: "Missing MISTRAL_API_KEY environment variable."
      },
      { status: 500 }
    );
  }

  if (!body.messages?.length) {
    return NextResponse.json({ error: "Messages are required" }, { status: 400 });
  }

  try {
    const mistralResponse = await fetch(MISTRAL_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages: body.messages
      })
    });

    if (!mistralResponse.ok) {
      const errorPayload = await mistralResponse.json().catch(() => ({}));
      const payloadError = errorPayload?.error;
      let errorMessage: string;

      if (typeof payloadError === "string") {
        errorMessage = payloadError;
      } else if (
        payloadError &&
        typeof payloadError === "object" &&
        "message" in payloadError &&
        typeof payloadError.message === "string"
      ) {
        errorMessage = payloadError.message;
      } else {
        errorMessage = `Mistral API returned status ${mistralResponse.status}`;
      }

      const status = mistralResponse.status === 429 ? 429 : 502;

      return NextResponse.json({ error: errorMessage }, { status });
    }

    const completion = (await mistralResponse.json()) as ChatCompletionResponse;
    const reply = completion.choices[0]?.message;

    if (!reply) {
      return NextResponse.json(
        { error: "Mistral API response did not include a message" },
        { status: 502 }
      );
    }

    return NextResponse.json({ reply });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unexpected error while contacting Mistral"
      },
      { status: 500 }
    );
  }
}
