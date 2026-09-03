const OPENAI_API_HOST = "api.groq.com";

// Groq 不支持、需要在中转层剔除的请求参数
const STRIP_FIELDS = ["enable_thinking", "thinking"];

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
  // 对 JSON 请求体，剔除 Groq 不支持的字段（如 enable_thinking）
  if (request.method === "POST" && contentType.includes("application/json")) {
    try {
      const raw = await request.text();
      const json = JSON.parse(raw);
      for (const field of STRIP_FIELDS) {
        if (field in json) delete json[field];
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
