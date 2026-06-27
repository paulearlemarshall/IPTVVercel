export function constructStreamUrl(
  streamId: string,
  type: "live" | "vod" | "series",
  serverUrl: string,
  username: string,
  password: string,
): string {
  const base = serverUrl.replace(/\/+$/, "");
  return `${base}/${type}/${username}/${password}/${streamId}.ts`;
}

export function normalizeContainerExtension(value: unknown): string {
  const ext = typeof value === "string" ? value.replace(/^\./, "").toLowerCase() : "";
  return /^[a-z0-9]{1,8}$/.test(ext) ? ext : "mp4";
}

export function buildApiUrl(
  serverUrl: string,
  action: string,
  username: string,
  password: string,
  params?: Record<string, string>,
): string {
  const base = serverUrl.replace(/\/+$/, "");
  const url = `${base}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&action=${encodeURIComponent(action)}`;
  if (params) {
    const query = new URLSearchParams(params);
    return `${url}&${query.toString()}`;
  }
  return url;
}

export function getXcUrl(
  stream: Record<string, unknown>,
  type: string,
  serverUrl: string,
  username: string,
  password: string,
): string | null {
  if (!stream || !serverUrl) return null;
  const base = serverUrl.replace(/\/+$/, "");
  const id = (stream.stream_id ?? stream.id) as string;
  if (!id) return null;

  if (type === "live") {
    return `${base}/${username}/${password}/${id}.ts`;
  }
  if (type === "vod" || type === "episode") {
    const ext = normalizeContainerExtension(stream.container_extension);
    const path = type === "episode" ? "series" : "movie";
    return `${base}/${path}/${username}/${password}/${id}.${ext}`;
  }
  return null;
}

export function getXcLogoUrl(
  stream: Record<string, unknown>,
  serverUrl: string,
): string | null {
  if (!stream) return null;
  const rawLogo = (stream.stream_icon ?? stream.cover) as string | undefined;
  if (!rawLogo || !serverUrl) return rawLogo ?? null;
  if (rawLogo.startsWith("http")) return rawLogo;
  const base = serverUrl.replace(/\/+$/, "");
  return `${base}${rawLogo.startsWith("/") ? "" : "/"}${rawLogo}`;
}
