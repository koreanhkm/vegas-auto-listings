import axios from "axios";

function parseNumber(value) {
  if (value === null || value === undefined) return 0;
  const cleaned = String(value).replace(/[^\d.]/g, "");
  if (!cleaned) return 0;
  return Number(cleaned);
}

function pickFirstString(...vals) {
  for (const val of vals) {
    if (typeof val === "string" && val.trim()) return val.trim();
  }
  return "";
}

function getEnv(name, fallback = "") {
  return (process.env[name] || fallback).trim();
}

async function algoliaMultiQuery({ appId, apiKey, requests }) {
  const url = `https://${appId}-dsn.algolia.net/1/indexes/*/queries`;
  const res = await axios.post(
    url,
    { requests },
    {
      timeout: 25000,
      headers: {
        "content-type": "application/json",
        "x-algolia-application-id": appId,
        "x-algolia-api-key": apiKey,
        // keep UA minimal; Algolia is usually fine
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    }
  );
  return res?.data?.results || [];
}

function mapHitToListing(hit) {
  // Tri Pointe Algolia fields (confirmed from your Response JSON)
  const community = pickFirstString(hit.community, hit.neighborhood) || "";
  const plan = pickFirstString(hit.floor_plan, hit.title, hit.floorplan) || "";
  const city = Array.isArray(hit.cities) ? pickFirstString(hit.cities[0], "Las Vegas") : "Las Vegas";

  const price = parseNumber(pickFirstString(hit.display_price, hit.min_price, hit.max_price));
  const wasPrice = 0; // not present in this index response

  const beds = parseNumber(pickFirstString(hit.min_bedrooms, hit.max_bedrooms));
  const baths = parseNumber(pickFirstString(hit.min_bathrooms, hit.max_bathrooms));
  const sqft = parseNumber(pickFirstString(hit.min_sq_feet, hit.max_sq_feet));

  const status = pickFirstString(hit.home_status, hit.availability_status);
  const badge = pickFirstString(hit.type, hit.tpg_status);

  const imageUrl = pickFirstString(
    hit?.image?.medium_large,
    hit?.image?.medium,
    hit?.image?.large,
    hit?.image?.thumbnail,
    hit?.neighborhood_data?.image?.medium_large,
    hit?.neighborhood_data?.image?.medium,
    hit?.neighborhood_data?.image?.thumbnail
  );

  const rel = pickFirstString(hit.url);
  const sourceUrl = rel ? `https://www.tripointehomes.com${rel}` : "";

  const promoHeadline = pickFirstString(hit?.promotion?.headline);
  const promoType = pickFirstString(hit?.promotion?.type);
  const incentive = promoHeadline ? `${promoType ? `${promoType}: ` : ""}${promoHeadline}` : "";

  return {
    builder: "Tri Pointe Homes",
    community,
    plan,
    city,
    price,
    wasPrice,
    beds,
    baths,
    sqft,
    status,
    badge,
    imageUrl,
    incentive,
    sourceUrl,
  };
}

export async function fetchBuilderB() {
  const appId = getEnv("BUILDER_B_ALGOLIA_APP_ID");
  const apiKey = getEnv("BUILDER_B_ALGOLIA_API_KEY");
  const marketSlug = getEnv("BUILDER_B_MARKET_SLUG", "las-vegas");

  if (!appId || !apiKey) {
    console.warn("[BuilderB] Missing BUILDER_B_ALGOLIA_APP_ID or BUILDER_B_ALGOLIA_API_KEY.");
    return [];
  }

  // Use the same index your Response shows for Las Vegas sorted by price.
  const indexName = getEnv("BUILDER_B_INDEX", "production_homes_price_asc");
  const hitsPerPage = Number(getEnv("BUILDER_B_HITS_PER_PAGE", "60")) || 60;

  // Match your payload: submarket + type filters, bedrooms >= 2, exclude sold.
  const facetFiltersObj = [
    [`submarket_slug:${marketSlug}`],
    ["type:Available Home"],
  ];
  const numericFiltersObj = ["max_bedrooms >= 2"];
  const filters = 'NOT home_status:"Sold"';

  const params = [
    "query=",
    "page=0",
    `hitsPerPage=${encodeURIComponent(String(hitsPerPage))}`,
    `facets=${encodeURIComponent(JSON.stringify(["type"]))}`,
    `facetFilters=${encodeURIComponent(JSON.stringify(facetFiltersObj))}`,
    `numericFilters=${encodeURIComponent(JSON.stringify(numericFiltersObj))}`,
    `filters=${encodeURIComponent(filters)}`,
  ].join("&");

  const results = await algoliaMultiQuery({
    appId,
    apiKey,
    requests: [{ indexName, params }],
  });

  const hits = results?.[0]?.hits || [];
  const mapped = hits.map(mapHitToListing).filter((x) => x.sourceUrl);

  // Dedup by sourceUrl
  const dedup = new Map();
  for (const row of mapped) {
    if (row.sourceUrl) dedup.set(row.sourceUrl, row);
  }
  return Array.from(dedup.values());
}
