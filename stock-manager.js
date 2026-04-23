const STORAGE_KEY = "hds-automotive-stock-draft";
const originalStock = Array.isArray(window.HDS_STOCK) ? window.HDS_STOCK : [];
const draftPhotoUrls = new Map();

const defaultCar = () => ({
  stockNo: "",
  title: "New car",
  year: "",
  reg: "",
  price: 0,
  priceLabel: "",
  mileage: "",
  fuel: "",
  gearbox: "",
  badge: "Used car",
  status: "In stock",
  summary: "",
  specs: [],
  images: [],
  enquiryName: "",
  featured: false,
  sold: false,
  visualClass: "visual-one",
  heroVisualClass: "hero-vehicle-visual-one"
});

let cars = loadCars();
let selectedIndex = 0;

const stockListElement = document.querySelector("#stock-list");
const form = document.querySelector("#car-form");
const previewCard = document.querySelector("#preview-card");
const saveState = document.querySelector("#save-state");
const photoInput = document.querySelector("#photo-input");
const photoDropzone = document.querySelector("#photo-dropzone");
const photoList = document.querySelector("#photo-list");
const advertTextField = form?.elements.advertText;

document.querySelector("#add-car")?.addEventListener("click", addCar);
document.querySelector("#duplicate-car")?.addEventListener("click", duplicateCar);
document.querySelector("#delete-car")?.addEventListener("click", deleteCar);
document.querySelector("#download-stock")?.addEventListener("click", downloadStockFile);
document.querySelector("#reload-file")?.addEventListener("click", reloadFromFile);
document.querySelector("#choose-photos")?.addEventListener("click", () => photoInput?.click());
document.querySelector("#clear-photos")?.addEventListener("click", clearPhotos);
document.querySelector("#apply-advert-text")?.addEventListener("click", applyAdvertText);
document.querySelector("#smart-fill")?.addEventListener("click", smartFillCurrentCar);

stockListElement?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-index]");
  if (!button) return;

  selectedIndex = Number(button.dataset.index || 0);
  renderAll();
});

form?.addEventListener("input", handleFormChange);
form?.addEventListener("change", handleFormChange);

photoInput?.addEventListener("change", (event) => {
  const files = [...(event.target.files || [])];
  addPhotoFiles(files);
  event.target.value = "";
});

photoDropzone?.addEventListener("click", () => photoInput?.click());
photoDropzone?.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    photoInput?.click();
  }
});

