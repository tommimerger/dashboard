// server/rateLimit.js
/**
 * Tiny in-memory rate limiter (good enough on Render single instance).
 * For multi-instance, swap to Redis-backed limiter.
 */
export default function rateLimit({ windowMs = 60_000, max = 60 } = {}) {
  const hits = new Map();

  setInterval(() => hits.clear(), windowMs).unref?.();

  return (req, res, next) => {
    const key = req.ip || req.headers["x-forwarded-for"] || "global";
    const count = (hits.get(key) || 0) + 1;
    hits.set(key, count);
    if (count > max) {
      res.set("Retry-After", String(Math.ceil(windowMs / 1000)));
      return res.status(429).json({ error: "Too many requests" });
    }
    next();
  };
}
