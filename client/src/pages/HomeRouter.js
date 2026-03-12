import { Navigate } from "react-router-dom";
import UserHome from "./UserHome";
import { auth } from "../firebase";

function HomeRouter({ showToast }) {
  const isLoggedIn =
    !!auth.currentUser || localStorage.getItem("isLoggedIn") === "true";
  const role = localStorage.getItem("role");

  if (isLoggedIn) {
    if (!role) return null;
    if (role === "driver") return <Navigate to="/driver" replace />;
    if (role === "police") return <Navigate to="/police" replace />;
  }

  return <UserHome showToast={showToast} />;
}

export default HomeRouter;
