const OPENAI_API_HOST = "api.groq.com";

// Groq 不支持、需要在中转层剔除的请求参数
const STRIP_FIELDS = ["enable_thinking", "thinking"];
// Groq 对 tools 数量的上限
const MAX_TOOLS = 128;
// 拉取模型上限失败时的兑底 max_tokens
const FALLBACK_MAX_TOKENS = 16384;
const LIMITS_TTL_MS = 60 * 60 * 1000; // 模型上限缓存 1 小时

// model -> max_completion_tokens 缓存
let modelLimits = {};
let limitsFetchedAt = 0;

async function getModelLimits(authHeader) {
  const now = Date.now();
  if (Object.keys(modelLimits).length > 0 && now - limitsFetchedAt < LIMITS_TTL_MS) {
    return modelLimits;
  }
  try {
    const resp = await fetch(`https://${OPENAI_API_HOST}/openai/v1/models`, {
      headers: { authorization: authHeader },
    });
    if (resp.ok) {
      const data = await resp.json();
      const map = {};
      for (const m of data.data || []) {
        const cap = m.max_completion_tokens ?? m.max_output_length;
        if (cap) map[m.id] = cap;
      }
      if (Object.keys(map).length > 0) {
        modelLimits = map;
        limitsFetchedAt = now;
      }
    }
  } catch {
    // 拉取失败则使用缓存或兑底值
  }
  return modelLimits;
}

Deno.serve(async (request) => {
  // 处理 CORS 预检请求
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  // 把请求转发到 Groq 官方 API
  const url = new URL(request.url);
  url.host = OPENAI_API_HOST;

  let body = request.body;
  const contentType = request.headers.get("content-type") || "";
  // 对 JSON 请求体做兼容处理
  if (request.method === "POST" && contentType.includes("application/json")) {
    try {
      const raw = await request.text();
      const json = JSON.parse(raw);
      // 1) 剔除 Groq 不支持的字段（如 enable_thinking）
      for (const field of STRIP_FIELDS) {
        if (field in json) delete json[field];
      }
      // 2) tools 数量超过 Groq 上限时截断
      if (Array.isArray(json.tools) && json.tools.length > MAX_TOOLS) {
        json.tools = json.tools.slice(0, MAX_TOOLS);
      }
      // 3) max_tokens 超过该模型上限时钳制到合法值
      if (typeof json.max_tokens === "number") {
        const limits = await getModelLimits(request.headers.get("authorization") || "");
        const cap = limits[json.model] || FALLBACK_MAX_TOKENS;
        if (json.max_tokens > cap) json.max_tokens = cap;
      }
      body = JSON.stringify(json);
    } catch {
      body = request.body; // JSON 解析失败则原样转发
    }
  }

  const newRequest = new Request(url.toString(), {
    headers: request.headers,
    method: request.method,
    body,
    redirect: "follow",
  });

  const response = await fetch(newRequest);
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  return new Response(response.body, {
    status: response.status,
    headers,
  });
});
