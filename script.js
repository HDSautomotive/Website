const menuToggle = document.querySelector(".menu-toggle");
const nav = document.querySelector(".site-nav");
const stockList = Array.isArray(window.HDS_STOCK) ? window.HDS_STOCK : [];
const liveStock = stockList.filter((car) => !car.sold);
const featuredStock = liveStock.filter((car) => car.featured);

if (menuToggle && nav) {
  menuToggle.addEventListener("click", () => {
    nav.classList.toggle("open");
    const expanded = nav.classList.contains("open");
    menuToggle.setAttribute("aria-expanded", String(expanded));
  });

  nav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      nav.classList.remove("open");
      menuToggle.setAttribute("aria-expanded", "false");
    });
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getCarImages(car) {
  if (!Array.isArray(car?.images)) return [];
  return car.images
    .filter((image) => typeof image === "string" && image.trim())
    .map((image) => image.trim());
}

function getPrimaryImage(car) {
  return getCarImages(car)[0] || "";
}

function formatPrice(price) {
  if (typeof price !== "number" || Number.isNaN(price) || price <= 0) return "Price on request";

  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0
  }).format(price);
}

function normaliseMileage(value) {
  const digits = String(value ?? "").replace(/[^\d]/g, "");
  if (!digits) return "";
  return `${Number(digits).toLocaleString("en-GB")} miles`;
}

function buildSummary(car) {
  if (car?.summary) return car.summary;

  return [
    car?.year,
    car?.fuel,
    car?.gearbox,
    normaliseMileage(car?.mileage),
    car?.reg
  ].filter(Boolean).join(" / ");
}