["dragenter", "dragover"].forEach((eventName) => {
  photoDropzone?.addEventListener(eventName, (event) => {
    event.preventDefault();
    photoDropzone.classList.add("is-over");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  photoDropzone?.addEventListener(eventName, (event) => {
    event.preventDefault();
    photoDropzone.classList.remove("is-over");
  });
});

photoDropzone?.addEventListener("drop", (event) => {
  const files = [...(event.dataTransfer?.files || [])];
  addPhotoFiles(files);
});

photoList?.addEventListener("click", (event) => {
  const actionButton = event.target.closest("[data-photo-action]");
  if (!actionButton) return;

  const action = actionButton.dataset.photoAction;
  const index = Number(actionButton.dataset.photoIndex || -1);

  if (index < 0) return;

  if (action === "up") movePhoto(index, -1);
  if (action === "down") movePhoto(index, 1);
  if (action === "remove") removePhoto(index);
});

renderAll();

function loadCars() {
  const stored = window.localStorage.getItem(STORAGE_KEY);

  if (!stored) {
    return originalStock.length ? originalStock.map(normaliseCar) : [defaultCar()];
  }

  try {
    const parsed = JSON.parse(stored);
    if (Array.isArray(parsed) && parsed.length) {
      return parsed.map(normaliseCar);
    }
  } catch (error) {
    console.warn("Could not parse saved stock draft.", error);
  }

  return originalStock.length ? originalStock.map(normaliseCar) : [defaultCar()];
}

function normaliseCar(car = {}) {
  return {
    ...defaultCar(),
    ...car,
    year: String(car.year ?? ""),
    reg: String(car.reg ?? ""),
    price: Number(car.price ?? 0) || 0,
    mileage: String(car.mileage ?? ""),
    fuel: String(car.fuel ?? ""),
    gearbox: String(car.gearbox ?? ""),
    specs: Array.isArray(car.specs) ? car.specs : [],
    images: Array.isArray(car.images) ? car.images : [],
    featured: Boolean(car.featured),
    sold: Boolean(car.sold)
  };
}

function renderAll() {
  if (!cars.length) {
    cars = [defaultCar()];
    selectedIndex = 0;
  }

  if (selectedIndex > cars.length - 1) {
    selectedIndex = cars.length - 1;
  }

  renderList();
  renderForm();
  renderPreview();
  renderPhotoList();
}

function renderList() {
  if (!stockListElement) return;

  stockListElement.innerHTML = cars
    .map((car, index) => {
      const flags = [];
      if (car.featured) flags.push('<span class="flag">Featured</span>');
      if (car.sold) flags.push('<span class="flag">Sold hidden</span>');

      return `
        <button type="button" class="stock-list-item${index === selectedIndex ? " is-active" : ""}" data-index="${index}">
          <strong>${escapeHtml(car.title || "Untitled car")}</strong>
          <p class="stock-list-meta">${escapeHtml(car.stockNo || "No stock number")} / ${escapeHtml(buildSummary(car) || car.status || "No details yet")}</p>
          <div class="stock-list-flags">${flags.join("")}</div>
        </button>
      `;
    })
    .join("");
}

function renderForm() {
  if (!form) return;

  const car = cars[selectedIndex];
  if (!car) return;

  form.elements.stockNo.value = car.stockNo;
  form.elements.title.value = car.title;
  form.elements.year.value = car.year;
  form.elements.reg.value = car.reg;
  form.elements.price.value = car.price || 0;
  form.elements.priceLabel.value = car.priceLabel;
  form.elements.mileage.value = normaliseMileageInput(car.mileage);
  form.elements.fuel.value = car.fuel;
  form.elements.gearbox.value = car.gearbox;
  form.elements.badge.value = car.badge;
  form.elements.status.value = car.status;
  form.elements.summary.value = car.summary;
  form.elements.enquiryName.value = car.enquiryName;
  form.elements.featured.value = String(car.featured);
  form.elements.sold.value = String(car.sold);
  form.elements.visualClass.value = car.visualClass;
  form.elements.heroVisualClass.value = car.heroVisualClass;
  form.elements.specs.value = car.specs.join("\n");
  form.elements.images.value = car.images.join("\n");
  if (advertTextField) advertTextField.value = "";
}

function renderPreview() {
  if (!previewCard) return;

  const car = cars[selectedIndex];
  const image = getPrimaryImage(car);
  const price = car.priceLabel || formatPrice(car.price);
  const summary = buildSummary(car) || "Add year, fuel, gearbox, mileage, and reg to build the summary line.";

  previewCard.innerHTML = `
    <div class="preview-image">
      ${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(car.title)}" />` : ""}
    </div>
    <div class="preview-copy">
      <div class="preview-topline">
        <span class="preview-badge">${escapeHtml(car.badge || "Used car")}</span>
        <span class="preview-status">${escapeHtml(car.status || "In stock")}</span>
      </div>
      <h3>${escapeHtml(car.title || "New car")}</h3>
      <p>${escapeHtml(summary)}</p>
      <div class="preview-price">${escapeHtml(price)}</div>
      <ul class="preview-specs">
        ${(car.specs.length ? car.specs : ["Add bullet points for the car"]).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
      </ul>
    </div>
  `;
}

function renderPhotoList() {
  if (!photoList) return;

  const car = cars[selectedIndex];
  const photos = car?.images || [];

  if (!photos.length) {
    photoList.innerHTML = `
      <div class="photo-item-empty">
        Add or drop photos here. The first one becomes the cover image on the site.
      </div>
    `;
    return;
  }

  photoList.innerHTML = photos
    .map((path, index) => {
      const imageSource = draftPhotoUrls.get(path) || path;
      const filename = path.split("/").pop() || path;

      return `
        <div class="photo-item">
          <div class="photo-thumb">
            <img src="${escapeHtml(imageSource)}" alt="${escapeHtml(filename)}" />
          </div>
          <div class="photo-meta">
            ${index === 0 ? '<span class="photo-badge">Cover photo</span>' : ""}
            <strong>${escapeHtml(filename)}</strong>
            <span class="photo-path">${escapeHtml(path)}</span>
            <div class="photo-item-actions">
              <button type="button" class="action-btn action-btn-secondary action-btn-small" data-photo-action="up" data-photo-index="${index}">Move up</button>
              <button type="button" class="action-btn action-btn-secondary action-btn-small" data-photo-action="down" data-photo-index="${index}">Move down</button>
              <button type="button" class="action-btn action-btn-danger action-btn-small" data-photo-action="remove" data-photo-index="${index}">Remove</button>
            </div>
          </div>
        </div>
      `;
    })
    .join("");
}

function handleFormChange() {
  const car = cars[selectedIndex];
  if (!car || !form) return;

  car.stockNo = form.elements.stockNo.value.trim();
  car.title = form.elements.title.value.trim();
  car.year = form.elements.year.value.trim();
  car.reg = form.elements.reg.value.trim().toUpperCase();
  car.price = Number(form.elements.price.value || 0);
  car.priceLabel = form.elements.priceLabel.value.trim();
  car.mileage = form.elements.mileage.value.trim();
  car.fuel = form.elements.fuel.value.trim();
  car.gearbox = form.elements.gearbox.value.trim();
  car.badge = form.elements.badge.value.trim();
  car.status = form.elements.status.value.trim();
  car.summary = form.elements.summary.value.trim();
  car.enquiryName = form.elements.enquiryName.value.trim() || car.title;
  car.featured = form.elements.featured.value === "true";
  car.sold = form.elements.sold.value === "true";
  car.visualClass = form.elements.visualClass.value;
  car.heroVisualClass = form.elements.heroVisualClass.value;
  car.specs = splitLines(form.elements.specs.value);
  car.images = splitLines(form.elements.images.value);

  persistCars();
  renderList();
  renderPreview();
  renderPhotoList();
}

function applyAdvertText() {
  const car = cars[selectedIndex];
  if (!car || !advertTextField) return;

  const parsed = parseAdvertText(advertTextField.value);

  if (!parsed.hasData) {
    if (saveState) saveState.textContent = "Nothing useful found in the pasted advert text yet.";
    return;
  }

  if (parsed.title) car.title = parsed.title;
  if (parsed.year) car.year = parsed.year;
  if (parsed.reg) car.reg = parsed.reg;
  if (parsed.price) car.price = parsed.price;
  if (parsed.mileage) car.mileage = parsed.mileage;
  if (parsed.fuel) car.fuel = parsed.fuel;
  if (parsed.gearbox) car.gearbox = parsed.gearbox;

  smartFillCar(car, { overwriteSummary: false });
  persistCars();
  renderAll();

  if (saveState) saveState.textContent = "Applied the pasted advert details. Check the fields and fine-tune anything needed.";
}

function smartFillCurrentCar() {
  const car = cars[selectedIndex];
  if (!car) return;

  smartFillCar(car, { overwriteSummary: false });
  persistCars();
  renderAll();

  if (saveState) saveState.textContent = "Filled in the missing details I could infer from the current car.";
}

function addPhotoFiles(files) {
  const car = cars[selectedIndex];
  if (!car || !files.length) return;

  const existing = new Set(car.images);

  files.forEach((file) => {
    if (!file.type.startsWith("image/")) return;

    const filename = sanitiseFilename(file.name);
    const path = `assets/cars/${filename}`;

    if (!existing.has(path)) {
      car.images.push(path);
      existing.add(path);
    }

    const previousUrl = draftPhotoUrls.get(path);
    if (previousUrl) URL.revokeObjectURL(previousUrl);
    draftPhotoUrls.set(path, URL.createObjectURL(file));
  });

  syncImagesTextarea();
  persistCars();
  renderPreview();
  renderPhotoList();
}

function movePhoto(index, delta) {
  const car = cars[selectedIndex];
  if (!car) return;

  const nextIndex = index + delta;
  if (nextIndex < 0 || nextIndex >= car.images.length) return;

  [car.images[index], car.images[nextIndex]] = [car.images[nextIndex], car.images[index]];
  syncImagesTextarea();
  persistCars();
  renderPreview();
  renderPhotoList();
}

function removePhoto(index) {
  const car = cars[selectedIndex];
  if (!car) return;

  const [removed] = car.images.splice(index, 1);
  if (removed && draftPhotoUrls.has(removed)) {
    URL.revokeObjectURL(draftPhotoUrls.get(removed));
    draftPhotoUrls.delete(removed);
  }

  syncImagesTextarea();
  persistCars();
  renderPreview();
  renderPhotoList();
}

function clearPhotos() {
  const car = cars[selectedIndex];
  if (!car) return;

  car.images.forEach((path) => {
    if (draftPhotoUrls.has(path)) {
      URL.revokeObjectURL(draftPhotoUrls.get(path));
      draftPhotoUrls.delete(path);
    }
  });

  car.images = [];
  syncImagesTextarea();
  persistCars();
  renderPreview();
  renderPhotoList();
}

function syncImagesTextarea() {
  if (!form) return;
  form.elements.images.value = cars[selectedIndex].images.join("\n");
}

function getPrimaryImage(car) {
  const primaryPath = car.images.find((item) => item.trim()) || "";
  return draftPhotoUrls.get(primaryPath) || primaryPath;
}

function buildSummary(car) {
  if (car.summary) return car.summary;

  const parts = [
    car.year,
    car.fuel,
    car.gearbox,
    formatMileage(car.mileage),
    car.reg
  ].filter(Boolean);

  return parts.join(" / ");
}

function normaliseMileageInput(value) {
  const digits = String(value ?? "").replace(/[^\d]/g, "");
  return digits;
}

function formatMileage(value) {
  const digits = normaliseMileageInput(value);
  if (!digits) return "";

  return `${Number(digits).toLocaleString("en-GB")} miles`;
}

function sanitiseFilename(filename) {
  const dotIndex = filename.lastIndexOf(".");
  const base = dotIndex >= 0 ? filename.slice(0, dotIndex) : filename;
  const extension = dotIndex >= 0 ? filename.slice(dotIndex).toLowerCase() : "";

  const cleanBase = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "car-photo";

  return `${cleanBase}${extension}`;
}

function parseAdvertText(value) {
  const text = String(value ?? "").trim();
  if (!text) return { hasData: false };

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const joined = lines.join(" ");
  const yearMatch = joined.match(/\b(20\d{2}|19\d{2})\b/);
  const regMatch = joined.match(/\b([A-Z]{2}\d{2}\s?[A-Z]{3}|[A-Z]\d{1,3}\s?[A-Z]{3}|[A-Z]{3}\s?\d{1,3}[A-Z])\b/i);
  const mileageMatch = joined.match(/\b([\d,]{3,})\s*(?:miles|mile|mi)\b/i);
  const priceMatch = joined.match(/£\s?([\d,]+)/i);
  const fuelMatch = joined.match(/\b(Petrol|Diesel|Hybrid|Electric|Plug-in Hybrid)\b/i);
  const gearboxMatch = joined.match(/\b(Manual|Automatic|Semi-automatic|Auto)\b/i);

  const likelyTitle =
    lines.find((line) => /\b(20\d{2}|19\d{2})\b/.test(line) && /[A-Za-z]/.test(line)) ||
    lines.find((line) => /^[A-Za-z][A-Za-z0-9\s\-\/]{6,}$/.test(line)) ||
    "";

  return {
    hasData: Boolean(likelyTitle || yearMatch || regMatch || mileageMatch || priceMatch || fuelMatch || gearboxMatch),
    title: cleanTitleFromAdvert(likelyTitle),
    year: yearMatch?.[1] || "",
    reg: normaliseRegistration(regMatch?.[1] || ""),
    price: priceMatch ? Number(priceMatch[1].replaceAll(",", "")) : 0,
    mileage: mileageMatch ? mileageMatch[1].replaceAll(",", "") : "",
    fuel: normaliseCapitalisation(fuelMatch?.[1] || ""),
    gearbox: normaliseGearbox(gearboxMatch?.[1] || "")
  };
}

function cleanTitleFromAdvert(value) {
  return String(value ?? "")
    .replace(/\b(20\d{2}|19\d{2})\b/g, "")
    .replace(/\b(reg|registration)\b.*$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function normaliseRegistration(value) {
  return String(value ?? "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/^(.{4,4})(.+)$/, "$1 $2")
    .trim();
}

function normaliseCapitalisation(value) {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return "";
  return text.replace(/\b\w/g, (char) => char.toUpperCase());
}

function normaliseGearbox(value) {
  const text = String(value ?? "").trim().toLowerCase();
  if (text === "auto") return "Automatic";
  return normaliseCapitalisation(text);
}

function getNextStockNumber() {
  const highest = cars.reduce((max, car) => {
    const match = String(car.stockNo ?? "").match(/(\d+)/);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 100);

  return `HDS${String(highest + 1).padStart(3, "0")}`;
}

function smartFillCar(car, options = {}) {
  const { overwriteSummary = false } = options;

  if (!car.stockNo) car.stockNo = getNextStockNumber();
  if (!car.enquiryName && car.title) car.enquiryName = car.title;
  if (!car.priceLabel && car.price > 0) car.priceLabel = formatPrice(car.price);
  if (!car.badge) car.badge = inferBadge(car.title);
  if (!car.status) car.status = "In stock";
  if ((overwriteSummary || !car.summary) && car.summary) {
    car.summary = car.summary.trim();
  }
}

function inferBadge(title) {
  const text = String(title ?? "").toLowerCase();
  if (!text) return "Used car";
  if (text.includes("fiesta") || text.includes("corsa") || text.includes("polo")) return "Hatchback";
  if (text.includes("sport") || text.includes("st") || text.includes("gti")) return "Performance";
  if (text.includes("x1") || text.includes("q3") || text.includes("tiguan") || text.includes("suv")) return "SUV";
  if (text.includes("transit") || text.includes("van")) return "Van";
  return "Used car";
}

function splitLines(value) {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function persistCars() {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cars));
  if (saveState) saveState.textContent = "Draft saved in this browser. Download stock-data.js when ready.";
}

function addCar() {
  cars.unshift(normaliseCar({
    ...defaultCar(),
    stockNo: getNextStockNumber()
  }));
  selectedIndex = 0;
  persistCars();
  renderAll();
}

function duplicateCar() {
  const source = cars[selectedIndex];
  if (!source) return;

  cars.splice(selectedIndex + 1, 0, normaliseCar({
    ...source,
    stockNo: `${source.stockNo || "NEW"}-COPY`,
    title: `${source.title || "New car"} copy`,
    featured: false,
    sold: false
  }));
  selectedIndex += 1;
  persistCars();
  renderAll();
}

function deleteCar() {
  if (cars.length === 1) {
    cars = [defaultCar()];
    selectedIndex = 0;
  } else {
    cars.splice(selectedIndex, 1);
    selectedIndex = Math.max(0, selectedIndex - 1);
  }

  persistCars();
  renderAll();
}

function reloadFromFile() {
  cars = (originalStock.length ? originalStock : [defaultCar()]).map(normaliseCar);
  selectedIndex = 0;
  window.localStorage.removeItem(STORAGE_KEY);
  if (saveState) saveState.textContent = "Reloaded from stock-data.js.";
  renderAll();
}

function downloadStockFile() {
  const payload = `// Update this list to add, remove, feature, or hide cars on the site.\nwindow.HDS_STOCK = ${JSON.stringify(cars, null, 2)};\n`;
  const blob = new Blob([payload], { type: "application/javascript;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "stock-data.js";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);

  if (saveState) saveState.textContent = "Downloaded a fresh stock-data.js file.";
}

function formatPrice(price) {
  if (typeof price !== "number" || Number.isNaN(price) || price <= 0) return "Price on request";

  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0
  }).format(price);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
