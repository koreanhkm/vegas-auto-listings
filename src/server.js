import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import cron from "node-cron";
import path from "path";
import { fileURLToPath } from "url";
import { runSync } from "./jobs/sync.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let listingsCache = [];
let lastSyncAt = null;

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.get("/api/listings", (req, res) => {
  res.json({
    count: listingsCache.length,
    lastSyncAt,
    items: listingsCache,
  });
});

app.post("/api/sync", async (req, res) => {
  try {
    const items = await runSync();
    listingsCache = items;
    lastSyncAt = new Date().toISOString();
    res.json({ ok: true, count: items.length, lastSyncAt });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server is live at http://localhost:${PORT}`);
});

const schedule = process.env.CRON_SCHEDULE || "0 */6 * * *";
cron.schedule(schedule, async () => {
  try {
    const items = await runSync();
    listingsCache = items;
    lastSyncAt = new Date().toISOString();
    console.log(`[CRON] synced ${items.length} items at ${lastSyncAt}`);
  } catch (err) {
    console.error("[CRON] sync failed:", err.message);
  }
});
