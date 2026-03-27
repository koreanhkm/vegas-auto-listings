export function normalizeListing(raw) {
  return {
    builder: raw.builder || "Unknown Builder",
    community: raw.community || "",
    plan: raw.plan || "",
    city: raw.city || "Las Vegas",
    zipCode: raw.zipCode || "",
    price: Number(raw.price || 0),
    wasPrice: Number(raw.wasPrice || 0),
    beds: Number(raw.beds || 0),
    baths: Number(raw.baths || 0),
    sqft: Number(raw.sqft || 0),
    incentive: raw.incentive || "",
    status: raw.status || "",
    badge: raw.badge || "",
    imageUrl: raw.imageUrl || "",
    sourceUrl: raw.sourceUrl || "",
    updatedAt: new Date().toISOString(),
  };
}
