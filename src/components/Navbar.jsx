import React, { useState, useEffect } from 'react';
import { Menu, X } from 'lucide-react';

export default function Navbar({ activeModule, setActiveModule, goHome }) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showNewTag, setShowNewTag] = useState(true);

  // Check LocalStorage to see if user has already clicked PDF Modifier
  useEffect(() => {
    const hasSeen = localStorage.getItem('hasSeenPdfModifierNewTag');
    if (hasSeen) {
      setShowNewTag(false);
    }
  }, []);

  // Globally listen for custom cross-component module switching (e.g. from Scanner -> Compressor)
  useEffect(() => {
    const handleSwitchModule = (e) => {
        if (e.detail && setActiveModule) {
            handleNav(e.detail);
        }
    };
    window.addEventListener('switch-module', handleSwitchModule);
    return () => window.removeEventListener('switch-module', handleSwitchModule);
  }, [setActiveModule]);

  const handleNav = (module) => {
    setActiveModule(module);
    setIsMobileMenuOpen(false);
    
    // Remove "Micro Dot" permanently when clicked
    if (module === 'pdf') {
      setShowNewTag(false);
      localStorage.setItem('hasSeenPdfModifierNewTag', 'true');
    }
  };

  return (
    <header className="navbar">
      {/* Pulsing Dot Animation Styles */}
      <style>{`
        @keyframes pulse-dot {
          0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(224, 36, 58, 0.7); }
          70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(224, 36, 58, 0); }
          100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(224, 36, 58, 0); }
        }
        .micro-dot {
          width: 8px;
          height: 8px;
          background-color: var(--accent, #E0243A);
          border-radius: 50%;
          margin-left: 6px;
          animation: pulse-dot 2s infinite;
          flex-shrink: 0;
        }
      `}</style>

      <div className="header-left">
        <div className="logo" onClick={() => { 
            goHome(); 
            setIsMobileMenuOpen(false); 
            window.dispatchEvent(new Event('reset-doc-scanner')); 
        }}>
          <div className="logo-main" style={{ display: 'flex', alignItems: 'center' }}>
            <img src="/foreverscan_logo.svg" alt="Forever Scan" style={{ height: '40px', objectFit: 'contain' }} />
          </div>
        </div>
      </div>

      <button className="mobile-menu-btn" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
        {isMobileMenuOpen ? <X size={28} /> : <Menu size={28} />}
      </button>

      <ul className={`nav-menu ${isMobileMenuOpen ? 'mobile-open' : ''}`}>
        <li className={`nav-item ${activeModule === 'document' ? 'active' : ''}`} onClick={() => handleNav('document')}>
          Document Scanner
        </li>
        <li className={`nav-item ${activeModule === 'image' ? 'active' : ''}`} onClick={() => handleNav('image')}>
          Image Editor
        </li>
        <li 
          className={`nav-item ${activeModule === 'pdf' ? 'active' : ''}`} 
          onClick={() => handleNav('pdf')}
          style={{ display: 'inline-flex', alignItems: 'center' }}
        >
          PDF Modifier
          {showNewTag && <div className="micro-dot" title="New Updates Available"></div>}
        </li>
        <li className={`nav-item ${activeModule === 'compress' ? 'active' : ''}`} onClick={() => handleNav('compress')}>
          File Compressor
        </li>
      </ul>

      <div className="header-right"></div>
    </header>
  );
}