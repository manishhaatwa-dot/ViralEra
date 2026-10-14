import {
  collection,
  onSnapshot,
  query,
  where
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

function normalize(value = "") {
  return String(value).trim().toLowerCase();
}

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function formatCategory(category = "") {
  return String(category)
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, letter => letter.toUpperCase());
}

function getMediaDate(item) {
  if (item.createdAt?.toMillis) return item.createdAt.toMillis();
  if (item.createdAt instanceof Date) return item.createdAt.getTime();
  return 0;
}

function getThumbnail(item) {
  if (item.thumbnailUrl) return item.thumbnailUrl;
  if (item.type === "photo") return item.mediaUrl;
  return "";
}

function matchesCategory(item) {
  if (activeCategory === "all") return true;

  if (activeCategory === "photo" || activeCategory === "video") {
    return normalize(item.type) === activeCategory;
  }

  return normalize(item.category) === activeCategory;
}

function matchesSearch(item) {
  if (!searchText) return true;

  const searchable = [
    item.title,
    item.description,
    item.category,
    item.type
  ].map(normalize).join(" ");

  return searchable.includes(searchText);
}

function createCard(item) {
  const card = document.createElement("article");
  card.className = "ve-media-card";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "ve-media-open";
  button.dataset.mediaId = item.id;
  button.setAttribute("aria-label", `Open ${item.title || "media"}`);

  const thumbnail = getThumbnail(item);

  if (thumbnail) {
    const img = document.createElement("img");
    img.className = "ve-media-thumb";
    img.src = thumbnail;
    img.alt = item.title || "ViralEra media";
    img.loading = "lazy";
    img.decoding = "async";
    img.draggable = false;

    img.addEventListener("error", () => {
      img.remove();

      const placeholder = document.createElement("div");
      placeholder.className = "ve-card-placeholder";
      placeholder.textContent = item.type === "video" ? "▶" : "✦";
      button.prepend(placeholder);
    }, { once: true });

    button.appendChild(img);
  } else {
    const placeholder = document.createElement("div");
    placeholder.className = "ve-card-placeholder";
    placeholder.textContent = item.type === "video" ? "▶" : "✦";
    button.appendChild(placeholder);
  }

  const badge = document.createElement("span");
  badge.className = "ve-media-type";
  badge.textContent = item.type === "video" ? "Video" : "Photo";
  button.appendChild(badge);

  if (item.type === "video") {
    const playIcon = document.createElement("span");
    playIcon.className = "ve-play-icon";
    playIcon.textContent = "▶";
    playIcon.setAttribute("aria-hidden", "true");
    button.appendChild(playIcon);
  }

  const info = document.createElement("div");
  info.className = "ve-card-info";

  const heading = document.createElement("h3");
  heading.textContent = item.title || "Untitled";

  const description = document.createElement("p");
  description.textContent = item.description || "";

  const category = document.createElement("span");
  category.className = "ve-card-category";
  category.textContent = formatCategory(item.category || "General");

  info.appendChild(heading);

  if (item.description) {
    info.appendChild(description);
  }

  info.appendChild(category);
  card.append(button, info);

  return card;
}

function renderGallery() {
  if (!galleryGrid) return;

  const filtered = allMedia.filter(item =>
    matchesCategory(item) && matchesSearch(item)
  );

  galleryGrid.replaceChildren();

  if (galleryCount) {
    galleryCount.textContent =
      `${filtered.length} ${filtered.length === 1 ? "item" : "items"}`;
  }

  if (!filtered.length) {
    const message = document.createElement("div");
    message.className = "ve-empty";
    message.textContent = allMedia.length
      ? "Is category ya search mein media nahi mila."
      : "Abhi koi published media nahi hai. Admin panel se media publish karo.";

    galleryGrid.appendChild(message);

    if (emptyState) emptyState.hidden = true;
    galleryGrid.setAttribute("aria-busy", "false");
    return;
  }

  const fragment = document.createDocumentFragment();

  filtered.forEach(item => {
    fragment.appendChild(createCard(item));
  });

  galleryGrid.appendChild(fragment);
  galleryGrid.setAttribute("aria-busy", "false");

  if (emptyState) emptyState.hidden = true;
}

function setActiveCategory(selectedButton) {
  categoryFilters?.querySelectorAll("[data-category]").forEach(button => {
    const active = button === selectedButton;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

categoryFilters?.addEventListener("click", event => {
  const button = event.target.closest("[data-category]");
  if (!button) return;

  activeCategory = normalize(button.dataset.category || "all");
  setActiveCategory(button);
  renderGallery();
});

searchInput?.addEventListener("input", () => {
  searchText = normalize(searchInput.value);
  renderGallery();
});

function startGallery() {
  if (!galleryGrid) {
    console.error("galleryGrid element index.html mein nahi mila.");
    return;
  }

  galleryGrid.setAttribute("aria-busy", "true");

  const loading = document.createElement("div");
  loading.className = "ve-empty";
  loading.textContent = "Loading ViralEra gallery...";
  galleryGrid.replaceChildren(loading);

  // IMPORTANT: query only published documents.
  const publishedQuery = query(
    collection(db, MEDIA_COLLECTION),
    where("published", "==", true)
  );

  unsubscribe = onSnapshot(
    publishedQuery,
    snapshot => {
      allMedia = snapshot.docs
        .map(document => ({
          id: document.id,
          ...document.data()
        }))
        .filter(item =>
          typeof item.mediaUrl === "string" &&
          item.mediaUrl.length > 0 &&
          ["photo", "video"].includes(normalize(item.type))
        )
        .sort((a, b) => getMediaDate(b) - getMediaDate(a));

      renderGallery();
    },
    error => {
      console.error("ViralEra Firestore error:", error);

      galleryGrid.replaceChildren();

      const message = document.createElement("div");
      message.className = "ve-empty";
      message.textContent =
        "Gallery load nahi hui. Firestore Rules, collection name aur internet check karo.";

      galleryGrid.appendChild(message);
      galleryGrid.setAttribute("aria-busy", "false");

      if (galleryCount) galleryCount.textContent = "Load error";
    }
  );
}

startGallery();

window.addEventListener("pagehide", () => {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
}, { once: true });
