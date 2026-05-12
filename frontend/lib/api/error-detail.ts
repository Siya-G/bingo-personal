/**
 * Normalize FastAPI `detail` payloads (string, object, or validation list).
 */

export async function readApiErrorDetail(
  response: Response,
  fallback: string,
): Promise<string> {
  try {
    const data = (await response.json()) as { detail?: unknown };
    return formatDetailPayload(data.detail, fallback);
  } catch {
    return fallback;
  }
}

export function formatDetailPayload(detail: unknown, fallback: string): string {
  if (typeof detail === "string" && detail.trim()) {
    return detail.trim();
  }
  if (Array.isArray(detail)) {
    const parts = detail.map((item) => {
      if (typeof item === "object" && item !== null && "msg" in item) {
        const loc = "loc" in item ? (item as { loc?: unknown }).loc : undefined;
        const locStr = Array.isArray(loc)
          ? loc.filter((x) => x !== "body").join(".")
          : "";
        const msg = String((item as { msg?: unknown }).msg ?? "Invalid value");
        return locStr ? `${locStr}: ${msg}` : msg;
      }
      return String(item);
    });
    const joined = parts.filter(Boolean).join("; ");
    return joined || fallback;
  }
  return fallback;
}
