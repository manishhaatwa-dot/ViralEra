import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

import {
  db,
  MEDIA_COLLECTION
} from "./firebase-config.js";

const WATERMARK_TEXT = "ViralEra.opnora.com";

const viewer = document.getElementById("mediaViewer");
const viewerContent = document.getElementById("viewerContent");
const viewerClose = document.getElementById("viewerClose");

function byId(id) {
  return document.getElementById(id);
}

function createWatermark() {
  const watermark = document.createElement("div");
  watermark.className = "ve-moving-watermark";
  watermark.textContent = WATERMARK_TEXT;
  watermark.setAttribute("aria-label", WATERMARK_TEXT);
  watermark.setAttribute("aria-hidden", "true");
  return watermark;
}

function closeViewer() {
  if (!viewer) return;

  const video = viewer.querySelector("video");
  if (video) {
    video.pause();
    video.removeAttribute("src");
    video.load();
  }

  viewer.hidden = true;
  document.body.classList.remove("viewer-open");

  if (viewerContent) viewerContent.replaceChildren();
}

function openViewer(item) {
  if (!viewer || !viewerContent) {
    console.error("Viewer elements missing in index.html");
    return;
  }

  viewerContent.replaceChildren();

  const stage = document.createElement("div");
  stage.className = "ve-media-stage";

  if (item.type === "video") {
    const video = document.createElement("video");
    video.src = item.mediaUrl;
    video.controls = true;
    video.autoplay = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.setAttribute("controlsList", "nodownload noplaybackrate");
    video.disablePictureInPicture = true;
    video.disableRemotePlayback = true;

    video.addEventListener("contextmenu", (event) => {
      event.preventDefault();
    });

    stage.appendChild(video);
    stage.appendChild(createWatermark());
  } else {
    const image = document.createElement("img");
    image.src = item.mediaUrl;
    image.alt = item.title || "ViralEra photo";
    image.draggable = false;
    image.setAttribute("loading", "eager");

    image.addEventListener("contextmenu", (event) => {
      event.preventDefault();
    });

    stage.appendChild(image);
  }

  viewerContent.appendChild(stage);

  const title = byId("viewerTitle");
  const description = byId("viewerDescription");

  if (title) title.textContent = item.title || "";
  if (description) description.textContent = item.description || "";

  viewer.hidden = false;
  document.body.classList.add("viewer-open");
}

async function loadAndOpenMedia(mediaId) {
  if (!mediaId) return;

  try {
    const snapshot = await getDoc(doc(db, MEDIA_COLLECTION, mediaId));

    if (!snapshot.exists()) {
      alert("Ye media ab available nahi hai.");
      return;
    }

    const item = snapshot.data();

    if (item.published !== true) {
      alert("Ye media abhi published nahi hai.");
      return;
    }

    if (!item.mediaUrl || !["photo", "video"].includes(item.type)) {
      alert("Media details sahi nahi hain.");
      return;
    }

    openViewer(item);
  } catch (error) {
    console.error("Media load error:", error);
    alert("Media load nahi hua. Internet ya Firebase Rules check karo.");
  }
}

// Gallery cards use data-media-id to open media.
document.addEventListener("click", (event) => {
  const card = event.target.closest("[data-media-id]");
  if (!card) return;

  if (event.target.closest("a")) event.preventDefault();

  loadAndOpenMedia(card.dataset.mediaId);
});

viewerClose?.addEventListener("click", closeViewer);

viewer?.addEventListener("click", (event) => {
  if (event.target === viewer) closeViewer();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeViewer();
});

// Discourage common save actions inside the viewer.
viewer?.addEventListener("contextmenu", (event) => {
  event.preventDefault();
});

viewer?.addEventListener("dragstart", (event) => {
  event.preventDefault();
});