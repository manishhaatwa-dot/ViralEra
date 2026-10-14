import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

import {
  collection,
  addDoc,
  onSnapshot,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-storage.js";

import {
  auth,
  db,
  storage,
  ADMIN_EMAIL,
  MEDIA_COLLECTION,
  MEDIA_STORAGE_PATH,
  authReady
} from "./firebase-config.js";

const ADMIN_UID = "amAqEzu6VcYwhpF1If0jJyYWBdf2";
const WATERMARK = "ViralEra.opnora.com";

const $ = (id) => document.getElementById(id);

const loginSection = $("loginSection");
const dashboardSection = $("dashboardSection");
const loginForm = $("loginForm");
const loginMessage = $("loginMessage");
const uploadForm = $("uploadForm");
const uploadMessage = $("uploadMessage");
const adminMediaList = $("adminMediaList");

let allMedia = [];
let unsubscribeMedia = null;
let isUploading = false;

function isAuthorized(user) {
  return !!user &&
    user.uid === ADMIN_UID &&
    user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
}

function showMessage(element, message, isError = false) {
  if (!element) return;
  element.textContent = message;
  element.style.color = isError ? "#ff7777" : "#e7c477";
}

function safeText(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function showLogin() {
  if (loginSection) loginSection.hidden = false;
  if (dashboardSection) dashboardSection.hidden = true;
}

function showDashboard() {
  if (loginSection) loginSection.hidden = true;
  if (dashboardSection) dashboardSection.hidden = false;
}

function setButtonLoading(button, loading, normalText) {
  if (!button) return;
  button.disabled = loading;
  button.textContent = loading ? "Please wait..." : normalText;
}

// ---------------- LOGIN ----------------

loginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = $("adminEmail")?.value.trim();
  const password = $("adminPassword")?.value;
  const button = $("loginButton");

  if (!email || !password) {
    showMessage(loginMessage, "Email aur password bharo.", true);
    return;
  }

  if (email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    showMessage(loginMessage, "Ye admin email authorized nahi hai.", true);
    return;
  }

  setButtonLoading(button, true, "Login");

  try {
    await authReady;
    const credential = await signInWithEmailAndPassword(
      auth,
      email,
      password
    );

    if (!isAuthorized(credential.user)) {
      await signOut(auth);
      throw new Error("Unauthorized admin account.");
    }

    showMessage(loginMessage, "Login successful.");
    loginForm.reset();
  } catch (error) {
    console.error("Admin login error:", error);
    showMessage(
      loginMessage,
      "Login nahi hua. Email, password aur admin UID check karo.",
      true
    );
  } finally {
    setButtonLoading(button, false, "Login");
  }
});

$("logoutButton")?.addEventListener("click", async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Logout error:", error);
    alert("Logout nahi ho paya. Dobara try karo.");
  }
});

// ---------------- PHOTO WATERMARK ----------------

