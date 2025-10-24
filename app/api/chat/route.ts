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

type AssistantDirective =
  | { action: "msg"; content: string }
  | { action: "gpx"; content: GpxInstruction };

type GpxInstruction = {
  parameters: Record<string, unknown>;
  message?: string;
};

type ApiReply = {
  role: "assistant";
  action: "msg" | "gpx";
  content: string;
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

    if (!reply.content) {
      return NextResponse.json(
        { error: "Mistral reply did not include content" },
        { status: 502 }
      );
    }

    const directive = parseAssistantDirective(reply.content);
    if ("error" in directive) {
      return NextResponse.json({ error: directive.error }, { status: 400 });
    }

    let gpxRequest: GpxRequest | null = null;

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

      const normalizedFromTool = normalizeGpxArgs(parsedArgs);
      if ("error" in normalizedFromTool) {
        return NextResponse.json({ error: normalizedFromTool.error }, { status: 400 });
      }

      gpxRequest = normalizedFromTool;
    }

    if (directive.action === "gpx") {
      const normalizedFromDirective = normalizeGpxArgs(directive.content.parameters);
      if ("error" in normalizedFromDirective) {
        return NextResponse.json({ error: normalizedFromDirective.error }, { status: 400 });
      }

      const finalRequest = gpxRequest ?? normalizedFromDirective;
      const gpxReply = buildGpxResponseFromDirective(directive.content, finalRequest);
      return NextResponse.json({ reply: gpxReply });
    }

    if (reply.tool_calls?.length) {
      return NextResponse.json(
        {
          error:
            "Received a tool call from Mistral but the directive action was not 'gpx'."
        },
        { status: 400 }
      );
    }

    const messageReply: ApiReply = {
      role: "assistant",
      action: "msg",
      content: directive.content
    };

    return NextResponse.json({ reply: messageReply });
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

function parseAssistantDirective(content: string):
  | AssistantDirective
  | { error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    return {
      error:
        "Mistral reply must be valid JSON with an action and content field."
    };
  }

  if (!parsed || typeof parsed !== "object") {
    return { error: "Assistant directive must be a JSON object." };
  }

  const { action, content: payload } = parsed as Record<string, unknown>;

  if (action !== "msg" && action !== "gpx") {
    return {
      error: "Assistant directive action must be either 'msg' or 'gpx'."
    };
  }

  if (action === "msg") {
    if (typeof payload !== "string" || !payload.trim()) {
      return {
        error:
          "Message directives require a non-empty string content describing the assistant reply."
      };
    }

    return { action: "msg", content: payload };
  }

  const instruction = parseGpxInstruction(payload);
  if ("error" in instruction) {
    return { error: instruction.error };
  }

  return { action: "gpx", content: instruction };
}

function parseGpxInstruction(value: unknown): GpxInstruction | { error: string } {
  if (!value) {
    return {
      error:
        "GPX directives require content with the ride parameters for the GPX generation."
    };
  }

  if (typeof value === "string") {
    try {
      return parseGpxInstruction(JSON.parse(value));
    } catch (error) {
      return {
        error:
          "GPX directive content must be an object or a JSON string that decodes to one."
      };
    }
  }

  if (typeof value !== "object") {
    return {
      error: "GPX directive content must be an object with ride parameters."
    };
  }

  const payload = value as Record<string, unknown>;

  const parametersValue =
    typeof payload.parameters === "object" && payload.parameters !== null
      ? payload.parameters
      : value;

  const message =
    typeof payload.message === "string" && payload.message.trim()
      ? payload.message.trim()
      : undefined;

  return {
    parameters: parametersValue as Record<string, unknown>,
    message
  };
}

function buildGpxResponseFromDirective(
  instruction: GpxInstruction,
  request: GpxRequest
): ApiReply {
  const { message: preface } = instruction;
  const { message: gpxMessage } = buildGpxReply(request);
  const content = preface ? `${preface}\n\n${gpxMessage}` : gpxMessage;

  return {
    role: "assistant",
    action: "gpx",
    content
  };
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
