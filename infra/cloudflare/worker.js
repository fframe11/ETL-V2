/**
 * Cloudflare Worker - Data Serve Unified Edge Gateway
 * 
 * Routes incoming traffic seamlessly between:
 * 1. /api/* -> Backend API Service (FastAPI / SDOQAP Serving Layer)
 * 2. /*     -> Frontend Vercel Deployment (Vite SPA)
 * 
 * Provides unified single-origin domain, zero CORS friction,
 * automatic SSL/TLS termination, and security headers.
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Security & Anti-Abuse Headers
    const securityHeaders = {
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "SAMEORIGIN",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()"
    };

    // Route 1: Backend API Gateway (/api/* and /healthz)
    if (url.pathname.startsWith('/api/') || url.pathname === '/healthz' || url.pathname === '/health') {
      const backendBase = (env.BACKEND_URL || 'https://indices-cornell-burlington-physician.trycloudflare.com').replace(/\/+$/, '');
      const targetUrl = new URL(url.pathname + url.search, backendBase);

      const modifiedHeaders = new Headers(request.headers);
      modifiedHeaders.set("X-Forwarded-Host", url.hostname);
      modifiedHeaders.set("X-Forwarded-Proto", url.protocol.replace(':', ''));
      modifiedHeaders.set("X-Real-IP", request.headers.get("CF-Connecting-IP") || "");

      const backendRequest = new Request(targetUrl, {
        method: request.method,
        headers: modifiedHeaders,
        body: request.body,
        redirect: 'follow'
      });

      try {
        const response = await fetch(backendRequest);
        const responseHeaders = new Headers(response.headers);
        for (const [key, val] of Object.entries(securityHeaders)) {
          responseHeaders.set(key, val);
        }
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders
        });
      } catch (err) {
        return new Response(JSON.stringify({
          error: "Backend Service Unavailable",
          detail: "Unable to reach backend upstream via Cloudflare Edge Gateway.",
          timestamp: new Date().toISOString()
        }), {
          status: 502,
          headers: {
            "Content-Type": "application/json",
            ...securityHeaders
          }
        });
      }
    }

    // Route 2: Frontend Vercel SPA (/*)
    const frontendBase = (env.FRONTEND_URL || 'https://data-serve.vercel.app').replace(/\/+$/, '');
    const frontendTargetUrl = new URL(url.pathname + url.search, frontendBase);

    const frontendRequest = new Request(frontendTargetUrl, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      redirect: 'follow'
    });

    try {
      const response = await fetch(frontendRequest);
      const responseHeaders = new Headers(response.headers);
      for (const [key, val] of Object.entries(securityHeaders)) {
        responseHeaders.set(key, val);
      }
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders
      });
    } catch (err) {
      return new Response("Frontend Service Temporarily Unavailable", {
        status: 502,
        headers: securityHeaders
      });
    }
  }
};
