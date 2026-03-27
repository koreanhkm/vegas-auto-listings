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
  const community =
    pickFirstString(
      hit.community_name,
      hit.community,
      hit.communityTitle,
      hit.communityName,
      hit.mpc_name,
      hit.mpc,
      hit.neighborhood
    ) || "";

  const plan =
    pickFirstString(
      hit.title,
      hit.name,
      hit.floorplan_name,
      hit.floorplan,
      hit.plan_name,
      hit.plan
    ) || "";

  const city =
    pickFirstString(
      hit.city,
      hit.cityName,
      hit.city_name,
      hit.market_name,
      "Las Vegas"
    ) || "Las Vegas";

  const price = parseNumber(
    pickFirstString(
      hit.display_price,
      hit.price,
      hit.min_price,
      hit.starting_price,
      hit.base_price
    )
  );
  const wasPrice = parseNumber(pickFirstString(hit.was_price, hit.previous_price));

  const beds = parseNumber(pickFirstString(hit.bedrooms, hit.beds, hit.max_bedrooms));
  const baths = parseNumber(pickFirstString(hit.bathrooms, hit.baths, hit.max_bathrooms));
  const sqft = parseNumber(pickFirstString(hit.sqft, hit.square_feet, hit.max_sqft));

  const status = pickFirstString(
    hit.home_status,
    hit.status,
    hit.availability,
    hit.availability_status
  );

  const badge = pickFirstString(hit.badge, hit.label, hit.tag);

  const imageUrl = pickFirstString(
    hit.image,
    hit.image_url,
    hit.imageUrl,
    hit.thumbnail,
    hit.thumbnail_url,
    hit.photo
  );

  const sourceUrl =
    pickFirstString(hit.url, hit.permalink, hit.absolute_url, hit.link) ||
    (hit.slug ? `https://www.tripointehomes.com${hit.slug}` : "");

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
    // incentives often live on the detail page; keep empty for now
    incentive: "",
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

  // These indices were visible in your payload; homes index is the one we want to render.
  const homesIndex = getEnv("BUILDER_B_HOMES_INDEX", "production_homes");
  const hitsPerPage = Number(getEnv("BUILDER_B_HITS_PER_PAGE", "60")) || 60;

  // Match your payload intent: exclude sold out, and require at least 2 bedrooms.
  const facetFilters = JSON.stringify([[`submarket_slug:${marketSlug}`]]);
  const numericFilters = encodeURIComponent("max_bedrooms >= 2");
  const filters = encodeURIComponent('NOT home_status:"Sold Out"');

  const params = `query=&page=0&hitsPerPage=${hitsPerPage}&facetFilters=${encodeURIComponent(
    facetFilters
  )}&numericFilters=${numericFilters}&filters=${filters}`;

  const results = await algoliaMultiQuery({
    appId,
    apiKey,
    requests: [{ indexName: homesIndex, params }],
  });

  const hits = results?.[0]?.hits || [];
  const mapped = hits.map(mapHitToListing);

  // Dedup by sourceUrl
  const dedup = new Map();
  for (const row of mapped) {
    if (row.sourceUrl) dedup.set(row.sourceUrl, row);
  }
  return Array.from(dedup.values());
}
