export type GpxRequest = {
  address: string;
  distanceKm: number;
  elevationGain: number;
  practiceType: string;
};

export function parseGpxRequest(rawMessage: string): GpxRequest | null {
  if (!rawMessage) {
    return null;
  }

  const normalized = rawMessage.toLowerCase();
  if (!normalized.includes("gpx")) {
    return null;
  }

  const cleaned = rawMessage
    .replace(/^\s*\/gpx/i, "")
    .replace(/gpx\s*:?/gi, "")
    .trim();

  const segments = cleaned
    .split(/[\n;]+/)
    .map((segment) => segment.split(","))
    .flat()
    .map((segment) => segment.trim())
    .filter(Boolean);

  let address: string | null = null;
  let distanceKm: number | null = null;
  let elevationGain: number | null = null;
  let practiceType: string | null = null;

  for (const segment of segments) {
    const [labelPart, valuePart] = segment.split(/[:=]/, 2).map((item) => item.trim());
    const label = valuePart ? labelPart.toLowerCase() : "";
    const value = valuePart ?? labelPart;

    if (!value) {
      continue;
    }

    if (/(address|adresse|from|depuis)/i.test(label)) {
      address = value;
      continue;
    }

    if (/(practice|pratique|type|discipline)/i.test(label)) {
      practiceType = value;
      continue;
    }

    if (/(distance|km)/i.test(label)) {
      const parsed = parseDistance(value);
      if (parsed) {
        distanceKm = parsed;
      }
      continue;
    }

    if (/(d\+|elevation|gain|denivel|climb)/i.test(label)) {
      const parsed = parseElevation(value);
      if (parsed !== null) {
        elevationGain = parsed;
      }
      continue;
    }

    // Attempt detection by units if no explicit label was provided.
    if (distanceKm === null) {
      const parsedDistance = parseDistance(value);
      if (parsedDistance) {
        distanceKm = parsedDistance;
        continue;
      }
    }

    if (elevationGain === null) {
      const parsedElevation = parseElevation(value);
      if (parsedElevation !== null) {
        elevationGain = parsedElevation;
        continue;
      }
    }

    if (!address) {
      address = value;
    } else if (!practiceType) {
      practiceType = value;
    }
  }

  // Additional heuristics for address when provided in prose.
  if (!address) {
    const addressMatch = rawMessage.match(
      /(?:from|starting at|departing from|depuis|adresse)\s+([^,\n]+?)(?=(?:\s+for|\s+distance|\s+d\+|\s+elevation|$))/i
    );
    if (addressMatch) {
      address = addressMatch[1].trim();
    }
  }

  if (!practiceType) {
    const practiceMatch = rawMessage.match(/(?:practice|type|pratique|discipline)\s*[:=]?\s*([\p{L}\s]+)/iu);
    if (practiceMatch) {
      practiceType = practiceMatch[1].trim();
    }
  }

  if (address && distanceKm !== null && elevationGain !== null && practiceType) {
    return {
      address,
      distanceKm,
      elevationGain,
      practiceType
    };
  }

  return null;
}

export function buildGpxReply(request: GpxRequest): { message: string } {
  const estimatedHours = request.distanceKm / estimateAverageSpeed(request.practiceType);
  const formattedDuration = formatDuration(estimatedHours);
  const filename = buildGpxFilename(request);
  const params = new URLSearchParams({
    address: request.address,
    distanceKm: request.distanceKm.toString(),
    elevationGain: request.elevationGain.toString(),
    practiceType: request.practiceType
  });
  const downloadUrl = `/api/gpx?${params.toString()}`;

  const message = [
    `Here is a **${formatPracticeLabel(request.practiceType)}** route starting from **${request.address}**.`,
    `- Distance: ${request.distanceKm.toFixed(1)} km`,
    `- Elevation gain: ${Math.round(request.elevationGain)} m`,
    formattedDuration ? `- Estimated moving time: ${formattedDuration}` : null,
    `[⬇️ Download the GPX file](${downloadUrl} "Download ${filename}")`,
    "Import this GPX into your preferred navigation app and enjoy the ride!"
  ]
    .filter(Boolean)
    .join("\n\n");

  return { message };
}

export function createGpxFile(request: GpxRequest): { filename: string; content: string } {
  const points = createTrackPoints(request);
  const content = buildGpxDocument(request, points);

  return {
    filename: buildGpxFilename(request),
    content
  };
}

type TrackPoint = {
  lat: number;
  lon: number;
  ele: number;
  timeOffset: number;
};

