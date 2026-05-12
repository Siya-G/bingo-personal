/**
 * Public API origin for browser calls (never secrets — NEXT_PUBLIC_* only).
 * Supports NEXT_PUBLIC_API_URL (preferred) and NEXT_PUBLIC_API_BASE_URL (legacy).
 */
export function getPublicApiBaseUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_API_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (raw) {
    return raw.replace(/\/$/, "");
  }
  return "http://127.0.0.1:8000";
}
