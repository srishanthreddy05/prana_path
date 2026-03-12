import React from 'react';
import './Footer.css';

const Footer = () => {
  return (
    <footer className="footer">
      <div className="footer-content">
        <div className="footer-section contact">
          <h4>Contact Us</h4>
          <p>Email: <a href="mailto:smartambulance.in@gmail.com">smartambulance.in@gmail.com</a></p>
        </div>
        <div className="footer-section info">
          <p>Smart Ambulance &copy; {new Date().getFullYear()} - All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
