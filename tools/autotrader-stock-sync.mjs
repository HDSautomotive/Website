#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_IMAGE_SIZE = "w1024h768";
const DEFAULT_OUTPUT = "stock-data.js";

const args = parseArgs(process.argv.slice(2));

main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exitCode = 1;
});

async function main() {
  const outputFile = path.resolve(args.output || env("AUTOTRADER_OUTPUT", DEFAULT_OUTPUT));
  const inputFile = args.input || env("AUTOTRADER_FEED_FILE", "");
  const dryRun = args["dry-run"] || truthy(env("AUTOTRADER_DRY_RUN", ""));
  const source = env("AUTOTRADER_SOURCE", "stock").toLowerCase();
  const existingStock = await loadExistingStock(outputFile);

  const records = inputFile
    ? await readFeedFile(inputFile)
    : await fetchAutoTraderRecords({ source });

  if (records === null) return;

  const stock = recordsToSiteStock(records, existingStock);
  const output = buildStockDataFile(stock, {
    source: inputFile ? "autotrader-feed-file" : `autotrader-${source}`,
    generatedAt: new Date().toISOString(),
    recordsReceived: records.length,
    recordsPublished: stock.filter((car) => !car.sold).length
  });

  if (dryRun) {
    console.log(output);
    console.error(`Mapped ${records.length} Auto Trader records to ${stock.length} site stock records.`);
    return;
  }

  await writeFile(outputFile, output, "utf8");
  console.log(`Wrote ${stock.length} vehicles to ${path.relative(process.cwd(), outputFile) || outputFile}.`);
}

async function fetchAutoTraderRecords({ source }) {
  const apiKey = env("AUTOTRADER_API_KEY", "");
  const apiSecret = env("AUTOTRADER_API_SECRET", "");
  const advertiserId = env("AUTOTRADER_ADVERTISER_ID", "");
  const skipIfUnconfigured = truthy(env("AUTOTRADER_SKIP_IF_UNCONFIGURED", ""));

  if (!apiKey || !apiSecret || !advertiserId) {
    const message = "Auto Trader sync skipped because AUTOTRADER_API_KEY, AUTOTRADER_API_SECRET, or AUTOTRADER_ADVERTISER_ID is missing.";
    if (skipIfUnconfigured) {
      console.log(message);
      return null;
    }

    throw new Error(`${message} Add the values as environment variables or GitHub secrets.`);
  }

  const client = new AutoTraderClient({
    baseUrl: normaliseBaseUrl(env("AUTOTRADER_API_URL", "https://api.autotrader.co.uk")),
    apiKey,
    apiSecret
  });

  const endpoint = trimSlashes(env("AUTOTRADER_ENDPOINT", source === "search" ? "search" : "stock"));
  const pageSize = clampNumber(Number(env("AUTOTRADER_PAGE_SIZE", DEFAULT_PAGE_SIZE)), 1, 200, DEFAULT_PAGE_SIZE);
  const query = new URLSearchParams(env("AUTOTRADER_EXTRA_QUERY", ""));

  query.set("advertiserId", advertiserId);
  query.set("pageSize", String(pageSize));

  if (source === "search" && !query.has("advertisingLocation")) {
    query.set("advertisingLocation", env("AUTOTRADER_ADVERTISING_LOCATION", "advertiserWebsite"));
  }

  return fetchPagedRecords({ client, endpoint, query, pageSize });
}

async function fetchPagedRecords({ client, endpoint, query, pageSize }) {
  const records = [];
  let page = Number(query.get("page") || 1);

  while (true) {
    query.set("page", String(page));
    const response = await client.get(endpoint, query);
    const pageRecords = getResultsArray(response);
    records.push(...pageRecords);

    const totalResults = toNumber(firstDefined(
      response.totalResults,
      response.total,
      response.pagination?.totalResults,
      response.metadata?.totalResults
    ));

    if (!pageRecords.length) break;
    if (pageRecords.length < pageSize) break;
    if (Number.isFinite(totalResults) && records.length >= totalResults) break;

    page += 1;
  }

  return records;
}

