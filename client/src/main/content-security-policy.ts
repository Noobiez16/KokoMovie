// The renderer loads local modules. Providers run in isolated frames/windows,
// so their script origins do not belong in the privileged renderer's policy.
export const PRODUCTION_RENDERER_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline' https:",
  "media-src 'self' blob: https: http: offline:",
  "connect-src 'self' http://localhost:* http://127.0.0.1:* https: offline:",
  "img-src 'self' data: blob: https: catalog-cache: offline:",
  "frame-src https:",
  "font-src 'self' data: https:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

export function rendererContentSecurityPolicy(development: boolean): string {
  if (!development) return PRODUCTION_RENDERER_CSP
  return PRODUCTION_RENDERER_CSP
    .replace("script-src 'self'", "script-src 'self' 'unsafe-inline' 'unsafe-eval'")
    .replace("connect-src 'self'", "connect-src 'self' ws://localhost:*")
}
