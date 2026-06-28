// Resolve the XC credentials for a request. Vercel environment secrets
// (XC_USERNAME / XC_PASSWORD) take precedence over anything stored on the
// profile row, so the credentials live only as deployment secrets and the DB
// never needs to hold the plaintext password. The per-profile fields remain a
// fallback for multi-profile setups that aren't driven purely by env.
export function resolveCredentials(profile: { username?: string | null; password?: string | null }) {
  return {
    username: process.env.XC_USERNAME || profile.username || "",
    password: process.env.XC_PASSWORD || profile.password || "",
  };
}
