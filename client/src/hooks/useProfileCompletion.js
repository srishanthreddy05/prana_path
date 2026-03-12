import { useState, useEffect } from "react";
import { getProfile } from "../services/profileService";

const isFilled = (value) => typeof value === "string" && value.trim().length > 0;

const isProfileCompleteFromUser = (user) => {
  if (!user) return false;

  const name = user.displayName || user.name || "";
  const mobile = user.mobile || user.mobileNumber || "";
  const dob = user.dob || user.dateOfBirth || "";
  const bloodGroup = user.bloodGroup || "";
  const area = user.area || "";
  const pincode = user.pincode || "";

  return (
    isFilled(name) &&
    /^\d{10}$/.test(String(mobile).trim()) &&
    isFilled(String(dob)) &&
    isFilled(bloodGroup) &&
    isFilled(area) &&
    /^\d{6}$/.test(String(pincode).trim())
  );
};

/**
 * Custom hook to fetch and manage user profile completion status
 */
export const useProfileCompletion = (isLoggedIn) => {
  const [isProfileComplete, setIsProfileComplete] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isLoggedIn) {
      setIsProfileComplete(false);
      return;
    }

    const fetchProfileStatus = async () => {
      setIsLoading(true);
      try {
        const user = await getProfile();
        const completed = user.isProfileComplete ?? isProfileCompleteFromUser(user);
        setIsProfileComplete(Boolean(completed));
      } catch (err) {
        console.error("Error fetching profile:", err);
        setIsProfileComplete(false);
      } finally {
        setIsLoading(false);
      }
    };

    fetchProfileStatus();
  }, [isLoggedIn]);

  return { isProfileComplete, isLoading };
};