// Watermark image ke pixels par lagta hai, sirf viewer ke upar nahi.
async function addPhotoWatermark(file) {
  if (!file.type.startsWith("image/")) return file;

  // SVG, GIF aur animated formats ko canvas se process karne par
  // animation/metadata kho sakte hain. Unhe as-is upload nahi karte.
  const supportedTypes = ["image/jpeg", "image/png", "image/webp"];

  if (!supportedTypes.includes(file.type)) {
    throw new Error(
      "Watermarked photos ke liye JPG, PNG ya WebP image select karo."
    );
  }

  const bitmap = await createImageBitmap(file);

  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Image processing available nahi hai.");

    ctx.drawImage(bitmap, 0, 0);

    const minDimension = Math.min(canvas.width, canvas.height);
    const fontSize = Math.max(18, Math.round(minDimension * 0.035));
    const margin = Math.max(16, Math.round(minDimension * 0.035));

    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(-Math.PI / 6);
    ctx.font = `bold ${fontSize}px Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Subtle outline + gold watermark
    ctx.lineWidth = Math.max(2, fontSize * 0.09);
    ctx.strokeStyle = "rgba(0, 0, 0, 0.55)";
    ctx.fillStyle = "rgba(255, 220, 145, 0.55)";

    const textWidth = ctx.measureText(WATERMARK).width;
    const repeatGap = textWidth + margin * 2;
    const diagonal = Math.hypot(canvas.width, canvas.height);

    for (let x = -diagonal; x <= diagonal; x += repeatGap) {
      for (let y = -diagonal; y <= diagonal; y += fontSize * 5) {
        ctx.strokeText(WATERMARK, x, y);
        ctx.fillText(WATERMARK, x, y);
      }
    }

    ctx.restore();

    const outputType = file.type === "image/png"
      ? "image/png"
      : "image/jpeg";

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (result) => result ? resolve(result) : reject(
          new Error("Watermark image create nahi ho payi.")
        ),
        outputType,
        0.94
      );
    });

    const extension = outputType === "image/png" ? "png" : "jpg";

    return new File(
      [blob],
      `${file.name.replace(/\.[^.]+$/, "")}-watermarked.${extension}`,
      { type: outputType, lastModified: Date.now() }
    );
  } finally {
    bitmap.close();
  }
}

// ---------------- UPLOAD ----------------

function safeFileName(name) {
  return name
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(-100);
}

function updateProgress(percent, message) {
  const progress = $("uploadProgress");
  const fill = $("progressFill");
  const text = $("progressText");

  if (progress) progress.hidden = false;
  if (fill) fill.style.width = `${percent}%`;
  if (text) text.textContent = message || `${percent}%`;
}

function uploadFile(file, path, onProgress) {
  return new Promise((resolve, reject) => {
    const fileRef = ref(storage, path);
    const task = uploadBytesResumable(fileRef, file, {
      contentType: file.type
    });

    task.on(
      "state_changed",
      (snapshot) => {
        const percent = Math.round(
          (snapshot.bytesTransferred / snapshot.totalBytes) * 100
        );
        onProgress?.(percent);
      },
      reject,
      async () => {
        try {
          resolve({
            url: await getDownloadURL(task.snapshot.ref),
            path
          });
        } catch (error) {
          reject(error);
        }
      }
    );
  });
}

uploadForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (isUploading) return;

  const user = auth.currentUser;
  if (!isAuthorized(user)) {
    showMessage(uploadMessage, "Pehle authorized admin login karo.", true);
    return;
  }

  const mediaFile = $("mediaFile")?.files?.[0];
  const thumbnailFile = $("thumbnailFile")?.files?.[0];
  const title = $("mediaTitle")?.value.trim();
  const description = $("mediaDescription")?.value.trim() || "";
  const category = $("mediaCategory")?.value;
  const published = $("publishMedia")?.checked ?? true;
  const button = $("uploadButton");

  if (!mediaFile || !title || !category) {
    showMessage(uploadMessage, "File, title aur category zaroori hain.", true);
    return;
  }

  const isImage = mediaFile.type.startsWith("image/");
  const isVideo = mediaFile.type.startsWith("video/");

  if (!isImage && !isVideo) {
    showMessage(uploadMessage, "Sirf photo ya video upload karo.", true);
    return;
  }

  if (mediaFile.size > 490 * 1024 * 1024) {
    showMessage(uploadMessage, "File 490 MB se chhoti honi chahiye.", true);
    return;
  }

  if (thumbnailFile && !thumbnailFile.type.startsWith("image/")) {
    showMessage(uploadMessage, "Thumbnail image file honi chahiye.", true);
    return;
  }

  isUploading = true;
  setButtonLoading(button, true, "Upload Media");

  const uploadedPaths = [];

  try {
    await authReady;

    let finalMediaFile = mediaFile;

    if (isImage) {
      showMessage(uploadMessage, "Photo par watermark lag raha hai...");
      finalMediaFile = await addPhotoWatermark(mediaFile);
    }

    const filePath =
      `${MEDIA_STORAGE_PATH}/${user.uid}/${Date.now()}_${safeFileName(finalMediaFile.name)}`;

    const mediaResult = await uploadFile(
      finalMediaFile,
      filePath,
      (percent) => updateProgress(percent, `Media upload: ${percent}%`)
    );

    uploadedPaths.push(mediaResult.path);

    let thumbnailUrl = "";
    let thumbnailPath = "";

    if (thumbnailFile) {
      const thumbPath =
        `viralEra/thumbnails/${user.uid}/${Date.now()}_${safeFileName(thumbnailFile.name)}`;

      const thumbResult = await uploadFile(
        thumbnailFile,
        thumbPath,
        (percent) => updateProgress(percent, `Thumbnail upload: ${percent}%`)
      );

      thumbnailUrl = thumbResult.url;
      thumbnailPath = thumbResult.path;
      uploadedPaths.push(thumbResult.path);
    } else if (isImage) {
      thumbnailUrl = mediaResult.url;
    }

    await addDoc(collection(db, MEDIA_COLLECTION), {
      type: isImage ? "photo" : "video",
      title,
      description,
      category,
      mediaUrl: mediaResult.url,
      thumbnailUrl,
      filePath: mediaResult.path,
      thumbnailPath,
      mimeType: finalMediaFile.type,
      size: finalMediaFile.size,
      published,
      createdBy: user.uid,
      createdAt: serverTimestamp()
    });

    uploadForm.reset();
    showMessage(uploadMessage, "Media successfully upload ho gaya!");
    updateProgress(100, "Upload complete");
  } catch (error) {
    console.error("Media upload error:", error);

    // Clean up uploaded files if Firestore save failed.
    // If cleanup is denied, remove the orphaned files manually from Storage.
    try {
      for (const path of uploadedPaths) {
        await deleteObject(ref(storage, path));
      }
    } catch (cleanupError) {
      console.warn("Upload cleanup issue:", cleanupError);
    }

    showMessage(
      uploadMessage,
      error.message || "Upload fail hua. Firebase Rules aur network check karo.",
      true
    );
  } finally {
    isUploading = false;
    setButtonLoading(button, false, "Upload Media");
  }
});

// ---------------- ADMIN MEDIA LIST ----------------

function renderStats() {
  const total = allMedia.length;
  const published = allMedia.filter((item) => item.published === true).length;

  if ($("totalMedia")) $("totalMedia").textContent = total;
  if ($("publishedMedia")) $("publishedMedia").textContent = published;
  if ($("draftMedia")) $("draftMedia").textContent = total - published;
}

function renderMediaList() {
  if (!adminMediaList) return;

  const search = ($("adminSearch")?.value || "").toLowerCase().trim();

  const filtered = allMedia.filter((item) =>
    `${item.title || ""} ${item.category || ""} ${item.type || ""}`
      .toLowerCase()
      .includes(search)
  );

  if (!filtered.length) {
    adminMediaList.innerHTML = "<p>No media found.</p>";
    return;
  }

  adminMediaList.innerHTML = filtered.map((item) => `
    <article class="admin-media-item" data-id="${safeText(item.id)}">
      <div class="admin-media-info">
        <strong>${safeText(item.title || "Untitled")}</strong>
        <p>${safeText(item.category || "")} · ${safeText(item.type || "")}</p>
        <p>${item.published ? "Published" : "Draft"}</p>
      </div>
      <div class="admin-media-actions">
        <button type="button" data-action="toggle">
          ${item.published ? "Unpublish" : "Publish"}
        </button>
        <button type="button" data-action="delete">Delete</button>
      </div>
    </article>
  `).join("");
}

function subscribeToMedia() {
  unsubscribeMedia?.();

  unsubscribeMedia = onSnapshot(
    collection(db, MEDIA_COLLECTION),
    (snapshot) => {
      allMedia = snapshot.docs.map((item) => ({
        id: item.id,
        ...item.data()
      }));

      allMedia.sort((a, b) => {
        const aTime = a.createdAt?.toMillis?.() || 0;
        const bTime = b.createdAt?.toMillis?.() || 0;
        return bTime - aTime;
      });

      renderStats();
      renderMediaList();
    },
    (error) => {
      console.error("Media list error:", error);
      if (adminMediaList) {
        adminMediaList.textContent =
          "Media load nahi hui. Firestore Rules check karo.";
      }
    }
  );
}

$("adminSearch")?.addEventListener("input", renderMediaList);

adminMediaList?.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const card = button.closest("[data-id]");
  const item = allMedia.find((media) => media.id === card?.dataset.id);

  if (!item || !isAuthorized(auth.currentUser)) {
    alert("Admin permission required.");
    return;
  }

  button.disabled = true;

  try {
    const itemRef = doc(db, MEDIA_COLLECTION, item.id);

    if (button.dataset.action === "toggle") {
      await updateDoc(itemRef, { published: !item.published });
    }

    if (button.dataset.action === "delete") {
      if (!confirm(`"${item.title}" ko permanently delete karna hai?`)) {
        return;
      }

      // Delete document first; if storage deletion fails, report the issue.
      await deleteDoc(itemRef);

      for (const path of [item.filePath, item.thumbnailPath]) {
        if (!path) continue;
        try {
          await deleteObject(ref(storage, path));
        } catch (error) {
          console.warn("Storage cleanup failed for", path, error);
        }
      }
    }
  } catch (error) {
    console.error("Media action error:", error);
    alert("Action fail hua. Firebase Rules check karo.");
  } finally {
    button.disabled = false;
  }
});

// ---------------- AUTH STATE ----------------

onAuthStateChanged(auth, async (user) => {
  await authReady;

  if (isAuthorized(user)) {
    showDashboard();
    subscribeToMedia();
  } else {
    unsubscribeMedia?.();
    unsubscribeMedia = null;
    allMedia = [];
    showLogin();
  }
});