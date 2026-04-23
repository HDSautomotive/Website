const menuToggle = document.querySelector(".menu-toggle");
const nav = document.querySelector(".site-nav");
const stockList = Array.isArray(window.HDS_STOCK) ? window.HDS_STOCK : [];
const liveStock = stockList.filter((car) => !car.sold);
const featuredStock = liveStock.filter((car) => car.featured);
let galleryLightbox = null;

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
        <button class="gallery-main-button" type="button" data-gallery-open aria-label="Open photo gallery for ${escapeHtml(car.title)}">
          <img src="${escapeHtml(image)}" alt="${escapeHtml(car.title)}" loading="lazy" />
        </button>
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

function updateGallery(gallery, nextIndex) {
  const carIndex = Number(gallery?.dataset.carIndex);
  const car = liveStock[carIndex];
  const images = getCarImages(car);

  if (!gallery || !images.length) return;

  const safeIndex = ((nextIndex % images.length) + images.length) % images.length;
  const imageElement = gallery.querySelector(".gallery-main-button img");
  const countElement = gallery.querySelector(".gallery-count");

  if (imageElement) {
    imageElement.src = images[safeIndex];
    imageElement.alt = car?.title || "Car photo";
  }

  if (countElement) {
    countElement.textContent = `${safeIndex + 1} / ${images.length}`;
  }

  gallery.dataset.imageIndex = String(safeIndex);
}

function createGalleryLightbox() {
  if (galleryLightbox) return galleryLightbox;

  const lightbox = document.createElement("div");
  lightbox.className = "gallery-lightbox";
  lightbox.setAttribute("hidden", "");
  lightbox.innerHTML = `
    <div class="gallery-lightbox-backdrop" data-lightbox-close></div>
    <div class="gallery-lightbox-dialog" role="dialog" aria-modal="true" aria-label="Vehicle photo gallery">
      <button class="gallery-lightbox-close" type="button" data-lightbox-close aria-label="Close photo gallery">
        &times;
      </button>
      <div class="gallery-lightbox-stage">
        <button class="gallery-lightbox-nav" type="button" data-lightbox-nav="-1" aria-label="Show previous photo">
          &#8249;
        </button>
        <img class="gallery-lightbox-image" src="" alt="" />
        <button class="gallery-lightbox-nav" type="button" data-lightbox-nav="1" aria-label="Show next photo">
          &#8250;
        </button>
      </div>
      <div class="gallery-lightbox-footer">
        <p class="gallery-lightbox-caption"></p>
        <span class="gallery-lightbox-count"></span>
      </div>
    </div>
  `;

  document.body.appendChild(lightbox);
  galleryLightbox = lightbox;
  return lightbox;
}

function updateGalleryLightbox() {
  if (!galleryLightbox) return;

  const carIndex = Number(galleryLightbox.dataset.carIndex);
  const imageIndex = Number(galleryLightbox.dataset.imageIndex || 0);
  const car = liveStock[carIndex];
  const images = getCarImages(car);
  const image = images[imageIndex];

  if (!car || !image) return;

  const imageElement = galleryLightbox.querySelector(".gallery-lightbox-image");
  const captionElement = galleryLightbox.querySelector(".gallery-lightbox-caption");
  const countElement = galleryLightbox.querySelector(".gallery-lightbox-count");

  if (imageElement) {
    imageElement.src = image;
    imageElement.alt = car.title || "Vehicle photo";
  }

  if (captionElement) {
    captionElement.textContent = car.title || "Vehicle photo";
  }

  if (countElement) {
    countElement.textContent = `${imageIndex + 1} / ${images.length}`;
  }
}

function openGalleryLightbox(carIndex, imageIndex) {
  const car = liveStock[carIndex];
  const images = getCarImages(car);

  if (!images.length) return;

  const lightbox = createGalleryLightbox();
  lightbox.dataset.carIndex = String(carIndex);
  lightbox.dataset.imageIndex = String(((imageIndex % images.length) + images.length) % images.length);
  lightbox.removeAttribute("hidden");
  document.body.classList.add("lightbox-open");
  updateGalleryLightbox();
}

function closeGalleryLightbox() {
  if (!galleryLightbox) return;
  galleryLightbox.setAttribute("hidden", "");
  document.body.classList.remove("lightbox-open");
}

function initializeStockGalleries() {
  document.querySelectorAll("[data-gallery]").forEach((gallery) => {
    updateGallery(gallery, Number(gallery.dataset.imageIndex || 0));
  });
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

  const heroCards = [carsToShow[0]];

  heroRotator.innerHTML = heroCards
    .map(
      (car) => `
        <article class="hero-vehicle-card hero-vehicle-card-static is-visible">
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

function buildStockCards(carsToRender) {
  if (!carsToRender.length) {
    return `
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
  }

  return carsToRender
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

function renderStockCards() {
  const stockShowcase = document.querySelector("#stock-showcase");
  if (!stockShowcase) return;

  const featuredPreview = liveStock.slice(0, 3);
  stockShowcase.innerHTML = buildStockCards(featuredPreview);
}

function renderFullStockPage() {
  const stockPageShowcase = document.querySelector("#full-stock-showcase");
  if (!stockPageShowcase) return;

  stockPageShowcase.innerHTML = buildStockCards(liveStock);
}

renderHeroStock();
renderStockCards();
renderFullStockPage();
initializeStockGalleries();

document.addEventListener("click", (event) => {
  const galleryButton = event.target.closest("[data-gallery-nav]");
  const galleryOpenButton = event.target.closest("[data-gallery-open]");
  const lightboxCloseButton = event.target.closest("[data-lightbox-close]");
  const lightboxNavButton = event.target.closest("[data-lightbox-nav]");
  const linkButton = event.target.closest(".link-btn");
  const reserveButton = event.target.closest(".reserve-btn");

  if (galleryButton) {
    const gallery = galleryButton.closest("[data-gallery]");
    const direction = Number(galleryButton.dataset.galleryNav);

    if (!gallery) return;

    updateGallery(gallery, Number(gallery.dataset.imageIndex || 0) + direction);
    return;
  }

  if (galleryOpenButton) {
    const gallery = galleryOpenButton.closest("[data-gallery]");

    if (!gallery) return;

    openGalleryLightbox(
      Number(gallery.dataset.carIndex),
      Number(gallery.dataset.imageIndex || 0)
    );
    return;
  }

  if (lightboxCloseButton) {
    closeGalleryLightbox();
    return;
  }

  if (lightboxNavButton && galleryLightbox && !galleryLightbox.hasAttribute("hidden")) {
    const car = liveStock[Number(galleryLightbox.dataset.carIndex)];
    const images = getCarImages(car);

    if (!images.length) return;

    galleryLightbox.dataset.imageIndex = String(
      (Number(galleryLightbox.dataset.imageIndex || 0) + Number(lightboxNavButton.dataset.lightboxNav) + images.length) % images.length
    );
    updateGalleryLightbox();
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

document.addEventListener("keydown", (event) => {
  if (!galleryLightbox || galleryLightbox.hasAttribute("hidden")) return;

  if (event.key === "Escape") {
    closeGalleryLightbox();
    return;
  }

  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    const car = liveStock[Number(galleryLightbox.dataset.carIndex)];
    const images = getCarImages(car);

    if (!images.length) return;

    const direction = event.key === "ArrowLeft" ? -1 : 1;
    galleryLightbox.dataset.imageIndex = String(
      (Number(galleryLightbox.dataset.imageIndex || 0) + direction + images.length) % images.length
    );
    updateGalleryLightbox();
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
