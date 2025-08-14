// server/server.js
import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";
import rateLimit from "./rateLimit.js";
import { withCache } from "./cache.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
// View engine (EJS) for optional server-side rendering
app.set("views", path.join(__dirname, "..", "views"));
app.set("view engine", "ejs");

// --- Config ---
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || "production";

// Weather provider (OpenWeather as example)
const WEATHER_BASE = "https://api.openweathermap.org/data/2.5";
const WEATHER_KEY = process.env.OPENWEATHER_API_KEY; // set this on Render

// Restrict who can use your API (optional: list your sites)
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

// CORS
app.use(
  cors({
    origin(origin, cb) {
      // allow same-origin / server-to-server / or no Origin header (mobile apps)
      if (!origin || ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin)) {
        return cb(null, true);
      }
      return cb(new Error("Not allowed by CORS"));
    },
    credentials: false,
  })
);

// JSON (if you add POST endpoints later)
app.use(express.json({ limit: "1mb" }));

// Static assets
app.use(express.static(path.join(__dirname, "..", "public"), { maxAge: "1h" }));

// Health
app.get("/healthz", (req, res) => res.json({ ok: true, ts: Date.now() }));

// ------- API: timezone helpers (Luxon-like without client libs) -------
/**
 * Compute "now" in a given IANA timezone and format it as "h:mm a".
 * This is intentionally simple; your frontend can still do its own formatting.
 */
app.get("/api/time", (req, res) => {
  const tz = req.query.tz || "Asia/Singapore";
  try {
    const now = new Date();
    // Intl.DateTimeFormat handles IANA zones server-side
    const fmt = new Intl.DateTimeFormat("en-SG", {
      timeZone: tz,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(now);

    res.json({ tz, now: fmt });
  } catch (err) {
    res.status(400).json({ error: "Invalid timezone", details: String(err) });
  }
});

// ------- API: weather proxy (secure key, cache + rate-limit) -------
const weatherLimiter = rateLimit({
  windowMs: 60_000, // 1 minute
  max: 60,          // 60 req/min per IP (tune as you like)
});

// Example: /api/weather?lat=1.3521&lon=103.8198&units=metric
// or /api/weather?q=Singapore&units=metric
app.get(
  "/api/weather",
  weatherLimiter,
  withCache(60), // cache 60s at the server to cut API calls
  async (req, res) => {
    if (!WEATHER_KEY) {
      return res.status(500).json({ error: "Weather API key not configured" });
    }

    const { q, lat, lon, units = "metric" } = req.query;

    if (!q && (!lat || !lon)) {
      return res.status(400).json({ error: "Provide ?q=City or ?lat=..&lon=.." });
    }

    // Build OpenWeather URL
    const search = q
      ? `${WEATHER_BASE}/weather?q=${encodeURIComponent(q)}&appid=${WEATHER_KEY}&units=${units}`
      : `${WEATHER_BASE}/weather?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(
          lon
        )}&appid=${WEATHER_KEY}&units=${units}`;

    try {
      const resp = await fetch(search, { timeout: 10_000 });
      if (!resp.ok) {
        const text = await resp.text();
        return res.status(resp.status).json({ error: "Upstream error", details: text });
      }
      const data = await resp.json();

      // Trim to only what you need
      const slim = {
        name: data.name,
        coord: data.coord,
        weather: data.weather?.[0]?.main || "N/A",
        description: data.weather?.[0]?.description || "N/A",
        temp: data.main?.temp ?? null,
        feels_like: data.main?.feels_like ?? null,
        sunrise: data.sys?.sunrise ?? null,
        sunset: data.sys?.sunset ?? null,
        dt: data.dt,
      };
      res.set("Cache-Control", "public, max-age=60");
      return res.json(slim);
    } catch (err) {
      return res.status(502).json({ error: "Fetch failed", details: String(err) });
    }
  }
);

// (optional) SSR route placeholder if you want server-side cards later
app.get("/", (req, res) => {
  res.render("index", {
    title: "Timezone Dashboard",
    content: "",
    data: {},
  });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT} (${NODE_ENV})`);
});
