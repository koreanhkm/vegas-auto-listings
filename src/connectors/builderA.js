import axios from "axios";
import * as cheerio from "cheerio";

const DEFAULT_CITY = "Las Vegas";
const INCENTIVE_REGEX =
  /(incentive|special|promotion|promo|rate buy.?down|closing cost|credit|bonus)/i;

function parseUrlsFromEnv() {
  return (process.env.BUILDER_A_URLS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseLotIdsFromEnv() {
  return (process.env.BUILDER_A_LOT_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function pickFirstString(...vals) {
  for (const val of vals) {
    if (typeof val === "string" && val.trim()) return val.trim();
  }
  return "";
}

function parseNumber(value) {
  if (value === null || value === undefined) return 0;
  const cleaned = String(value).replace(/[^\d.]/g, "");
  if (!cleaned) return 0;
  return Number(cleaned);
}

async function fetchViaGraphql(lotIds) {
  const query = `query GetHomesiteDetails($lotIds: [String!]!) {
  homesiteList(lotIds: $lotIds) {
    id
    elevationImage {
      image {
        url
        alt
      }
    }
    name
    number
    closingCostIncentive
    status
    badge
    address
    baths
    halfBaths
    beds
    price
    wasPrice
    formattedPrice
    sqft
    url
    lotid
    plan {
      name
      url
      community {
        name
        cityName
        stateCode
      }
    }
  }
}`;

  const res = await axios.post(
    "https://www.lennar.com/api/graphql",
    {
      operationName: "GetHomesiteDetails",
      variables: { lotIds },
      query,
    },
    {
      timeout: 25000,
      headers: {
        accept: "*/*",
        "content-type": "application/json",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        // Lennar blocks obvious bot headers; keep it minimal.
        referer: "https://www.lennar.com/",
      },
    }
  );

  const homes = res?.data?.data?.homesiteList || [];
  return homes.map((h) => {
    const community = h?.plan?.community?.name || "";
    const city = h?.plan?.community?.cityName || DEFAULT_CITY;
    const plan = h?.plan?.name || h?.name || "";
    const imageUrl = h?.elevationImage?.image?.url || "";
    const status = String(h?.status || "").trim();
    const badge = String(h?.badge || "").trim();
    const wasPrice = parseNumber(h?.wasPrice);
    const incentive = h?.closingCostIncentive
      ? `Closing cost incentive: ${h.closingCostIncentive}`
      : "";
    const sourceUrl = h?.url
      ? h.url.startsWith("http")
        ? h.url
        : `https://www.lennar.com${h.url}`
      : "";

    return {
      builder: "Lennar",
      community,
      plan,
      city,
      price: parseNumber(h?.price || h?.formattedPrice),
      wasPrice,
      beds: parseNumber(h?.beds),
      baths: parseNumber(h?.baths) + (parseNumber(h?.halfBaths) ? 0.5 : 0),
      sqft: parseNumber(h?.sqft),
      incentive,
      status,
      badge,
      imageUrl,
      sourceUrl,
    };
  });
}

function extractIncentiveText($) {
  const candidates = $("body")
    .text()
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  const hit = candidates.find((line) => INCENTIVE_REGEX.test(line));
  return hit || "";
}

function parseJsonLdObjects($) {
  const objects = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text();
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        objects.push(...parsed);
      } else if (parsed && Array.isArray(parsed["@graph"])) {
        objects.push(...parsed["@graph"]);
      } else if (parsed) {
        objects.push(parsed);
      }
    } catch {
      // ignore malformed JSON-LD blocks
    }
  });
  return objects;
}

function fromJsonLd(obj, fallbackUrl, fallbackIncentive) {
  const offers = obj.offers || {};
  const floorSize = obj.floorSize || {};

  const sourceUrl = pickFirstString(obj.url, fallbackUrl);
  if (!sourceUrl) return null;

  const price = parseNumber(offers.price || obj.price);
  const beds = parseNumber(obj.numberOfRooms || obj.numberOfBedrooms || obj.beds);
  const baths = parseNumber(obj.numberOfBathroomsTotal || obj.bathrooms || obj.baths);
  const sqft = parseNumber(
    floorSize.value || floorSize.maxValue || obj.floorSize || obj.sqft
  );

  return {
    builder: "Builder A",
    community: pickFirstString(obj.addressLocality, obj.areaServed, ""),
    plan: pickFirstString(obj.name, obj.headline, "Listing"),
    city: pickFirstString(obj.addressLocality, DEFAULT_CITY),
    price,
    beds,
    baths,
    sqft,
    incentive: fallbackIncentive,
    sourceUrl,
  };
}

function extractFromCards($, pageUrl, incentive) {
  const cards = [];
  $(".card, .listing, .home-card, [data-testid*='card']").each((_, el) => {
    const box = $(el);
    const sourceUrl = pickFirstString(
      box.find("a[href]").first().attr("href"),
      pageUrl
    );
    const absoluteUrl = sourceUrl.startsWith("http")
      ? sourceUrl
      : new URL(sourceUrl, pageUrl).toString();

    cards.push({
      builder: "Builder A",
      community: pickFirstString(
        box.find(".community, [data-community]").first().text(),
        ""
      ),
      plan: pickFirstString(
        box.find("h2, h3, .plan-name, [data-plan]").first().text(),
        "Listing"
      ),
      city: DEFAULT_CITY,
      price: parseNumber(
        pickFirstString(
          box.find(".price, [data-price]").first().text(),
          box.attr("data-price")
        )
      ),
      beds: parseNumber(
        pickFirstString(
          box.find(".beds, [data-beds]").first().text(),
          box.attr("data-beds")
        )
      ),
      baths: parseNumber(
        pickFirstString(
          box.find(".baths, [data-baths]").first().text(),
          box.attr("data-baths")
        )
      ),
      sqft: parseNumber(
        pickFirstString(
          box.find(".sqft, [data-sqft]").first().text(),
          box.attr("data-sqft")
        )
      ),
      incentive,
      sourceUrl: absoluteUrl,
    });
  });
  return cards;
}

export async function fetchBuilderA() {
  const lotIds = parseLotIdsFromEnv();
  if (lotIds.length) {
    try {
      return await fetchViaGraphql(lotIds);
    } catch (err) {
      console.warn("[BuilderA] GraphQL failed, falling back to HTML:", err?.message);
    }
  }

  const urls = parseUrlsFromEnv();
  if (!urls.length) {
    console.warn("[BuilderA] No BUILDER_A_URLS configured.");
    return [];
  }

  const allRows = [];
  for (const url of urls) {
    const response = await axios.get(url, {
      timeout: 20000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });
    const $ = cheerio.load(response.data);
    const incentive = extractIncentiveText($);

    const jsonLdRows = parseJsonLdObjects($)
      .map((obj) => fromJsonLd(obj, url, incentive))
      .filter(Boolean);

    const cardRows = extractFromCards($, url, incentive);
    allRows.push(...jsonLdRows, ...cardRows);
  }

  const dedup = new Map();
  for (const row of allRows) {
    if (row.sourceUrl) dedup.set(row.sourceUrl, row);
  }

  return Array.from(dedup.values());
}
