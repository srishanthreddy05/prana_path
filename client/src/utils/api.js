// src/utils/api.js
import { auth } from "../firebase";

const DEFAULT_PROD_API_BASE_URL = "https://prana-path.onrender.com/api";
const DEFAULT_DEV_API_BASE_URL = "http://localhost:5000/api";
const isProduction = process.env.NODE_ENV === "production";

const isLocalhostUrl = (url) =>
  /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test((url || "").trim());

export const API_BASE_URL = (() => {
  const configured = process.env.REACT_APP_API_BASE_URL?.trim();

  if (!configured) {
    return isProduction ? DEFAULT_PROD_API_BASE_URL : DEFAULT_DEV_API_BASE_URL;
  }

  if (isProduction && isLocalhostUrl(configured)) {
    return DEFAULT_PROD_API_BASE_URL;
  }

  return configured.replace(/\/+$/, "");
})();

/**
 * Authenticated fetch using Firebase ID token.
 * The token is fetched fresh each call (Firebase SDK auto-refreshes it).
 */
export async function authFetch(path, options = {}) {
  let token = null;
  try {
    if (auth.currentUser) {
      token = await auth.currentUser.getIdToken();
    }
  } catch (err) {
    console.warn("Could not get Firebase ID token:", err.message);
  }

  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  return fetch(`${API_BASE_URL}${normalizedPath}`, {
    ...options,
    headers,
  });
}
