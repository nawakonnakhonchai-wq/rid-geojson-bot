const ORIGIN = "https://nawakonnakhonchai-wq.github.io";
const OWNER = "nawakonnakhonchai-wq";
const REPO = "rid-geojson-bot";
const WORKFLOW = "run_all_repos.yml";
const API = "https://api.github.com";

function cors(origin) {
  return {
    "Access-Control-Allow-Origin": origin === ORIGIN ? ORIGIN : "null",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function reply(body, status, headers) {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

async function secretMatches(received, expected) {
  if (!received || !expected) return false;
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(received)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const aa = new Uint8Array(a);
  const bb = new Uint8Array(b);
  let mismatch = 0;
  for (let i = 0; i < aa.length; i++) mismatch |= aa[i] ^ bb[i];
  return mismatch === 0;
}

async function github(path, token, options = {}) {
  return fetch(API + path, {
    ...options,
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": "Bearer " + token,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const headers = cors(origin);

    if (request.method === "OPTIONS") {
      if (origin !== ORIGIN) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers });
    }
    if (origin !== ORIGIN) return reply({ error: "forbidden_origin" }, 403, headers);

    const url = new URL(request.url);
    if (url.pathname === "/health" && request.method === "GET") {
      return reply({ ok: true }, 200, headers);
    }
    if (url.pathname !== "/run" || request.method !== "POST") {
      return reply({ error: "not_found" }, 404, headers);
    }

    const token = env.GITHUB_DISPATCH_TOKEN;
    const runKey = env.RUN_KEY;
    if (!token || !runKey) return reply({ error: "service_not_configured" }, 503, headers);

    const authorization = request.headers.get("Authorization") || "";
    const suppliedKey = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!(await secretMatches(suppliedKey, runKey))) {
      return reply({ error: "unauthorized" }, 401, headers);
    }

    // Avoid accidentally queueing duplicate daily batches.
    for (const status of ["queued", "in_progress"]) {
      const active = await github(
        "/repos/" + OWNER + "/" + REPO + "/actions/workflows/" + WORKFLOW + "/runs?status=" + status + "&per_page=1",
        token,
      );
      if (!active.ok) return reply({ error: "github_status_unavailable" }, 502, headers);
      const data = await active.json();
      if ((data.workflow_runs || []).length) {
        const run = data.workflow_runs[0];
        return reply({ error: "already_running", runUrl: run.html_url || null }, 409, headers);
      }
    }

    const dispatch = await github(
      "/repos/" + OWNER + "/" + REPO + "/actions/workflows/" + WORKFLOW + "/dispatches",
      token,
      { method: "POST", body: JSON.stringify({ ref: "main" }) },
    );
    if (!dispatch.ok) {
      return reply({ error: "dispatch_failed", status: dispatch.status }, 502, headers);
    }
    return reply({ ok: true }, 202, headers);
  },
};
