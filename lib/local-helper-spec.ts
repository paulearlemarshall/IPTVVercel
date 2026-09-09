export type HelperPlatform = "Windows" | "macOS" | "Linux";

export function localHelperSpec(platform: HelperPlatform, origin: string, providerHost: string) {
  return `Build a complete, runnable local IPTV playback helper for ${platform}.

I will paste these instructions into an AI coding assistant. Produce all source files, dependency manifests, configuration templates, installation commands, start/stop instructions, troubleshooting and tests. Do not assume access to the original repository. Implement the exact browser protocol below; do not require changes to the existing website. Prefer JavaScript ES modules on a supported Node.js LTS release with native node:http, node:crypto and node:child_process, plus dotenv. FFmpeg is a separate installed executable.

PURPOSE AND NETWORK MODEL
The website runs at ${origin}. Its JavaScript executes in my browser on this same computer. The helper listens ONLY on http://127.0.0.1:19876 (IPv4 loopback, never 0.0.0.0 or the LAN address). Browser -> local helper -> IPTV provider; the helper returns progressive MPEG-TS video to the browser's mpegts.js player. No video passes through Vercel. No router forwarding, public server, tunnel or hosted gateway is needed. Chrome/Edge may require local-network permission; CORS headers do not replace that permission. Do not disable browser security. Desktop Chrome/Edge are the initial target even on macOS; do not promise universal Safari/mobile support.

CONFIGURATION (LOCAL FILES ONLY)
Provide .env.example with:
LOCAL_PLAYER_ORIGINS=${origin}
LOCAL_PLAYER_HOSTS=${providerHost || "REPLACE_WITH_TRUSTED_PROVIDER_HOST"}
# Optional absolute path; default resolves ffmpeg from PATH:
# LOCAL_PLAYER_FFMPEG=/replace/with/platform/ffmpeg/path

Origins are exact scheme + hostname + optional port, comma-separated, with no path or wildcard. Provider entries are exact URL.host values (hostname plus non-default port), comma-separated. Never allow all hosts by default. These values identify the current website and provider host only; no stream URL, account password, token or movie title is included in this specification. Ask the user to confirm additional trusted providers if necessary. No IPTV credentials need to be configured separately: the browser supplies a complete authenticated source URL when creating a session. Keep that URL in memory only, never log or persist it. Treat configuration strings as data, never shell code. Optional compatibility with existing XC_SERVER_1..XC_SERVER_10 URLs may extract their URL.host into the allowlist. Standalone operation must work using LOCAL_PLAYER_HOSTS alone. Load ignored .env.local relative to the helper directory, not an arbitrary working directory; process environment takes precedence. Keep port 19876 because the existing player hardcodes it.

EXACT HTTP API, VERSION 1
For all requests require Host: 127.0.0.1:19876 and an Origin in the exact configured allowlist; otherwise 403. This includes health, stream and preflight requests. Sessions also belong to their creating Origin. For accepted origins set Access-Control-Allow-Origin to that origin, Vary: Origin and Cache-Control: no-store, including error responses. Never use wildcard CORS.

OPTIONS: respond 204 with Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS; Access-Control-Allow-Headers: content-type; Access-Control-Allow-Private-Network: true. This supports older preflight behavior; modern browsers can still ask for local-network permission.

GET /health: 200 application/json, {"version":1}.

POST /sessions: require application/json; cap incoming request bytes at 8192. Body is {"url":"<complete HTTP or HTTPS provider stream URL>","mode":"remux"} or mode "compatible". Parse with URL. Reject protocols other than http:/https:, URL username/password userinfo, malformed URLs, hosts absent from the trusted allowlist, and unknown modes. Credentials embedded in the URL path/query are permitted because this is how the provider protocol authenticates. At most two sessions at once. Generate an unpredictable ID from 24 cryptographically random bytes, encoded as 48 lowercase hexadecimal characters. Keep {source URL, mode, creating origin, creation timestamp, process/response handles} in memory. Return 201 application/json, {"id":"<48-character-id>"}. Do not start FFmpeg until the stream GET. The browser expects this POST within ten seconds.

GET /sessions/<id>/stream: validate the ID and origin ownership. Start one FFmpeg process for that session, return 200 Content-Type: video/mp2t and stream FFmpeg stdout directly with backpressure. No Content-Length; do not buffer the whole movie or write a complete output file. Reject a second simultaneous stream GET for the same session with 409. The frontend uses mpegts.createPlayer({type:"mpegts",isLive:true,url:helperStreamUrl},{enableWorker:false}), attaches a video element and starts playback.

DELETE /sessions/<id>: terminate that session's FFmpeg, disconnect its streaming response, remove the session; return 200 JSON {"stopped":true}. Unknown/expired IDs return 404. The browser sends this with fetch keepalive when closing or switching modes. It may race with the stream disconnect, so repeated cleanup must be safe.

Use JSON {"error":"safe readable message"} for errors before streaming starts: 400 bad input/source/mode, 403 forbidden host/origin, 404 absent session, 405 unsupported method, 409 already streaming, 413 oversized body, 415 wrong content type, 429 session limit, 503 missing FFmpeg, 502 upstream/conversion failure, 500 unexpected helper failure. After response bytes start, terminate a failed stream; never append JSON to video bytes. Do not leak source URLs or FFmpeg stderr in errors.

FFMPEG PIPELINE
Spawn without a shell, passing each argument separately (never concatenate a shell command with the source URL). Common input arguments:
-hide_banner -loglevel error -nostdin -re -rw_timeout 15000000 -protocol_whitelist http,https,tcp,tls,crypto -i <sourceUrl>
Then select the first video and optional first audio, discard subtitles/data:
-map 0:v:0 -map 0:a:0? -sn -dn
For mode remux (the website calls this Local fast):
-c:v copy
For mode compatible (Local compatibility):
-c:v libx264 -preset veryfast -tune zerolatency -pix_fmt yuv420p -threads 2
For both modes finish with:
-c:a aac -ac 2 -b:a 160k -f mpegts -mpegts_flags +resend_headers pipe:1
Ensure output pipe:1 works with the input protocol whitelist. Drain stderr without logging it; it may contain passwords. Copy mode is not guaranteed to work for every source video codec; compatibility converts to H.264/AAC. Pace input progressively using -re. Handle spawn failure, nonzero exit, normal EOF, request/response errors and cancellation without leaking processes or unhandled errors. Fail cleanly when the port is already occupied. Do not claim success merely because a session was created.

LIFECYCLE AND SECURITY
Disconnecting the browser stream, deleting a session, or shutting down the helper must terminate FFmpeg and remove session state. Cleanup must be idempotent, with a bounded graceful shutdown and forced termination fallback. Remove unused sessions after 30 seconds (a periodic sweep is acceptable). Never install a startup service silently. Bind to loopback and validate Host to resist DNS rebinding. Origins and unpredictable session IDs prevent arbitrary websites from using an active session; they do not protect against malicious local applications. Local privileged processes may inspect FFmpeg's command line. FFmpeg can follow upstream redirects and nested playlists: an initial-host check does not enforce every downstream destination. Only allow user-trusted providers, restrict FFmpeg protocols as above and document this boundary; do not present this as a general arbitrary-URL proxy. Never add credentials to examples, analytics, screenshots, fixtures or logs.

${platform === "Windows" ? `WINDOWS DELIVERY
Provide PowerShell instructions. Detect Node.js and FFmpeg with Get-Command and verify ffmpeg -version and ffprobe -version. Explain installation through official Node.js downloads and a trusted FFmpeg distribution/package manager; verify current package identifiers rather than guessing. Support paths with spaces. Use child_process.spawn with windowsHide:true and shell:false so FFmpeg does not open extra windows. Supply an easy start script that works regardless of the shell's current directory, shows meaningful setup errors, and explains how to stop it. Verify Windows process cleanup rather than assuming POSIX signals behave identically.` : platform === "macOS" ? `MACOS DELIVERY
Provide Terminal instructions for Apple Silicon and Intel Macs. Detect architecture and existing Node.js/FFmpeg; use official Node.js or a verified Homebrew installation route. Account for /opt/homebrew/bin versus /usr/local/bin and allow an explicit FFmpeg path. Keep libx264 software conversion as the compatibility baseline; hardware encoding is optional and must not alter the protocol. Supply a start script with correct script-relative paths and instructions for chmod +x, starting and stopping it. Explain that the browser/OS may prompt for local-network access. Any LaunchAgent/login startup is optional and must include uninstall instructions.` : `LINUX DELIVERY
Provide shell instructions for Debian/Ubuntu and Fedora, noting that package availability differs by distribution. Detect existing Node.js and FFmpeg; verify current official installation guidance and that FFmpeg includes libx264 and AAC encoders. Do not assume every distro FFmpeg package has the same encoders. Supply a script with correct script-relative paths, executable-permission instructions, and start/stop commands. Run as a normal user, not root. Any systemd user service is optional and must include uninstall instructions. Do not open a firewall port or bind on all interfaces.`}

DELIVERABLES AND ACCEPTANCE TESTS
Return complete files (server.mjs, package.json with a start script, .env.example, .gitignore, README, OS start script and meaningful tests), plus a reproducible dependency lockfile or instructions to generate one. Do not return pseudocode or require this original project. Explain how to paste the files into a folder, install dependencies, confirm FFmpeg, configure the origin/provider, start the helper, open the existing website on this same computer, choose Local fast or Local compatibility, and allow browser local-network access when prompted.
Test health with the correct Origin; forbidden/missing Origin and wrong Host; preflight; malformed/oversized JSON; disallowed source/protocol; both modes; session limits; duplicate stream GET; origin ownership; expiry; deletion/disconnect/shutdown process cleanup; missing FFmpeg and upstream failure. Use a generated short test video and temporary local fixture provider explicitly allowed only in tests. Verify output codecs with ffprobe and actual advancing video frames in desktop Chrome/Edge. Do not disable web security for tests. Report exactly what passed and what could not be verified. Never use real IPTV secrets in fixtures.
Explain limitations: no seeking/resume, subtitles or alternate audio selection in this version; VOD starts at the beginning; compatibility can consume substantial CPU for 4K; provider access/account restrictions remain; the helper runs on the viewing computer; website/catalogue traffic still uses Vercel but local-mode video does not. Troubleshoot port conflicts, PATH/FFmpeg problems, origin mismatch, provider allowlist mismatch, local-network permission, no picture in fast mode, and provider outages separately.
`;
}
