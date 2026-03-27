import { fetchBuilderA } from "../connectors/builderA.js";
import { fetchBuilderB } from "../connectors/builderB.js";
import { fetchBuilderC } from "../connectors/builderC.js";
import { normalizeListing } from "../utils/normalize.js";

export async function runSync() {
  const results = await Promise.allSettled([
    fetchBuilderA(),
    fetchBuilderB(),
    fetchBuilderC(),
  ]);

  const [a, b, c] = results.map((r, idx) => {
    if (r.status === "fulfilled") return r.value;
    console.warn(`[SYNC] connector ${idx + 1} failed: ${r.reason?.message || r.reason}`);
    return [];
  });

  const merged = [...a, ...b, ...c].map(normalizeListing);

  const dedup = new Map();
  for (const item of merged) dedup.set(item.sourceUrl, item);

  return Array.from(dedup.values());
}
