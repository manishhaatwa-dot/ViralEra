import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import {
  getFirestore
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import {
  getStorage
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyCSwvVHyuYIYtr1rO3KTM5DHbXlgr3fXhU",
  authDomain: "project-c0197862-917c-4b93-895.firebaseapp.com",
  projectId: "project-c0197862-917c-4b93-895",
  storageBucket: "project-c0197862-917c-4b93-895.firebasestorage.app",
  messagingSenderId: "826056840289",
  appId: "1:826056840289:web:045b954389d593e28dc620"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

export const ADMIN_EMAIL = "opnora.web@gmail.com";

export const authReady = setPersistence(
  auth,
  browserLocalPersistence
);

export const MEDIA_COLLECTION = "viralerA_media";
export const MEDIA_STORAGE_PATH = "viralEra/media";