class AutoTraderClient {
  constructor({ baseUrl, apiKey, apiSecret }) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.accessToken = "";
    this.expiresAt = 0;
  }

  async get(endpoint, query) {
    await this.ensureToken();
    const url = new URL(trimSlashes(endpoint), `${this.baseUrl}/`);
    for (const [key, value] of query.entries()) {
      url.searchParams.append(key, value);
    }

    return this.request(url, { method: "GET" });
  }

  async ensureToken() {
    if (this.accessToken && Date.now() < this.expiresAt - 30_000) return;

    const body = new URLSearchParams({
      key: this.apiKey,
      secret: this.apiSecret
    });

    const response = await fetch(new URL("authenticate", `${this.baseUrl}/`), {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "accept": "application/json"
      },
      body
    });

    const payload = await readJsonResponse(response);

    if (!response.ok) {
      throw new Error(`Auto Trader authentication failed (${response.status}): ${JSON.stringify(payload)}`);
    }

    this.accessToken = firstString(
      payload.access_token,
      payload.accessToken,
      payload.token,
      payload.bearerToken
    );

    if (!this.accessToken) {
      throw new Error("Auto Trader authentication response did not include an access token.");
    }

    this.expiresAt = parseTokenExpiry(payload);
  }

  async request(url, options, attempt = 0) {
    const response = await fetch(url, {
      ...options,
      headers: {
        "accept": "application/json",
        "authorization": `Bearer ${this.accessToken}`,
        ...(options.headers || {})
      }
    });

    if (response.status === 401 && attempt === 0) {
      this.accessToken = "";
      await this.ensureToken();
      return this.request(url, options, attempt + 1);
    }

    if ((response.status === 429 || response.status === 503) && attempt < 2) {
      await delay(1000 * (attempt + 1));
      return this.request(url, options, attempt + 1);
    }

    const payload = await readJsonResponse(response);

    if (!response.ok) {
      throw new Error(`Auto Trader request failed (${response.status}) for ${url.pathname}: ${JSON.stringify(payload)}`);
    }

    return payload;
  }
}

async function readFeedFile(filename) {
  if (filename === "-") {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    return getResultsArray(JSON.parse(chunks.join("")));
  }

  const text = await readFile(path.resolve(filename), "utf8");
  const parsed = JSON.parse(text);
  return getResultsArray(parsed);
}

async function loadExistingStock(outputFile) {
  try {
    const text = await readFile(outputFile, "utf8");
    const match = text.match(/window\.HDS_STOCK\s*=\s*([\s\S]*?);\s*(?:\r?\n|$)/);
    return match ? JSON.parse(match[1]) : [];
  } catch {
    return [];
  }
}

function recordsToSiteStock(records, existingStock) {
  const includeSold = truthy(env("AUTOTRADER_INCLUDE_SOLD", ""));
  const existingByKey = indexExistingStock(existingStock);

  return records
    .map((record, index) => mapRecordToCar(record, index, existingByKey))
    .filter(Boolean)
    .filter((car) => includeSold || !car.sold);
}

