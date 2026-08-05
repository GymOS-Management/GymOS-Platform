import type { NextConfig } from 'next';

/**
 * The API is proxied under this app's own origin (F1-DESIGN.md D1).
 *
 * This is not a convenience. The backend's refresh cookie is
 * `HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth` and the API configures no CORS at all, so a
 * console served from a different origin fails twice: the browser blocks the call, and the cookie
 * would not be attached even if it didn't.
 *
 * Two things here are load-bearing:
 *
 * 1. **The path is preserved exactly.** The cookie's `Path=/api/v1/auth` is matched against the
 *    URL the *browser* sees, so `/api/v1/...` must stay `/api/v1/...` on this side of the proxy.
 *    Rewriting to `/api/auth/...` would silently stop the cookie being sent on refresh.
 * 2. **Production must keep this shape** — one public origin with `/api/*` routed to the API
 *    (Azure Front Door or App Service routing, AD-11). A deployment that splits the origins breaks
 *    refresh *after* login appears to work, which is the worst way for it to break.
 */
const apiOrigin = process.env.GYMOS_API_ORIGIN ?? 'http://localhost:5080';

const nextConfig: NextConfig = {
  reactStrictMode: true,

  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: `${apiOrigin}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