function buildGpxDocument(request: GpxRequest, points: TrackPoint[]): string {
  const startTime = new Date();
  startTime.setSeconds(0, 0);
  const name = `CycloCoach ${formatPracticeLabel(request.practiceType)} route`;
  const description = `${request.distanceKm.toFixed(1)} km loop starting from ${request.address}`;

  const segments = points
    .map((point) => {
      const timestamp = new Date(startTime.getTime() + point.timeOffset * 1000).toISOString();
      return `      <trkpt lat="${point.lat.toFixed(6)}" lon="${point.lon.toFixed(6)}">\n` +
        `        <ele>${point.ele.toFixed(1)}</ele>\n` +
        `        <time>${timestamp}</time>\n` +
        "      </trkpt>";
    })
    .join("\n");

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<gpx version="1.1" creator="CycloCoach" xmlns="http://www.topografix.com/GPX/1/1">\n` +
    "  <metadata>\n" +
    `    <name>${escapeXml(name)}</name>\n` +
    `    <desc>${escapeXml(description)}</desc>\n` +
    "  </metadata>\n" +
    "  <trk>\n" +
    `    <name>${escapeXml(name)}</name>\n` +
    "    <trkseg>\n" +
    `${segments}\n` +
    "    </trkseg>\n" +
    "  </trk>\n" +
    "</gpx>\n"
  );
}

function buildGpxFilename(request: GpxRequest): string {
  const practice = slugify(formatPracticeLabel(request.practiceType)) || "ride";
  const roundedDistance = Math.max(1, Math.round(request.distanceKm));
  return `cyclocoach-${practice}-${roundedDistance}km.gpx`;
}

function createTrackPoints(request: GpxRequest): TrackPoint[] {
  const rng = createDeterministicRng(request.address + request.practiceType);
  const pointCount = Math.max(12, Math.min(240, Math.round(request.distanceKm * 6)));
  const baseLat = rng() * 140 - 70;
  const baseLon = rng() * 360 - 180;
  const radiusKm = Math.max(1, request.distanceKm / (2 * Math.PI));
  const radiusLat = radiusKm / 111;
  const cosLat = Math.cos((baseLat * Math.PI) / 180);
  const sign = cosLat === 0 ? 1 : Math.sign(cosLat);
  const safeCos = Math.abs(cosLat) > 0.1 ? cosLat : 0.1 * (sign || 1);
  const radiusLon = radiusKm / (111 * safeCos);
  const practiceFactor = getPracticeRoughness(request.practiceType);

  const ascentPoints = Math.max(3, Math.round(pointCount * 0.4));
  const plateauPoints = Math.max(2, Math.round(pointCount * 0.2));
  const descentPoints = Math.max(3, pointCount - ascentPoints - plateauPoints);

  let remainingAscent = request.elevationGain;
  const ascentStep = remainingAscent / ascentPoints;
  let elevation = 80 + rng() * 600;
  const baseElevation = elevation;

  const points: TrackPoint[] = [];
  const estimatedSpeed = estimateAverageSpeed(request.practiceType);
  const totalDurationSeconds = Math.max(600, (request.distanceKm / Math.max(5, estimatedSpeed)) * 3600);

  for (let index = 0; index < pointCount; index += 1) {
    const t = index / pointCount;
    const angle = t * 2 * Math.PI;
    const radiusJitter = 0.7 + rng() * 0.6 * practiceFactor;
    const lat = baseLat + Math.sin(angle) * radiusLat * radiusJitter;
    const lon = baseLon + Math.cos(angle) * radiusLon * radiusJitter;

    if (index < ascentPoints) {
      const remainingSteps = ascentPoints - index;
      const step = index === ascentPoints - 1 ? remainingAscent : ascentStep + (rng() - 0.5) * ascentStep * 0.3;
      const applied = Math.max(0, Math.min(step, remainingAscent));
      elevation += applied;
      remainingAscent -= applied;
    } else if (index < ascentPoints + plateauPoints) {
      elevation += (rng() - 0.5) * ascentStep * 0.2;
    } else {
      const progress = (index - ascentPoints - plateauPoints) / Math.max(1, descentPoints);
      const descentTarget = baseElevation - (rng() * 20);
      elevation += (descentTarget - elevation) * (0.15 + progress * 0.4);
    }

    const timeOffset = (totalDurationSeconds / pointCount) * index;
    points.push({ lat, lon, ele: Math.max(0, elevation), timeOffset });
  }

  // Ensure final point closes the loop near the start.
  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];
  lastPoint.lat = firstPoint.lat;
  lastPoint.lon = firstPoint.lon;
  lastPoint.ele = firstPoint.ele;

  return points;
}

function parseDistance(value: string): number | null {
  const match = value.match(/([\d,.]+)\s*(km|kilometres?|kilometers?)?/i);
  if (!match) {
    return null;
  }

  const numeric = parseFloat(match[1].replace(/,/g, "."));
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }

  return numeric;
}

function parseElevation(value: string): number | null {
  const match = value.match(/([\d,.]+)\s*(m|meters?|metres?)?\s*(d\+)?/i);
  if (!match) {
    return null;
  }

  const numeric = parseFloat(match[1].replace(/,/g, "."));
  if (!Number.isFinite(numeric) || numeric < 0) {
    return null;
  }

  return numeric;
}

function createDeterministicRng(seedSource: string) {
  let seed = 0;
  for (let index = 0; index < seedSource.length; index += 1) {
    seed = (seed << 5) - seed + seedSource.charCodeAt(index);
    seed |= 0; // Convert to 32-bit integer
  }

  return function rng() {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function estimateAverageSpeed(practiceType: string): number {
  const normalized = practiceType.toLowerCase();

  if (/(road|route|endurance|training)/i.test(normalized)) {
    return 28;
  }
  if (/(gravel|bikepacking)/i.test(normalized)) {
    return 22;
  }
  if (/(mtb|vtt|trail|all-mountain)/i.test(normalized)) {
    return 16;
  }
  if (/(commute|city|urban|velo taf)/i.test(normalized)) {
    return 18;
  }
  return 20;
}

function getPracticeRoughness(practiceType: string): number {
  const normalized = practiceType.toLowerCase();
  if (/(mtb|vtt|trail|all-mountain)/i.test(normalized)) {
    return 1.3;
  }
  if (/(gravel|bikepacking)/i.test(normalized)) {
    return 1.1;
  }
  return 0.8;
}

function formatPracticeLabel(practiceType: string): string {
  return practiceType.replace(/\s+/g, " ").trim();
}

function formatDuration(hours: number): string | null {
  if (!Number.isFinite(hours) || hours <= 0) {
    return null;
  }
  const totalMinutes = Math.round(hours * 60);
  const hrs = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hrs && mins) {
    return `${hrs}h${mins.toString().padStart(2, "0")}`;
  }
  if (hrs) {
    return `${hrs}h00`;
  }
  return `${mins} min`;
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&apos;";
      default:
        return char;
    }
  });
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