function mapRecordToCar(record, index, existingByKey) {
  const vehicle = firstObject(record.vehicle, record.vehicles?.[0], record);
  const advert = firstObject(record.advert, record.adverts, record.retailAdvert, record);
  const identifiers = extractIdentifiers(record);
  const reg = normaliseRegistration(firstString(
    vehicle.registration,
    vehicle.vrm,
    vehicle.vehicleRegistrationMark,
    record.registration,
    record.vrm
  ));
  const existing = findExistingStock(existingByKey, identifiers, reg);
  const title = buildVehicleTitle(vehicle, record) || existing?.title || "Auto Trader stock";
  const price = findPrice(record) || existing?.price || 0;
  const status = buildStatus(record, advert);
  const sold = isSoldOrHidden(record, advert, status);
  const images = collectImageUrls(record);
  const specs = buildSpecs(record, vehicle, existing);

  return {
    stockNo: firstString(identifiers.externalStockReference, identifiers.externalStockId, identifiers.stockId, existing?.stockNo) || `AT${String(index + 1).padStart(3, "0")}`,
    title,
    year: String(findYear(vehicle, record) || existing?.year || ""),
    reg: reg || existing?.reg || "",
    price,
    priceLabel: price > 0 ? formatPrice(price) : (existing?.priceLabel || ""),
    mileage: String(findMileage(vehicle, record) || existing?.mileage || ""),
    fuel: normaliseLabel(firstString(vehicle.fuelType, vehicle.standardFuelType, record.fuelType, existing?.fuel)),
    gearbox: normaliseGearbox(firstString(vehicle.transmissionType, vehicle.standardTransmissionType, vehicle.gearbox, record.gearbox, existing?.gearbox)),
    badge: normaliseLabel(firstString(vehicle.bodyType, vehicle.standardBodyType, vehicle.vehicleType, existing?.badge)) || inferBadge(title),
    status,
    summary: "",
    specs,
    images: images.length ? images : (existing?.images || []),
    enquiryName: title,
    featured: index < Number(env("AUTOTRADER_FEATURE_COUNT", "3")),
    sold,
    visualClass: existing?.visualClass || ["visual-one", "visual-two", "visual-three"][index % 3],
    heroVisualClass: existing?.heroVisualClass || ["hero-vehicle-visual-one", "hero-vehicle-visual-two", "hero-vehicle-visual-three"][index % 3],
    advertUrl: firstUrl(record, [
      "advertUrl",
      "autotraderUrl",
      "advert.url",
      "advert.href",
      "adverts.url",
      "adverts.href",
      "links.advert.href",
      "links.autotrader.href",
      "links.website.href"
    ]),
    autotraderStockId: identifiers.stockId || "",
    autotraderSearchId: identifiers.searchId || "",
    autotraderAdvertiserId: firstString(record.advertiserId, record.advertiser?.advertiserId, env("AUTOTRADER_ADVERTISER_ID", ""))
  };
}

function extractIdentifiers(record) {
  return {
    stockId: firstString(record.stockId, record.id, record.metadata?.stockId, record.meta?.stockId),
    searchId: firstString(record.searchId, record.metadata?.searchId, record.meta?.searchId),
    externalStockId: firstString(record.externalStockId, record.metadata?.externalStockId, record.adverts?.externalStockId),
    externalStockReference: firstString(record.externalStockReference, record.stockReference, record.adverts?.stockReference)
  };
}

function indexExistingStock(existingStock) {
  const index = new Map();

  for (const car of existingStock) {
    const keys = [
      car.stockNo,
      car.autotraderStockId,
      car.autotraderSearchId,
      car.reg && normaliseRegistration(car.reg).replace(/\s+/g, "")
    ].filter(Boolean);

    for (const key of keys) {
      index.set(String(key).toLowerCase(), car);
    }
  }

  return index;
}

function findExistingStock(existingByKey, identifiers, reg) {
  const keys = [
    identifiers.externalStockReference,
    identifiers.externalStockId,
    identifiers.stockId,
    identifiers.searchId,
    reg && reg.replace(/\s+/g, "")
  ].filter(Boolean);

  for (const key of keys) {
    const existing = existingByKey.get(String(key).toLowerCase());
    if (existing) return existing;
  }

  return null;
}

function buildVehicleTitle(vehicle, record) {
  const readyMade = firstString(
    record.title,
    record.advertTitle,
    record.heading,
    vehicle.title,
    vehicle.name,
    vehicle.description
  );

  if (readyMade) return cleanWhitespace(readyMade);

  return [
    firstString(vehicle.make, vehicle.standardMake, record.standardMake),
    firstString(vehicle.model, vehicle.standardModel, record.standardModel),
    firstString(vehicle.derivative, vehicle.derivativeName, record.derivative, record.derivativeName)
  ].filter(Boolean).map(normaliseLabel).join(" ").trim();
}

