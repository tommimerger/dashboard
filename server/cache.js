// server/cache.js
/**
 * Tiny TTL memory cache middleware; key is req.originalUrl.
 * Use only for public GET endpoints.
 */
export function withCache(ttlSeconds = 60) {
  const store = new Map();

  return (req, res, next) => {
    if (req.method !== "GET") return next();
    const key = req.originalUrl;
    const hit = store.get(key);
    const now = Date.now();

    if (hit && now - hit.time < ttlSeconds * 1000) {
      res.set("X-Cache", "HIT");
      return res.json(hit.payload);
    }

    const json = res.json.bind(res);
    res.json = (payload) => {
      store.set(key, { time: now, payload });
      res.set("X-Cache", "MISS");
      return json(payload);
    };
    next();
  };
}
