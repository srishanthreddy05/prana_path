import React from "react";
import "../styles/popupModal.css";

const PopupModal = ({ open, message, onClose }) => {
  if (!open) return null;
  return (
    <div className="popup-modal-overlay">
      <div className="popup-modal-content">
        <p>{message}</p>
        <button className="popup-modal-close" onClick={onClose}>OK</button>
      </div>
    </div>
  );
};

export default PopupModal;