function findYear(vehicle, record) {
  const directYear = firstString(vehicle.year, vehicle.yearOfManufacture, vehicle.manufactureYear, record.year);
  if (directYear) return String(directYear).match(/\b(19\d{2}|20\d{2})\b/)?.[1] || "";

  const date = firstString(vehicle.firstRegistrationDate, record.firstRegistrationDate, vehicle.dateOfFirstRegistration);
  return date.match(/\b(19\d{2}|20\d{2})\b/)?.[1] || "";
}

function findMileage(vehicle, record) {
  return toNumber(firstDefined(
    vehicle.odometerReadingMiles,
    vehicle.mileage,
    vehicle.odometerReading,
    record.odometerReadingMiles,
    record.mileage,
    record.vehicle?.odometerReadingMiles
  )) || 0;
}

function findPrice(record) {
  const knownPaths = [
    "price.amountGBP",
    "price.value",
    "price",
    "pricing.price.amountGBP",
    "pricing.totalPrice.amountGBP",
    "pricing.suppliedPrice.amountGBP",
    "totalPrice.amountGBP",
    "suppliedPrice.amountGBP",
    "forecourtPrice.amountGBP",
    "advert.price.amountGBP",
    "advert.totalPrice.amountGBP",
    "adverts.price.amountGBP",
    "adverts.totalPrice.amountGBP",
    "adverts.suppliedPrice.amountGBP",
    "adverts.forecourtPrice.amountGBP",
    "adverts.retailAdverts.price.amountGBP",
    "adverts.retailAdverts.totalPrice.amountGBP",
    "adverts.retailAdverts.suppliedPrice.amountGBP",
    "adverts.retailAdverts.forecourtPrice.amountGBP"
  ];

  for (const pathExpression of knownPaths) {
    const value = getPath(record, pathExpression);
    const price = normalisePrice(value);
    if (price > 0) return price;
  }

  return findNestedPrice(record);
}

function normalisePrice(value) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value !== "string") return 0;

  const cleaned = value.replace(/[^\d.]/g, "");
  if (!cleaned) return 0;
  return Math.round(Number(cleaned)) || 0;
}

function findNestedPrice(value, depth = 0) {
  if (!value || depth > 5) return 0;

  if (Array.isArray(value)) {
    for (const item of value) {
      const price = findNestedPrice(item, depth + 1);
      if (price > 0) return price;
    }
    return 0;
  }

  if (typeof value !== "object") return 0;

  for (const [key, child] of Object.entries(value)) {
    const priceish = /price|amountgbp|totalprice|suppliedprice|forecourtprice/i.test(key);
    if (priceish) {
      const price = normalisePrice(child);
      if (price > 0) return price;
    }

    const nested = findNestedPrice(child, depth + 1);
    if (nested > 0) return nested;
  }

  return 0;
}

function buildStatus(record, advert) {
  const reservationStatus = firstString(
    record.reservationStatus,
    record.availability?.reservationStatus,
    advert.reservationStatus
  );

  if (/reserved/i.test(reservationStatus)) return "Reserved";
  if (isSoldOrHidden(record, advert, "")) return "Sold";
  return "In stock";
}

function isSoldOrHidden(record, advert, status) {
  const lifecycleState = firstString(
    record.lifecycleState,
    record.availability?.lifecycleState,
    advert.lifecycleState,
    advert.advertiserAdvert?.lifecycleState
  );

  const publishState = firstString(
    advert.advertiserAdvert,
    advert.advertiserAdvert?.status,
    advert.advertiserWebsite?.status,
    record.advertiserAdvert,
    record.advertisingLocations?.advertiserAdvert
  );

  const text = [status, lifecycleState, publishState].join(" ").toLowerCase();

  if (/\b(sold|wastebin|deleted|not_published|not published)\b/.test(text)) return true;

  const availability = firstString(
    record.availabilityStatus,
    record.availability?.status,
    advert.availabilityStatus
  ).toLowerCase();

  return /\b(sold|unavailable)\b/.test(availability);
}

