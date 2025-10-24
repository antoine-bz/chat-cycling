import { NextResponse } from "next/server";
import { buildGpxReply, type GpxRequest } from "../../lib/gpx";

type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

type ChatCompletionResponse = {
  choices: Array<{
    message: {
      role: "assistant" | "user" | "system";
      content: string | null;
      tool_calls?: ToolCall[];
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

const GPX_TOOL = {
  type: "function",
  function: {
    name: "generate_gpx_route",
    description:
      "Generate a deterministic GPX route based on the rider's starting address, desired distance, elevation gain, and practice type.",
    parameters: {
      type: "object",
      properties: {
        start_address: {
          type: "string",
          description: "Street address or landmark that marks the starting point of the ride"
        },
        distance_km: {
          type: "number",
          description: "Total route distance in kilometers"
        },
        elevation_gain_m: {
          type: "number",
          description: "Total climbing (D+) in meters"
        },
        practice_type: {
          type: "string",
          description: "Type of riding (e.g. road, gravel, mtb, commute)"
        }
      },
      required: ["start_address", "distance_km", "elevation_gain_m", "practice_type"]
    }
  }
} as const;

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
        messages: body.messages,
        tools: [GPX_TOOL],
        tool_choice: "auto"
      })
    });

    if (!mistralResponse.ok) {
      const errorPayload = await mistralResponse.json().catch(() => ({}));
      return NextResponse.json(
        {
          error:
            typeof errorPayload?.error === "string"
              ? errorPayload.error
              : `Mistral API returned status ${mistralResponse.status}`
        },
        { status: 502 }
      );
    }

    const completion = (await mistralResponse.json()) as ChatCompletionResponse;
    const reply = completion.choices[0]?.message;

    if (!reply) {
      return NextResponse.json(
        { error: "Mistral API response did not include a message" },
        { status: 502 }
      );
    }

    if (reply.tool_calls?.length) {
      const toolCall = reply.tool_calls[0];
      if (toolCall.function.name !== "generate_gpx_route") {
        return NextResponse.json(
          { error: `Unsupported tool call: ${toolCall.function.name}` },
          { status: 400 }
        );
      }

      let parsedArgs: unknown;
      try {
        parsedArgs = JSON.parse(toolCall.function.arguments || "{}");
      } catch (error) {
        return NextResponse.json(
          { error: "Unable to parse tool call arguments" },
          { status: 400 }
        );
      }

      const gpxRequest = normalizeGpxArgs(parsedArgs);
      if ("error" in gpxRequest) {
        return NextResponse.json({ error: gpxRequest.error }, { status: 400 });
      }

      const { message } = buildGpxReply(gpxRequest);
      return NextResponse.json({ reply: { role: "assistant", content: message } });
    }

    if (!reply.content) {
      return NextResponse.json(
        { error: "Mistral reply did not include content" },
        { status: 502 }
      );
    }

    return NextResponse.json({ reply: { role: reply.role, content: reply.content } });
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

function normalizeGpxArgs(value: unknown): GpxRequest | { error: string } {
  if (!value || typeof value !== "object") {
    return { error: "GPX tool arguments must be an object" };
  }

  const {
    start_address: address,
    distance_km: distanceKm,
    elevation_gain_m: elevationGain,
    practice_type: practiceType
  } = value as Record<string, unknown>;

  if (typeof address !== "string" || !address.trim()) {
    return { error: "GPX tool requires a non-empty start_address" };
  }

  const normalizedDistance = coerceNumber(distanceKm);
  if (normalizedDistance === null || normalizedDistance <= 0) {
    return { error: "GPX tool requires distance_km to be a positive number" };
  }

  const normalizedElevation = coerceNumber(elevationGain);
  if (normalizedElevation === null || normalizedElevation < 0) {
    return { error: "GPX tool requires elevation_gain_m to be a non-negative number" };
  }

  if (typeof practiceType !== "string" || !practiceType.trim()) {
    return { error: "GPX tool requires a non-empty practice_type" };
  }

  const request: GpxRequest = {
    address: address.trim(),
    distanceKm: normalizedDistance,
    elevationGain: normalizedElevation,
    practiceType: practiceType.trim()
  };

  return request;
}

function coerceNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}
