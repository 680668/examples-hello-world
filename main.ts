// Freebuff API reverse proxy for Deno Deploy
// Forwards all requests to freebuff.com so the upstream sees Deno Deploy's US IP
// Usage: set NEXT_PUBLIC_FREEBUFF_APP_URL=https://<project>.deno.dev before running freebuff

const UPSTREAM = Deno.env.get("UPSTREAM_ORIGIN") || "https://freebuff.com";

const HOP_BY_HOP = new Set([
  "host",
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "cf-connecting-ip",
  "cf-ipcountry",
  "cf-ray",
  "cf-visitor",
  "cf-ew-via",
  "x-forwarded-for",
  "x-forwarded-proto",
  "x-forwarded-host",
  "x-real-ip",
  "true-client-ip",
  "via",
]);

function buildForwardHeaders(incoming: Headers): Headers {
  const out = new Headers();
  for (const [key, value] of incoming.entries()) {
    if (!HOP_BY_HOP.has(key.toLowerCase())) {
      out.set(key, value);
    }
  }
  return out;
}

function buildResponseHeaders(upstream: Headers): Headers {
  const out = new Headers();
  for (const [key, value] of upstream.entries()) {
    const lower = key.toLowerCase();
    if (lower === "content-encoding") continue;
    if (lower === "content-length") continue;
    if (lower === "transfer-encoding") continue;
    if (lower === "connection") continue;
    if (lower === "set-cookie") {
      out.append("set-cookie", value.replace(/;\s*domain=[^;]*/i, ""));
    } else {
      out.set(key, value);
    }
  }
  return out;
}

async function handleHttp(req: Request): Promise<Response> {
  const incomingUrl = new URL(req.url);
  const targetUrl = `${UPSTREAM}${incomingUrl.pathname}${incomingUrl.search}`;
  const headers = buildForwardHeaders(req.headers);

  const init: RequestInit = {
    method: req.method,
    headers,
    redirect: "manual",
  };

  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = req.body;
    (init as any).duplex = "half";
  }

  let upstream: Response;
  try {
    upstream = await fetch(targetUrl, init);
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "upstream_fetch_failed", detail: String(err) }),
      { status: 502, headers: { "content-type": "application/json" } },
    );
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: buildResponseHeaders(upstream.headers),
  });
}

function handleWebSocket(req: Request): Response {
  const incomingUrl = new URL(req.url);
  const targetUrl =
    UPSTREAM.replace(/^http/, "ws") +
    incomingUrl.pathname +
    incomingUrl.search;

  const { socket: clientSocket, response } = Deno.upgradeWebSocket(req);
  const serverSocket = new WebSocket(targetUrl);

  serverSocket.onopen = () => {
    serverSocket.binaryType = "arraybuffer";
    clientSocket.binaryType = "arraybuffer";
  };
  clientSocket.onmessage = (ev) => {
    if (serverSocket.readyState === WebSocket.OPEN) serverSocket.send(ev.data);
  };
  serverSocket.onmessage = (ev) => {
    if (clientSocket.readyState === WebSocket.OPEN) clientSocket.send(ev.data);
  };
  clientSocket.onclose = (ev) => {
    try { serverSocket.close(ev.code, ev.reason); } catch { /* noop */ }
  };
  serverSocket.onclose = (ev) => {
    try { clientSocket.close(ev.code, ev.reason); } catch { /* noop */ }
  };
  clientSocket.onerror = () => { try { serverSocket.close(); } catch { /* noop */ } };
  serverSocket.onerror = () => { try { clientSocket.close(); } catch { /* noop */ } };

  return response;
}

Deno.serve((req: Request) => {
  const upgrade = req.headers.get("upgrade") || "";
  if (upgrade.toLowerCase() === "websocket") {
    return handleWebSocket(req);
  }
  return handleHttp(req);
});
