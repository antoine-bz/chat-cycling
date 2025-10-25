import type { NextRequest } from "next/server";

import { createGpxFile, type GpxRequest } from "../../lib/gpx";

function parseNumberParam(
  value: string | null,
  { allowZero = false }: { allowZero?: boolean } = {}
): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0 || (!allowZero && parsed === 0)) {
    return null;
  }

  return parsed;
}

export function GET(request: NextRequest) {
  const url = new URL(request.url);
  const address = url.searchParams.get("address");
  const practiceType = url.searchParams.get("practiceType");
  const distanceKm = parseNumberParam(url.searchParams.get("distanceKm"));
  const elevationGain = parseNumberParam(url.searchParams.get("elevationGain"), {
    allowZero: true
  });

  if (!address || !practiceType || distanceKm === null || elevationGain === null) {
    return new Response(JSON.stringify({ error: "Missing or invalid query parameters." }), {
      status: 400,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }

  const gpxRequest: GpxRequest = {
    address,
    practiceType,
    distanceKm,
    elevationGain
  };

  const { filename, content } = createGpxFile(gpxRequest);

  return new Response(content, {
    status: 200,
    headers: {
      "Content-Type": "application/gpx+xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`
    }
  });
}
