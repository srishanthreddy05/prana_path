// Profile service for API operations
import { authFetch } from "../utils/api";

export const getProfile = async () => {
  const res = await authFetch("/users/profile");

  if (!res.ok) {
    throw new Error("Failed to fetch profile");
  }

  return await res.json();
};

export const updateProfile = async (profileData) => {
  const res = await authFetch("/users/profile", {
    method: "PUT",
    body: JSON.stringify(profileData),
  });

  if (!res.ok) {
    const errData = await res.json();
    throw new Error(errData.message || "Failed to update profile");
  }

  return await res.json();
};
