import PocketBase from "pocketbase";

function resolvePbUrl() {
  const configured = import.meta.env.VITE_PB_URL || "http://127.0.0.1:8090";
  if (typeof window === "undefined") return configured;
  // The dev server proxies /api to PocketBase, so every device on the LAN
  // talks to this machine through the same address it used to open the app.
  if (window.location.port === "5173") return window.location.origin;
  return configured;
}

export const pb = new PocketBase(resolvePbUrl());
pb.autoCancellation(false);

export function errorMessage(err: unknown) {
  if (typeof err === "object" && err && "status" in err) {
    const status = (err as { status?: number }).status;
    if (status === 0) {
      return "Can't reach PocketBase. Start it with npm run pocketbase, then run npm run bootstrap once.";
    }
    if (status === 404) {
      return "That record is missing. If this is a fresh install, run npm run bootstrap.";
    }
  }
  if (typeof err === "object" && err && "data" in err) {
    const data = (err as { data?: { message?: string; data?: Record<string, { message?: string }> } }).data;
    const fields = data?.data;
    if (fields) {
      const first = Object.values(fields).find((item) => item?.message);
      if (first?.message) return first.message;
    }
    if (data?.message) return data.message;
  }
  if (err instanceof Error && err.message) return err.message;
  return "Something went wrong.";
}

export function recordFileUrl(collection: string, id: string, filename: string, thumb?: string) {
  if (!filename) return "";
  const url = `${pb.baseUrl}/api/files/${collection}/${id}/${encodeURIComponent(filename)}`;
  return thumb ? `${url}?thumb=${encodeURIComponent(thumb)}` : url;
}
