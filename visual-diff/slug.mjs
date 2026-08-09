// Shared route -> filename-slug sanitizer. Imported by both shoot.mjs (to name
// screenshots) and diff.mjs (to locate them), so the two can never diverge and
// silently misreport routes as unchanged.
export const san = (r) => (r === '/' ? 'home' : r.replace(/^\/|\/$/g, '').replace(/\//g, '__'));
