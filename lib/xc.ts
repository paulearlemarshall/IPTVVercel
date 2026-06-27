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
