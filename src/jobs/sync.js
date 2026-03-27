import { fetchBuilderA } from "../connectors/builderA.js";
import { fetchBuilderB } from "../connectors/builderB.js";
import { fetchBuilderC } from "../connectors/builderC.js";
import { normalizeListing } from "../utils/normalize.js";

export async function runSync() {
  const [a, b, c] = await Promise.all([
    fetchBuilderA(),
    fetchBuilderB(),
    fetchBuilderC(),
  ]);

  const merged = [...a, ...b, ...c].map(normalizeListing);

  const dedup = new Map();
  for (const item of merged) dedup.set(item.sourceUrl, item);

  return Array.from(dedup.values());
}
