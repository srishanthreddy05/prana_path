// src/utils/api.js
import { auth } from "../firebase";

const API_BASE_URL =
  process.env.REACT_APP_API_BASE_URL || "http://localhost:5000/api";

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

  return fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });
}