function fillContactForm(reasonText, messageText) {
  const contactForm = document.querySelector("#contact");
  const reason = contactForm?.querySelector('select[name="Reason for enquiry"]');
  const message = contactForm?.querySelector('textarea[name="Message"]');

  if (reason && reasonText) reason.value = reasonText;
  if (message && messageText) message.value = messageText;

  contactForm?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderHeroVisual(car) {
  const image = getPrimaryImage(car);

  if (image) {
    return `
      <div class="hero-vehicle-visual hero-vehicle-visual-image">
        <img src="${escapeHtml(image)}" alt="${escapeHtml(car.title)}" loading="lazy" />
      </div>
    `;
  }

  return `<div class="hero-vehicle-visual ${escapeHtml(car.heroVisualClass || "hero-vehicle-visual-one")}"></div>`;
}

function renderStockVisual(car, carIndex) {
  const images = getCarImages(car);
  const image = images[0] || "";

  if (image) {
    return `
      <div class="stock-visual stock-visual-image" data-gallery data-car-index="${carIndex}" data-image-index="0">
        <img src="${escapeHtml(image)}" alt="${escapeHtml(car.title)}" loading="lazy" />
        ${images.length > 1 ? `
          <div class="stock-gallery-controls">
            <button class="gallery-nav" type="button" data-gallery-nav="-1" data-car-index="${carIndex}" aria-label="Show previous photo for ${escapeHtml(car.title)}">
              &#8249;
            </button>
            <span class="gallery-count">1 / ${images.length}</span>
            <button class="gallery-nav" type="button" data-gallery-nav="1" data-car-index="${carIndex}" aria-label="Show next photo for ${escapeHtml(car.title)}">
              &#8250;
            </button>
          </div>
        ` : ""}
        <div class="visual-label">${escapeHtml(car.stockNo || "Stock car")}${car.featured ? " / Featured" : ""}</div>
      </div>
    `;
  }

  return `
    <div class="stock-visual ${escapeHtml(car.visualClass || "visual-one")}">
      <div class="visual-label">${escapeHtml(car.stockNo || "Stock car")}${car.featured ? " / Featured" : ""}</div>
    </div>
  `;
}

function renderHeroStock() {
  const heroRotator = document.querySelector("#hero-rotator");

  if (!heroRotator) return;

  const carsToShow = featuredStock.length ? featuredStock : liveStock.slice(0, 3);

  if (!carsToShow.length) {
    heroRotator.innerHTML = `
      <article class="hero-vehicle-card hero-vehicle-card-static is-visible">
        <div class="hero-vehicle-top">
          <span class="hero-vehicle-badge">Stock update</span>
          <strong class="hero-vehicle-price">Coming soon</strong>
        </div>
        <div class="hero-vehicle-visual hero-vehicle-visual-one"></div>
        <div class="hero-vehicle-meta">
          <h3>Add your first car in stock-data.js</h3>
          <p>Your featured hero cars will appear here automatically once you update the stock list.</p>
        </div>
      </article>
    `;
    return;
  }

  const heroCards =
    carsToShow.length === 1
      ? carsToShow
      : carsToShow.length === 2
        ? [carsToShow[0], carsToShow[1], carsToShow[0]]
        : carsToShow.slice(0, 3);

  heroRotator.innerHTML = heroCards
    .map(
      (car) => `
        <article class="hero-vehicle-card${heroCards.length === 1 ? " hero-vehicle-card-static is-visible" : ""}">
          <div class="hero-vehicle-top">
            <span class="hero-vehicle-badge">${escapeHtml(car.badge || "Used car")}</span>
            <strong class="hero-vehicle-price">${escapeHtml(car.priceLabel || formatPrice(car.price))}</strong>
          </div>
          ${renderHeroVisual(car)}
          <div class="hero-vehicle-meta">
            <h3>${escapeHtml(car.title)}</h3>
            <p>${escapeHtml(buildSummary(car))}</p>
          </div>
        </article>
      `
    )
    .join("");
}

function renderStockCards() {
  const stockShowcase = document.querySelector("#stock-showcase");

  if (!stockShowcase) return;

  if (!liveStock.length) {
    stockShowcase.innerHTML = `
      <article class="stock-card stock-card-empty">
        <div class="stock-body">
          <div class="stock-title-row">
            <div>
              <h3>No live stock added yet</h3>
              <p>Add vehicles in stock-data.js and they will appear here automatically.</p>
            </div>
          </div>
        </div>
      </article>
    `;
    return;
  }

  stockShowcase.innerHTML = liveStock
    .map(
      (car, index) => `
        <article class="stock-card${index === 0 ? " stock-card-featured" : ""}">
          <div class="card-topline">
            <span class="stock-tag">${escapeHtml(car.featured ? "Featured" : (car.badge || "In stock"))}</span>
            <span class="stock-tag stock-tag-muted">${escapeHtml(car.status || "In stock")}</span>
          </div>
          ${renderStockVisual(car, index)}
          <div class="stock-body">
            <div class="stock-title-row">
              <div>
                <h3>${escapeHtml(car.title)}</h3>
                <p>${escapeHtml(buildSummary(car))}</p>
              </div>
              <strong>${escapeHtml(car.priceLabel || formatPrice(car.price))}</strong>
            </div>
            <ul class="stock-specs">
              ${(car.specs || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
            </ul>
            <div class="card-actions">
              <button class="btn btn-primary btn-card link-btn" data-car="${escapeHtml(car.enquiryName || car.title)}">Ask about this car</button>
              <button class="btn btn-secondary btn-card reserve-btn" data-car="${escapeHtml(car.enquiryName || car.title)}">Arrange a viewing</button>
            </div>
          </div>
        </article>
      `
    )
    .join("");
}

renderHeroStock();
renderStockCards();

document.addEventListener("click", (event) => {
  const galleryButton = event.target.closest("[data-gallery-nav]");
  const linkButton = event.target.closest(".link-btn");
  const reserveButton = event.target.closest(".reserve-btn");

  if (galleryButton) {
    const carIndex = Number(galleryButton.dataset.carIndex);
    const direction = Number(galleryButton.dataset.galleryNav);
    const gallery = galleryButton.closest("[data-gallery]");
    const car = liveStock[carIndex];
    const images = getCarImages(car);

    if (!gallery || !images.length) return;

    const nextIndex = (Number(gallery.dataset.imageIndex || 0) + direction + images.length) % images.length;
    const imageElement = gallery.querySelector("img");
    const countElement = gallery.querySelector(".gallery-count");

    if (imageElement) {
      imageElement.src = images[nextIndex];
      imageElement.alt = car?.title || "Car photo";
    }

    if (countElement) {
      countElement.textContent = `${nextIndex + 1} / ${images.length}`;
    }

    gallery.dataset.imageIndex = String(nextIndex);
    return;
  }

  if (linkButton) {
    const selectedCar = linkButton.dataset.car || "";
    fillContactForm(
      "Vehicle enquiry",
      `Hi, I am interested in the ${selectedCar}. Please can you send me more details and let me know if it is still available?`
    );
    return;
  }

  if (reserveButton) {
    const selectedCar = reserveButton.dataset.car || "";
    fillContactForm(
      "Viewing request",
      `Hi, I would like to arrange a viewing for the ${selectedCar}. Please can you contact me with availability?`
    );
  }
});

function buildMailBody(form) {
  const fields = [...form.querySelectorAll("input, textarea, select")];
  return fields.map((field) => `${field.name}: ${field.value || ""}`).join("\n");
}

document.querySelectorAll(".js-mail-form").forEach((form) => {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const subject = form.dataset.subject || "Website Enquiry";
    const body = encodeURIComponent(buildMailBody(form));
    const mailTo = `mailto:hello@hds-automotive.co.uk?subject=${encodeURIComponent(subject)}&body=${body}`;
    window.location.href = mailTo;
  });
});