function collectImageUrls(record) {
  const imageSize = env("AUTOTRADER_IMAGE_SIZE", DEFAULT_IMAGE_SIZE);
  const urls = [];
  collectImages(record, urls, imageSize);
  return unique(urls);
}

function collectImages(value, urls, imageSize, depth = 0) {
  if (!value || depth > 8) return;

  if (typeof value === "string") {
    if (looksLikeImageUrl(value)) urls.push(normaliseImageUrl(value, imageSize));
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectImages(item, urls, imageSize, depth + 1);
    return;
  }

  if (typeof value !== "object") return;

  for (const [key, child] of Object.entries(value)) {
    if (typeof child === "string" && /image|photo|media|url|href|uri/i.test(key) && looksLikeImageUrl(child)) {
      urls.push(normaliseImageUrl(child, imageSize));
      continue;
    }

    if (/image|photo|media|gallery|retailAdvert|advert/i.test(key) || depth < 3) {
      collectImages(child, urls, imageSize, depth + 1);
    }
  }
}

function looksLikeImageUrl(value) {
  return /^https?:\/\//i.test(value) && (
    /\.(?:jpe?g|png|webp)(?:[?#].*)?$/i.test(value) ||
    /atcdn\.co\.uk/i.test(value)
  );
}

function normaliseImageUrl(value, imageSize) {
  return value
    .replaceAll("{resize}", imageSize)
    .replaceAll("%7Bresize%7D", imageSize)
    .trim();
}

function buildSpecs(record, vehicle, existing) {
  const featureText = collectFeatureText(record);
  const generated = [
    firstString(vehicle.derivative, vehicle.derivativeName),
    vehicle.doors && `${vehicle.doors} doors`,
    vehicle.seats && `${vehicle.seats} seats`,
    firstString(vehicle.colour, vehicle.standardColour),
    firstString(vehicle.enginePowerBHP, vehicle.enginePower) && `${firstString(vehicle.enginePowerBHP, vehicle.enginePower)} bhp`
  ].filter(Boolean);

  return unique([...featureText, ...generated, ...(existing?.specs || [])])
    .slice(0, 5)
    .map(cleanWhitespace);
}

function collectFeatureText(value, found = [], depth = 0) {
  if (!value || depth > 6) return found;

  if (typeof value === "string") {
    if (value.length > 2 && value.length < 90) found.push(value);
    return found;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectFeatureText(item, found, depth + 1);
    return found;
  }

  if (typeof value !== "object") return found;

  const label = firstString(value.name, value.label, value.displayName, value.description, value.text);
  if (label && label.length < 90) found.push(label);

  for (const [key, child] of Object.entries(value)) {
    if (/feature|highlight|equipment/i.test(key)) {
      collectFeatureText(child, found, depth + 1);
    }
  }

  return found;
}

function firstUrl(value, paths) {
  for (const pathExpression of paths) {
    const candidate = getPath(value, pathExpression);
    if (typeof candidate === "string" && /^https?:\/\//i.test(candidate)) return candidate;
  }

  return "";
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return { body: text.slice(0, 1000) };
  }
}

function getResultsArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.stock)) return payload.stock;
  if (Array.isArray(payload?.vehicles)) return payload.vehicles;
  if (Array.isArray(payload?.adverts)) return payload.adverts;
  if (Array.isArray(payload?.data)) return payload.data;
  return payload ? [payload] : [];
}

function buildStockDataFile(stock, meta) {
  const payload = [
    "// This file is generated from Auto Trader stock data when the sync workflow runs.",
    "// Manual edits can be overwritten by the next sync.",
    `window.HDS_STOCK_META = ${toAsciiJson(meta)};`,
    `window.HDS_STOCK = ${toAsciiJson(stock)};`,
    ""
  ].join("\n");

  return payload;
}

