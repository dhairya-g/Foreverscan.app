import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import DocScanner from './components/DocScanner';
import ImageEditor from './components/ImageEditor';
import Compressor from './components/Compressor';
import PdfEditor from './components/PdfEditor';
import { PrivacyModal, AboutModal, VersionModal, FeedbackModal } from './components/Modals';

export default function App() {
  const [activeModule, setActiveModule] = useState('document');
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('Processing...');

  // State to hold and transfer Edited Images between modules
  const [transferData, setTransferData] = useState(null); 

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  const showLoader = (txt = "Processing...") => {
    setLoadingText(txt);
    setLoading(true);
  };

  const hideLoader = () => setLoading(false);

  return (
    <div className="app-wrapper">
      <style>{`
        #global-loader {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background-color: rgba(255, 255, 255, 0.85);
          backdrop-filter: blur(3px); 
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          z-index: 99999;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.3s ease;
        }
        #global-loader.active {
          opacity: 1;
          pointer-events: auto;
        }
        .custom-spinner-wrapper {
          position: relative;
          width: 50px;
          height: 50px;
          animation: spin-container 1.8s linear infinite;
          margin-bottom: 1.5rem;
        }
        .custom-dot {
          position: absolute;
          width: 12px;
          height: 12px;
          background-color: var(--accent); 
          border-radius: 50%;
          animation: pulse-dot 1.2s ease-in-out infinite;
        }
        .custom-dot:nth-child(1) { top: 0; left: 19px; animation-delay: 0s; }
        .custom-dot:nth-child(2) { top: 14px; right: 0; animation-delay: 0.2s; }
        .custom-dot:nth-child(3) { bottom: 0; right: 6px; animation-delay: 0.4s; }
        .custom-dot:nth-child(4) { bottom: 0; left: 6px; animation-delay: 0.6s; }
        .custom-dot:nth-child(5) { top: 14px; left: 0; animation-delay: 0.8s; }

        @keyframes spin-container {
          100% { transform: rotate(360deg); }
        }
        @keyframes pulse-dot {
          0%, 100% { transform: scale(0.7); opacity: 0.5; }
          50% { transform: scale(1.2); opacity: 1; }
        }
        .loader-text {
          font-family: 'Inter', sans-serif;
          font-weight: 700;
          color: #111827;
          font-size: 1.1rem;
          letter-spacing: 0.5px;
        }
      `}</style>

      <Navbar 
        activeModule={activeModule} 
        setActiveModule={setActiveModule} 
        goHome={() => setActiveModule('document')} 
      />

      <main style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
        
        <div style={{ display: activeModule === 'document' ? 'flex' : 'none', flex: 1, overflow: 'hidden' }}>
          <DocScanner 
            showToast={showToast} 
            triggerFeedback={() => setModal('feedback')} 
            showLoader={showLoader} 
            hideLoader={hideLoader}
            transferData={transferData} 
          />
        </div>
        
        <div style={{ display: activeModule === 'image' ? 'flex' : 'none', flex: 1, overflow: 'hidden' }}>
          <ImageEditor 
            showToast={showToast} 
            triggerFeedback={() => setModal('feedback')} 
            showLoader={showLoader} 
            hideLoader={hideLoader} 
            goHome={() => setActiveModule('document')}
            onTransferToDoc={(imgDataUrl, targetSlot) => {
              setTransferData({ id: Date.now(), image: imgDataUrl, slot: targetSlot });
              setActiveModule('document'); 
            }}
          />
        </div>
        
        <div style={{ display: activeModule === 'compress' ? 'flex' : 'none', flex: 1, overflow: 'hidden' }}>
          <Compressor 
            showToast={showToast} 
            triggerFeedback={() => setModal('feedback')} 
            showLoader={showLoader} 
            hideLoader={hideLoader} 
          />
        </div>

        <div style={{ display: activeModule === 'pdf' ? 'flex' : 'none', flex: 1, overflow: 'hidden' }}>
          <PdfEditor 
            showToast={showToast} 
            triggerFeedback={() => setModal('feedback')} 
            showLoader={showLoader} 
            hideLoader={hideLoader} 
          />
        </div>
      </main>

      <Footer openModal={(type) => setModal(type)} />

      {modal === 'privacy' && <PrivacyModal onClose={() => setModal(null)} />}
      {modal === 'about' && <AboutModal onClose={() => setModal(null)} />}
      {modal === 'version' && <VersionModal onClose={() => setModal(null)} />}
      {modal === 'feedback' && <FeedbackModal onClose={() => setModal(null)} showToast={showToast} />}

      <div id="global-loader" className={loading ? 'active' : ''}>
        <div className="custom-spinner-wrapper">
          <div className="custom-dot"></div>
          <div className="custom-dot"></div>
          <div className="custom-dot"></div>
          <div className="custom-dot"></div>
          <div className="custom-dot"></div>
        </div>
        <div className="loader-text">{loadingText}</div>
      </div>

      <div id="toast" className={`toast ${toast ? 'show' : ''}`}>{toast}</div>
    </div>
  );
}