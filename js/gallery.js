import {
  collection,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

import {
  db,
  MEDIA_COLLECTION
} from "./firebase-config.js";

const galleryGrid = document.getElementById("galleryGrid");
const emptyState = document.getElementById("emptyState");
const searchInput = document.getElementById("gallerySearch");
const categoryFilters = document.getElementById("categoryFilters");
const galleryCount = document.getElementById("galleryCount");

let allMedia = [];
let activeCategory = "all";
let searchText = "";
let unsubscribe = null;

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function normalize(value = "") {
  return String(value).trim().toLowerCase();
}

function formatCategory(category = "") {
  return String(category)
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getMediaDate(item) {
  const timestamp = item.createdAt;

  if (timestamp?.toMillis) return timestamp.toMillis();

  if (timestamp instanceof Date) return timestamp.getTime();

  return 0;
}

function getThumbnail(item) {
  if (item.thumbnailUrl) return item.thumbnailUrl;
  if (item.type === "photo") return item.mediaUrl;
  return "";
}

function matchesCategory(item) {
  if (activeCategory === "all") return true;

  if (activeCategory === "video" || activeCategory === "photo") {
    return normalize(item.type) === activeCategory;
  }

  return normalize(item.category) === activeCategory;
}

function matchesSearch(item) {
  if (!searchText) return true;

  const searchableText = [
    item.title,
    item.description,
    item.category,
    item.type
  ].map(normalize).join(" ");

  return searchableText.includes(searchText);
}

function createCard(item) {
  const id = escapeHTML(item.id);
  const title = escapeHTML(item.title || "Untitled");
  const description = escapeHTML(item.description || "");
  const category = escapeHTML(formatCategory(item.category || "General"));
  const type = normalize(item.type);
  const thumbnail = getThumbnail(item);

  const card = document.createElement("article");
  card.className = "ve-media-card";

  const openButton = document.createElement("button");
  openButton.type = "button";
  openButton.className = "ve-media-open";
  openButton.dataset.mediaId = item.id;
  openButton.setAttribute("aria-label", `Open ${item.title || "media"}`);

  if (thumbnail) {
    const image = document.createElement("img");
    image.className = "ve-media-thumb";
    image.src = thumbnail;
    image.alt = item.title || "ViralEra media";
    image.loading = "lazy";
    image.decoding = "async";
    image.draggable = false;

    image.addEventListener("error", () => {
      image.remove();

      if (!openButton.querySelector(".ve-card-placeholder")) {
        const placeholder = document.createElement("div");
        placeholder.className = "ve-card-placeholder";
        placeholder.textContent = type === "video" ? "▶" : "✦";
        openButton.prepend(placeholder);
      }
    }, { once: true });

    openButton.appendChild(image);
  } else {
    const placeholder = document.createElement("div");
    placeholder.className = "ve-card-placeholder";
    placeholder.textContent = type === "video" ? "▶" : "✦";
    openButton.appendChild(placeholder);
  }

  const typeBadge = document.createElement("span");
  typeBadge.className = "ve-media-type";
  typeBadge.textContent = type === "video" ? "Video" : "Photo";
  openButton.appendChild(typeBadge);

  if (type === "video") {
    const playIcon = document.createElement("span");
    playIcon.className = "ve-play-icon";
    playIcon.textContent = "▶";
    playIcon.setAttribute("aria-hidden", "true");
    openButton.appendChild(playIcon);
  }

  const info = document.createElement("div");
  info.className = "ve-card-info";

  const heading = document.createElement("h3");
  heading.textContent = item.title || "Untitled";

  const descriptionElement = document.createElement("p");
  descriptionElement.textContent = item.description || "";

  const categoryElement = document.createElement("span");
  categoryElement.className = "ve-card-category";
  categoryElement.textContent = category;

  info.append(heading);

  if (description) {
    info.append(descriptionElement);
  }

  info.append(categoryElement);
  card.append(openButton, info);

  return card;
}

function renderGallery() {
  if (!galleryGrid) return;

  const filtered = allMedia.filter((item) =>
    matchesCategory(item) && matchesSearch(item)
  );

  galleryGrid.replaceChildren();

  if (galleryCount) {
    galleryCount.textContent =
      `${filtered.length} ${filtered.length === 1 ? "item" : "items"}`;
  }

  if (filtered.length === 0) {
    const emptyMessage = document.createElement("div");
    emptyMessage.className = "ve-empty";
    emptyMessage.textContent = allMedia.length
      ? "Is search ya category mein media nahi mila. Dusra filter try karo."
      : "Abhi gallery mein media nahi hai. Admin dashboard se photo ya video publish karo.";

    galleryGrid.appendChild(emptyMessage);

    if (emptyState) emptyState.hidden = true;
    galleryGrid.setAttribute("aria-busy", "false");
    return;
  }

  const fragment = document.createDocumentFragment();

  filtered.forEach((item) => {
    fragment.appendChild(createCard(item));
  });

  galleryGrid.appendChild(fragment);

  if (emptyState) emptyState.hidden = true;
  galleryGrid.setAttribute("aria-busy", "false");
}

function setActiveCategory(button) {
  categoryFilters?.querySelectorAll("[data-category]").forEach((item) => {
    const active = item === button;

    item.classList.toggle("active", active);
    item.setAttribute("aria-pressed", String(active));
  });
}

// Category filtering
categoryFilters?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-category]");
  if (!button) return;

  activeCategory = normalize(button.dataset.category || "all");
  setActiveCategory(button);
  renderGallery();
});

// Live search
searchInput?.addEventListener("input", () => {
  searchText = normalize(searchInput.value);
  renderGallery();
});

// Live Firestore gallery updates
function startGallery() {
  if (!galleryGrid) {
    console.error("galleryGrid element missing from index.html");
    return;
  }

  galleryGrid.setAttribute("aria-busy", "true");

  const loading = document.createElement("div");
  loading.className = "ve-empty";
  loading.textContent = "Loading ViralEra gallery...";
  galleryGrid.replaceChildren(loading);

  unsubscribe = onSnapshot(
    collection(db, MEDIA_COLLECTION),
    (snapshot) => {
      allMedia = snapshot.docs
        .map((document) => ({
          id: document.id,
          ...document.data()
        }))
        .filter((item) =>
          item.published === true &&
          typeof item.mediaUrl === "string" &&
          ["photo", "video"].includes(normalize(item.type))
        )
        .sort((a, b) => getMediaDate(b) - getMediaDate(a));

      renderGallery();
    },
    (error) => {
      console.error("ViralEra gallery error:", error);

      galleryGrid.replaceChildren();

      const errorMessage = document.createElement("div");
      errorMessage.className = "ve-empty";
      errorMessage.textContent =
        "Gallery load nahi hui. Internet connection aur Firestore Rules check karo.";

      galleryGrid.appendChild(errorMessage);
      galleryGrid.setAttribute("aria-busy", "false");

      if (galleryCount) galleryCount.textContent = "Unable to load";
    }
  );
}

startGallery();

// Stop the live listener if this page is ever unloaded.
window.addEventListener("pagehide", () => {
  if (typeof unsubscribe === "function") {
    unsubscribe();
    unsubscribe = null;
  }
}, { once: true });