function toAsciiJson(value) {
  return JSON.stringify(value, null, 2)
    .replace(/[\u007f-\uffff]/g, (char) => {
      const code = char.charCodeAt(0).toString(16).padStart(4, "0");
      return `\\u${code}`;
    });
}

function parseTokenExpiry(payload) {
  const expiresAt = firstString(payload.expires_at, payload.expiresAt, payload.expiryDateTime, payload.expiry);
  if (expiresAt) {
    const timestamp = Date.parse(expiresAt);
    if (Number.isFinite(timestamp)) return timestamp;
  }

  const expiresIn = toNumber(firstDefined(payload.expires_in, payload.expiresIn, payload.ttl));
  if (expiresIn > 0) return Date.now() + expiresIn * 1000;

  return Date.now() + 14 * 60 * 1000;
}

function getPath(value, pathExpression) {
  return pathExpression.split(".").reduce((current, key) => current?.[key], value);
}

function firstObject(...values) {
  return values.find((value) => value && typeof value === "object" && !Array.isArray(value)) || {};
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function firstString(...values) {
  for (const value of values) {
    if (value === undefined || value === null || value === "") continue;
    if (typeof value === "object") continue;

    const text = String(value).trim();
    if (text) return text;
  }

  return "";
}

function toNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return 0;
  return Number(value.replace(/[^\d.]/g, "")) || 0;
}

function clampNumber(value, min, max, fallback) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function normaliseRegistration(value) {
  const compact = String(value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .trim();

  if (!compact) return "";
  if (compact.length > 4) return `${compact.slice(0, 4)} ${compact.slice(4)}`;
  return compact;
}

function normaliseGearbox(value) {
  const label = normaliseLabel(value);
  if (/^Auto$/i.test(label)) return "Automatic";
  return label;
}

function normaliseLabel(value) {
  const text = cleanWhitespace(value);
  if (!text) return "";
  if (!/^[A-Z0-9\s-]+$/.test(text)) return text;

  return text
    .toLowerCase()
    .replace(/\b[a-z]/g, (char) => char.toUpperCase())
    .replace(/\bBmw\b/g, "BMW")
    .replace(/\bVw\b/g, "VW")
    .replace(/\bEv\b/g, "EV")
    .replace(/\bSt\b/g, "ST")
    .replace(/\bGti\b/g, "GTI")
    .replace(/\bSuv\b/g, "SUV");
}

function inferBadge(title) {
  const text = String(title ?? "").toLowerCase();
  if (text.includes("suv") || text.includes("qashqai") || text.includes("tiguan") || text.includes("x1")) return "SUV";
  if (text.includes("van") || text.includes("transit")) return "Van";
  if (text.includes("estate")) return "Estate";
  if (text.includes("convertible")) return "Convertible";
  if (text.includes("fiesta") || text.includes("corsa") || text.includes("polo")) return "Hatchback";
  return "Used car";
}

function cleanWhitespace(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function formatPrice(price) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0
  }).format(price);
}

function unique(values) {
  const seen = new Set();
  const output = [];

  for (const value of values) {
    const clean = cleanWhitespace(value);
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    output.push(clean);
  }

  return output;
}

function normaliseBaseUrl(value) {
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  return withProtocol.replace(/\/+$/, "");
}

function trimSlashes(value) {
  return String(value ?? "").replace(/^\/+|\/+$/g, "");
}

function truthy(value) {
  return /^(1|true|yes|on)$/i.test(String(value ?? "").trim());
}

function env(name, fallback) {
  const value = process.env[name];
  return value === undefined || value === "" ? fallback : value;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseArgs(argv) {
  const parsed = {};

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;

    const [rawKey, inlineValue] = item.slice(2).split("=", 2);
    if (inlineValue !== undefined) {
      parsed[rawKey] = inlineValue;
      continue;
    }

    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[rawKey] = true;
      continue;
    }

    parsed[rawKey] = next;
    index += 1;
  }

  return parsed;
}
