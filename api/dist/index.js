// src/index.ts
var GITHUB_API_URL = "https://api.github.com/repos/mbenhard/untask/releases/latest";
var CACHE_TTL = 300;
var index_default = {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname !== "/api/updates/latest") {
      return new Response("Not Found", { status: 404 });
    }
    if (request.method !== "GET") {
      return new Response("Method Not Allowed", { status: 405 });
    }
    const cache = caches.default;
    const cacheKey = new Request(url.toString(), { method: "GET" });
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
    const res = await fetch(GITHUB_API_URL, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": request.headers.get("User-Agent") || "untask-api"
      }
    });
    if (!res.ok) {
      return new Response("Upstream error", { status: 502 });
    }
    const response = new Response(res.body, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": `public, max-age=${CACHE_TTL}`,
        "Access-Control-Allow-Origin": "*"
      }
    });
    await cache.put(cacheKey, response.clone());
    return response;
  }
};
export {
  index_default as default
};
//# sourceMappingURL=index.js.map
