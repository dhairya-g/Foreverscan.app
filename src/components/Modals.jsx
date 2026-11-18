import React, { useState, useEffect } from 'react';
import { X, Check, Loader2, Heart, Star } from 'lucide-react';

// Reusable styling for the shared Modal layout (Mobile Responsive Optimized)
const modalStyles = {
  overlay: {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex', justifyContent: 'center', alignItems: 'center',
    zIndex: 9999, padding: 'clamp(0.5rem, 3vw, 1rem)' 
  },
  content: {
    background: '#FFFFFF',
    borderRadius: '12px',
    width: '100%',
    maxWidth: '750px', 
    maxHeight: '90vh', 
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
    transition: 'all 0.3s ease'
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: 'clamp(1rem, 4vw, 1.5rem) clamp(1.2rem, 5vw, 2rem)', 
    borderBottom: '1px solid #E5E7EB'
  },
  title: {
    margin: 0, 
    fontSize: 'clamp(1.1rem, 4vw, 1.25rem)', 
    fontWeight: '700', color: '#111827', display: 'flex', alignItems: 'center', gap: '8px'
  },
  body: {
    padding: 'clamp(1.2rem, 5vw, 2rem)', 
    overflowY: 'auto', flex: 1,
    color: '#4B5563', fontSize: 'clamp(0.85rem, 3vw, 0.95rem)', lineHeight: '1.6'
  },
  footer: {
    padding: 'clamp(1rem, 4vw, 1.5rem) clamp(1.2rem, 5vw, 2rem)', 
    borderTop: '1px solid #E5E7EB',
    display: 'flex', justifyContent: 'flex-end', backgroundColor: '#F9FAFB',
    borderBottomLeftRadius: '12px', borderBottomRightRadius: '12px',
    alignItems: 'center',
    flexWrap: 'wrap', 
    gap: '10px'
  },
  closeBtn: {
    backgroundColor: '#E0243A', color: '#FFF', border: 'none',
    padding: '8px 24px', borderRadius: '6px', fontWeight: '600',
    cursor: 'pointer', transition: 'background-color 0.2s',
    fontSize: 'clamp(0.85rem, 3vw, 0.95rem)'
  },
  bulletList: {
    listStyleType: 'disc', paddingLeft: '1.5rem', marginBottom: '1.5rem', color: '#4B5563'
  },
  checkListItem: {
    display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '0.5rem', paddingLeft: '0.5rem'
  },
  checkIcon: {
    color: '#10B981', flexShrink: 0, marginTop: '2px'
  }
};

// ==========================================
// NEW: WELCOME MODAL FOR PDF MODIFIER
// ==========================================
export function WelcomeModal({ onClose }) {
  return (
    <div style={modalStyles.overlay} onClick={onClose}>
      <div style={{ ...modalStyles.content, maxWidth: '500px', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: 'clamp(2rem, 5vw, 3rem) clamp(1rem, 4vw, 2rem)' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
            <div style={{ fontSize: '3.5rem' }}>🚀</div>
          </div>
          
          <h2 style={{ fontSize: 'clamp(1.5rem, 5vw, 1.75rem)', fontWeight: '800', color: '#111827', marginBottom: '1rem' }}>
            New Release
          </h2>
          
          <p style={{ color: '#4B5563', fontSize: '0.95rem', lineHeight: '1.6', marginBottom: '2.5rem', padding: '0 1rem' }}>
            Experience a completely new way to interact with your PDFs. You can now seamlessly navigate your documents and modify them using powerful tools. Easily add text, custom shapes, images, highlights, or your personal signature. You can even erase mistakes—all with extensive customization options tailored to your needs.
          </p>

          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <button 
              onClick={onClose} 
              style={{ ...modalStyles.closeBtn, width: '100%', maxWidth: '300px', padding: '14px 24px', fontSize: '1rem', borderRadius: '8px' }}
            >
              Let's Explore
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function VersionModal({ onClose }) {
  return (
    <div style={modalStyles.overlay} onClick={onClose}>
      <div style={modalStyles.content} onClick={e => e.stopPropagation()}>
        <div style={modalStyles.header}>
          <h2 style={modalStyles.title}>Release Notes</h2>
          <X size={20} color="#6B7280" style={{ cursor: 'pointer' }} onClick={onClose} />
        </div>
        <div style={modalStyles.body}>

          {/* VERSION 1.2.1 */}
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', gap: '10px' }}>
            <h3 style={{ fontSize: 'clamp(1rem, 3.5vw, 1.1rem)', fontWeight: '700', color: '#111827', margin: 0 }}>Version 1.2.1 – Complete PDF Modification Suite</h3>
            <span style={{ fontSize: '0.85rem', color: '#6B7280', fontWeight: '600', backgroundColor: '#F3F4F6', padding: '4px 10px', borderRadius: '6px' }}>15 Aug 2026</span>
          </div>
          <ul style={modalStyles.bulletList}>
            <li style={{ marginBottom: '1.25rem' }}>
              <strong style={{ color: '#111827' }}>Overview:</strong> This major release transforms how you work with PDFs by introducing a powerful modification suite. You now have complete control to interact, annotate, and customize your documents directly in the browser with maximum efficiency.
            </li>
            <li style={{ marginBottom: '1.25rem' }}>
              <strong style={{ color: '#111827' }}>Explore & Navigate:</strong>
              <div style={{ marginTop: '0.75rem' }}>
                <div style={modalStyles.checkListItem}><Check size={18} style={modalStyles.checkIcon} /><span>Seamlessly browse and interact with your PDF files.</span></div>
              </div>
            </li>
            <li style={{ marginBottom: '1.25rem' }}>
              <strong style={{ color: '#111827' }}>Rich Annotations:</strong>
              <div style={{ marginTop: '0.75rem' }}>
                <div style={modalStyles.checkListItem}><Check size={18} style={modalStyles.checkIcon} /><span>Effortlessly modify your documents by adding custom text, geometric shapes, and inserting images.</span></div>
              </div>
            </li>
            <li style={{ marginBottom: '1.25rem' }}>
              <strong style={{ color: '#111827' }}>Markup & Corrections:</strong>
              <div style={{ marginTop: '0.75rem' }}>
                <div style={modalStyles.checkListItem}><Check size={18} style={modalStyles.checkIcon} /><span>Highlight crucial information or use the new eraser tool to make quick, clean corrections.</span></div>
              </div>
            </li>
            <li style={{ marginBottom: '1rem' }}>
              <strong style={{ color: '#111827' }}>Digital Signatures:</strong>
              <div style={{ marginTop: '0.75rem' }}>
                <div style={modalStyles.checkListItem}><Check size={18} style={modalStyles.checkIcon} /><span>Sign your documents instantly with a highly customizable signature tool.</span></div>
              </div>
            </li>
          </ul>
          <hr style={{ borderTop: '1px solid #E5E7EB', margin: '2rem 0' }} />

          {/* VERSION 1.2 */}
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', gap: '10px' }}>
            <h3 style={{ fontSize: 'clamp(1rem, 3.5vw, 1.1rem)', fontWeight: '700', color: '#111827', margin: 0 }}>Version 1.2 – New Features and UI Fixes</h3>
            <span style={{ fontSize: '0.85rem', color: '#6B7280', fontWeight: '600', backgroundColor: '#F3F4F6', padding: '4px 10px', borderRadius: '6px' }}>10 Aug 2026</span>
          </div>
          <ul style={modalStyles.bulletList}>
            <li style={{ marginBottom: '1.25rem' }}>
              <strong style={{ color: '#111827' }}>Overview:</strong> This release elevates the image scanning workflow by providing users with greater control over their documents. You can now seamlessly upload images onto the canvas and utilize our new precision cropping tool to perfectly frame your files before applying advanced edits. Additionally, we have streamlined the transfer process to the Document Scanner and optimized the compression engine for batch processing.
            </li>
            <li style={{ marginBottom: '1.25rem' }}>
              <strong style={{ color: '#111827' }}>Advanced Image Cropping:</strong>
              <div style={{ marginTop: '0.75rem' }}>
                <div style={modalStyles.checkListItem}><Check size={18} style={modalStyles.checkIcon} /><span>Added the ability to precisely crop and adjust images immediately after uploading them to the canvas, ensuring perfectly framed documents.</span></div>
              </div>
            </li>
            <li style={{ marginBottom: '1.25rem' }}>
              <strong style={{ color: '#111827' }}>Enhanced Image Scanning & Editing:</strong>
              <div style={{ marginTop: '0.75rem' }}>
                <div style={modalStyles.checkListItem}><Check size={18} style={modalStyles.checkIcon} /><span>Introduced an advanced canvas for comprehensive Image editing and manipulation.</span></div>
                <div style={modalStyles.checkListItem}><Check size={18} style={modalStyles.checkIcon} /><span>Enabled seamless, one-click transfer of edited images directly into the Document Scanner module across all scan modes.</span></div>
              </div>
            </li>
            <li style={{ marginBottom: '1rem' }}>
              <strong style={{ color: '#111827' }}>Upgraded Compression Engine:</strong>
              <div style={{ marginTop: '0.75rem' }}>
                <div style={modalStyles.checkListItem}><Check size={18} style={modalStyles.checkIcon} /><span>Upgraded the compressor to support batch processing, allowing users to compress multiple files simultaneously.</span></div>
              </div>
            </li>
          </ul>
          <hr style={{ borderTop: '1px solid #E5E7EB', margin: '2rem 0' }} />
          
          {/* VERSION 1.1 */}
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', gap: '10px' }}>
            <h3 style={{ fontSize: 'clamp(1rem, 3.5vw, 1.1rem)', fontWeight: '700', color: '#111827', margin: 0 }}>Version 1.1 – Enhanced Document Setup and New Features</h3>
            <span style={{ fontSize: '0.85rem', color: '#6B7280', fontWeight: '600', backgroundColor: '#F3F4F6', padding: '4px 10px', borderRadius: '6px' }}>05 Aug 2026</span>
          </div>
          <ul style={modalStyles.bulletList}>
            <li style={{ marginBottom: '1.25rem' }}>
              <strong style={{ color: '#111827' }}>Overview:</strong> This release focused on improving the document creation workflow, enabling multiple scans, and providing document editing capabilities.
            </li>
            <li style={{ marginBottom: '1.25rem' }}>
              <strong style={{ color: '#111827' }}>Improved Document Setup:</strong>
              <div style={{ marginTop: '0.75rem' }}>
                <div style={modalStyles.checkListItem}><Check size={18} style={modalStyles.checkIcon} /><span>Enhanced document organization and setup process.</span></div>
                <div style={modalStyles.checkListItem}><Check size={18} style={modalStyles.checkIcon} /><span>Better grouping and document structure for a smoother user experience.</span></div>
              </div>
            </li>
            <li style={{ marginBottom: '1.25rem' }}>
              <strong style={{ color: '#111827' }}>Scan Mode:</strong>
              <div style={{ marginTop: '0.75rem' }}>
                <div style={modalStyles.checkListItem}><Check size={18} style={modalStyles.checkIcon} /><span>Introduced Scan Mode, allowing users to scan multiple pages in a single session.</span></div>
                <div style={modalStyles.checkListItem}><Check size={18} style={modalStyles.checkIcon} /><span>Simplified the process of creating multi-page documents.</span></div>
              </div>
            </li>
            <li style={{ marginBottom: '1rem' }}>
              <strong style={{ color: '#111827' }}>Add Element Feature:</strong>
              <div style={{ marginTop: '0.75rem' }}>
                <div style={modalStyles.checkListItem}><Check size={18} style={modalStyles.checkIcon} /><span>Added text and signature overlay capabilities directly onto scanned pages.</span></div>
              </div>
            </li>
          </ul>
        </div>
        <div style={modalStyles.footer}>
          <button style={modalStyles.closeBtn} onClick={onClose} onMouseOver={(e) => e.target.style.backgroundColor = '#C81E32'} onMouseOut={(e) => e.target.style.backgroundColor = '#E0243A'}>Close</button>
        </div>
      </div>
    </div>
  );
}

export function PrivacyModal({ onClose }) {
  return (
    <div style={modalStyles.overlay} onClick={onClose}>
      <div style={modalStyles.content} onClick={e => e.stopPropagation()}>
        <div style={modalStyles.header}>
          <h2 style={modalStyles.title}>Privacy Policy</h2>
          <X size={20} color="#6B7280" style={{ cursor: 'pointer' }} onClick={onClose} />
        </div>
        <div style={modalStyles.body}>
          <p style={{ marginBottom: '1.5rem' }}>In compliance with the Information Technology Act, 2000 and DPDP Act, 2023 of India, here is how we handle your data:</p>
          <ul style={modalStyles.bulletList}>
            <li style={{ marginBottom: '1rem' }}><strong style={{ color: '#111827' }}>Local Processing (Zero-Data Upload):</strong> All image cropping, document generation, and compression happen strictly locally in your browser. We never upload your sensitive documents to our servers.</li>
            <li style={{ marginBottom: '1rem' }}><strong style={{ color: '#111827' }}>Commitment to Purpose & Zero Data Retention:</strong> We are committed to providing a valuable solution needed for today's time. We do not save any user data. We encourage users to use this application strictly for their necessary processing purposes, and any feedback shared via our form is utilized solely to improve service quality.</li>
            <li style={{ marginBottom: '1rem' }}><strong style={{ color: '#111827' }}>Analytics & Data Collection:</strong> We only collect minimal anonymous analytics (like country/region) and optional demographic details if you voluntarily submit a feedback form.</li>
            <li style={{ marginBottom: '1rem' }}><strong style={{ color: '#111827' }}>Data Security:</strong> Any feedback data submitted is securely transmitted and stored using secure cloud databases. We do not sell or share your personal data with third-party marketers.</li>
            <li style={{ marginBottom: '1rem' }}><strong style={{ color: '#111827' }}>Cookies & Local Storage:</strong> We use your browser's local storage to save an anonymous user ID strictly for application functionality, not for tracking you across other websites.</li>
            <li style={{ marginBottom: '1rem' }}><strong style={{ color: '#111827' }}>Your Rights & Grievances:</strong> You have the right to request access to or deletion of any feedback data you have provided to us. For privacy concerns, please contact our support team through e-mail only. The grievance details will available soon.</li>
          </ul>
        </div>
        <div style={modalStyles.footer}>
          <button style={modalStyles.closeBtn} onClick={onClose} onMouseOver={(e) => e.target.style.backgroundColor = '#C81E32'} onMouseOut={(e) => e.target.style.backgroundColor = '#E0243A'}>Close</button>
        </div>
      </div>
    </div>
  );
}

export function AboutModal({ onClose }) {
    return (
      <div style={modalStyles.overlay} onClick={onClose}>
        <div style={modalStyles.content} onClick={e => e.stopPropagation()}>
          <div style={modalStyles.header}>
            <h2 style={modalStyles.title}>About Forever Scan</h2>
            <X size={20} color="#6B7280" style={{ cursor: 'pointer' }} onClick={onClose} />
          </div>
          <div style={modalStyles.body}>
            <p style={{ marginBottom: '1.5rem', fontWeight: '500', color: '#111827' }}>Developed with ❤️ in India by a self-taught creator, and co-written alongside advanced AI (Launched in August 2026).</p>
            <ul style={modalStyles.bulletList}>
              <li style={{ marginBottom: '1rem' }}><strong style={{ color: '#111827' }}>The Core Vision:</strong> Forever Scan is designed as a premier professional document utility engineered to tackle real-world daily challenges seamlessly.</li>
              <li style={{ marginBottom: '1rem' }}><strong style={{ color: '#111827' }}>Absolute Privacy & Purpose:</strong> We are fully committed to a zero-data retention model. All Document, Image, and PDF processing happens locally in your browser. We do not save or upload your files to any server.</li>
            </ul>
            
            <hr style={{ borderTop: '1px solid #E5E7EB', margin: '2rem 0' }} />
            
            <h3 style={{ fontSize: '1rem', fontWeight: '700', color: '#111827', marginBottom: '1rem' }}>Open-Source Credits & Licenses</h3>
            <p style={{ fontSize: '0.85rem', color: '#6B7280', marginBottom: '1rem' }}>Forever Scan utilizes the following open-source libraries to deliver local, secure processing. We are grateful to their contributors:</p>
            <ul style={modalStyles.bulletList}>
              <li style={{ fontSize: '0.8rem', marginBottom: '0.5rem' }}><strong>PDF.js (Mozilla):</strong> Used for secure, local rendering of PDF documents. (Apache License 2.0)</li>
              <li style={{ fontSize: '0.8rem', marginBottom: '0.5rem' }}><strong>pdf-lib:</strong> Used for creating and modifying PDF files natively in the browser. (MIT License)</li>
              <li style={{ fontSize: '0.8rem', marginBottom: '0.5rem' }}><strong>Cropper.js:</strong> Used for advanced image cropping and manipulation. (MIT License)</li>
              <li style={{ fontSize: '0.8rem', marginBottom: '0.5rem' }}><strong>jsPDF:</strong> Used for generating PDF files from scanned documents. (MIT License)</li>
              <li style={{ fontSize: '0.8rem', marginBottom: '0.5rem' }}><strong>Lucide Icons:</strong> Providing clean, beautiful SVG icons. (ISC License)</li>
            </ul>
          </div>
          <div style={modalStyles.footer}>
            <button style={modalStyles.closeBtn} onClick={onClose} onMouseOver={(e) => e.target.style.backgroundColor = '#C81E32'} onMouseOut={(e) => e.target.style.backgroundColor = '#E0243A'}>Close</button>
          </div>
        </div>
      </div>
    );
  }

export function FeedbackModal({ onClose, showToast }) {
  const [formData, setFormData] = useState({
    solved: '', experience: '', helpful: '', recommend: '', reuse: '', suggestion: ''
  });
  
  const [showError, setShowError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [countdown, setCountdown] = useState(7); 

  const wordCount = formData.suggestion.trim().split(/\s+/).filter(word => word.length > 0).length;
  const isOverLimit = wordCount > 200;
  
  const isPositiveExperience = formData.experience === 'Excellent' || formData.experience === 'Good';

  useEffect(() => {
    let timer;
    if (isSuccess && countdown > 0) {
      timer = setTimeout(() => setCountdown(prev => prev - 1), 1000);
    } else if (isSuccess && countdown === 0) {
      onClose();
    }
    return () => clearTimeout(timer);
  }, [isSuccess, countdown, onClose]);

  const getStoreLink = () => {
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    if (/android/i.test(userAgent)) {
      return "https://play.google.com/store/apps/details?id=com.whatsapp";
    }
    if (/iPad|iPhone|iPod/.test(userAgent) && !window.MSStream) {
      return "https://apps.apple.com/us/app/whatsapp-messenger/id310633997";
    }
    return "https://play.google.com/store/apps/details?id=com.whatsapp";
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (showError) setShowError(false);
  };

  const handleSubmit = () => {
    if (!formData.solved || !formData.experience || !formData.helpful || !formData.recommend || !formData.reuse) {
      setShowError(true);
      return;
    }
    if (isOverLimit) return; 
  
    setIsSubmitting(true);
  
    const scriptURL = "https://script.google.com/macros/s/AKfycbz_ggv2ZxlBr_jFaC0MMBu3UYk55w1pfke6G3p09BED4ScnYSt-6BkYBruIXGMxFOZ4Ug/exec"; 
  
    const submitData = new URLSearchParams();
    submitData.append("date", new Date().toLocaleString());
    submitData.append("solved", formData.solved);
    submitData.append("experience", formData.experience);
    submitData.append("helpful", formData.helpful);
    submitData.append("recommend", formData.recommend);
    submitData.append("reuse", formData.reuse);
    submitData.append("suggestion", formData.suggestion);
  
    // OPTIMISTIC UI: Fire and Forget (Removed await)
    fetch(scriptURL, { 
      method: 'POST', 
      body: submitData.toString(), 
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      mode: 'no-cors' 
    }).catch(error => {
      console.error('Error submitting feedback silently:', error);
    });
    
    // Fake UX loader for 1.5 seconds to show instant gratification
    setTimeout(() => {
      setIsSubmitting(false);
      setIsSuccess(true);
    }, 1500);
  };

  const questionStyle = { marginBottom: '1.25rem' };
  const labelStyle = { display: 'block', fontSize: '0.85rem', fontWeight: '700', color: '#111827', marginBottom: '8px' };
  const radioGroupStyle = { display: 'flex', flexWrap: 'wrap', gap: '6px' };
  
  // COMPACT CHIPS STYLING
  const radioLabelStyle = (checked) => ({
    display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer',
    fontSize: '0.75rem', color: checked ? '#E0243A' : '#4B5563',
    fontWeight: checked ? '700' : '500',
    backgroundColor: checked ? 'var(--accent-light, #FEE2E2)' : '#F3F4F6',
    padding: '4px 10px', 
    borderRadius: '4px', 
    transition: 'all 0.2s ease',
    flex: '1 1 auto', justifyContent: 'center' 
  });

  // Render Loader State
  if (isSubmitting) {
    return (
      <div style={modalStyles.overlay} onClick={(e) => e.stopPropagation()}>
        <div style={{ ...modalStyles.content, maxWidth: '500px', padding: '3rem', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
          <Loader2 size={48} color="#E0243A" style={{ animation: 'spin 1s linear infinite', marginBottom: '1rem' }} />
          <h3 style={{ fontSize: '1.25rem', color: '#111827', margin: 0 }}>Submitting Feedback...</h3>
        </div>
      </div>
    );
  }

  // Render Success State
  if (isSuccess) {
    return (
      <div style={modalStyles.overlay} onClick={onClose}>
        <div style={{ ...modalStyles.content, maxWidth: '500px', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
          <div style={{ padding: 'clamp(2rem, 5vw, 3rem) clamp(1rem, 4vw, 2rem)' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
              <div style={{ backgroundColor: '#FEE2E2', padding: '1rem', borderRadius: '50%' }}>
                <Heart size={48} color="#E0243A" fill="#E0243A" />
              </div>
            </div>
            
            <h2 style={{ fontSize: 'clamp(1.5rem, 5vw, 1.75rem)', fontWeight: '700', color: '#111827', marginBottom: '1rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
              Thank You!
            </h2>
            
            <p style={{ color: '#4B5563', fontSize: 'clamp(0.95rem, 4vw, 1.05rem)', lineHeight: '1.6', marginBottom: '2.5rem', padding: '0 1rem' }}>
              Thanks for helping us improve Forever Scan.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}>
              <button 
                onClick={onClose} 
                style={{ ...modalStyles.closeBtn, width: '100%', maxWidth: '300px', padding: '12px 24px', fontSize: '1rem' }}
              >
                Back to Home
              </button>

              {isPositiveExperience && (
                <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.9rem', color: '#6B7280', fontWeight: '500' }}>Enjoying Forever Scan?</span>
                  <a 
                    href={getStoreLink()}
                    target="_blank" 
                    rel="noopener noreferrer"
                    style={{ 
                      display: 'flex', alignItems: 'center', gap: '8px', 
                      color: '#111827', textDecoration: 'none', fontWeight: '600', 
                      border: '1px solid #D1D5DB', padding: '8px 24px', borderRadius: '6px',
                      transition: 'background-color 0.2s', backgroundColor: '#FFF',
                      width: '100%', maxWidth: '300px', justifyContent: 'center'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#F9FAFB'}
                    onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#FFF'}
                  >
                    Rate us <Star size={16} color="#F59E0B" fill="#F59E0B" />
                  </a>
                </div>
              )}
            </div>
          </div>
          
          <div style={{ ...modalStyles.footer, justifyContent: 'center', padding: '1rem', backgroundColor: '#F9FAFB' }}>
            <span style={{ fontSize: '0.85rem', color: '#9CA3AF', fontWeight: '500' }}>
              Returning to Home in {countdown} seconds...
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Render Form State
  return (
    <div style={modalStyles.overlay} onClick={onClose}>
      <div style={{ ...modalStyles.content, maxWidth: '600px' }} onClick={e => e.stopPropagation()}>
        <div style={modalStyles.header}>
          <h2 style={modalStyles.title}>Help Us Improve 😊</h2>
          <X size={20} color="#6B7280" style={{ cursor: 'pointer' }} onClick={onClose} />
        </div>
        
        <div style={modalStyles.body}>
          <p style={{ marginBottom: '1.5rem', color: '#6B7280' }}>
            Your insights help us refine our real-world solutions. Please answer a few quick questions about your experience.
          </p>

          <div style={questionStyle}>
            <label style={labelStyle}>1. Did this tool solve your real-world problem?</label>
            <div style={radioGroupStyle}>
              {['Yes, completely', 'Partially', 'No, it didn\'t'].map(opt => (
                <label key={opt} style={radioLabelStyle(formData.solved === opt)}>
                  <input type="radio" hidden checked={formData.solved === opt} onChange={() => handleChange('solved', opt)} />
                  {opt}
                </label>
              ))}
            </div>
          </div>

          <div style={questionStyle}>
            <label style={labelStyle}>2. How would you rate your overall experience?</label>
            <div style={radioGroupStyle}>
              {['Excellent', 'Good', 'Average', 'Poor'].map(opt => (
                <label key={opt} style={radioLabelStyle(formData.experience === opt)}>
                  <input type="radio" hidden checked={formData.experience === opt} onChange={() => handleChange('experience', opt)} />
                  {opt}
                </label>
              ))}
            </div>
          </div>

          <div style={questionStyle}>
            <label style={labelStyle}>3. How helpful did you find the editing features?</label>
            <div style={radioGroupStyle}>
              {['Very Helpful', 'Somewhat Helpful', 'Not Helpful'].map(opt => (
                <label key={opt} style={radioLabelStyle(formData.helpful === opt)}>
                  <input type="radio" hidden checked={formData.helpful === opt} onChange={() => handleChange('helpful', opt)} />
                  {opt}
                </label>
              ))}
            </div>
          </div>

          <div style={questionStyle}>
            <label style={labelStyle}>4. How likely are you to recommend this tool?</label>
            <div style={radioGroupStyle}>
              {['Very Likely', 'Likely', 'Unlikely'].map(opt => (
                <label key={opt} style={radioLabelStyle(formData.recommend === opt)}>
                  <input type="radio" hidden checked={formData.recommend === opt} onChange={() => handleChange('recommend', opt)} />
                  {opt}
                </label>
              ))}
            </div>
          </div>

          <div style={questionStyle}>
            <label style={labelStyle}>5. Will you use this tool again in the future?</label>
            <div style={radioGroupStyle}>
              {['Definitely', 'Maybe', 'No'].map(opt => (
                <label key={opt} style={radioLabelStyle(formData.reuse === opt)}>
                  <input type="radio" hidden checked={formData.reuse === opt} onChange={() => handleChange('reuse', opt)} />
                  {opt}
                </label>
              ))}
            </div>
          </div>

          <div style={{ marginTop: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '8px' }}>
              <label style={{ ...labelStyle, margin: 0 }}>Any suggestions to improve the product?</label>
              <span style={{ fontSize: '0.75rem', fontWeight: '600', color: isOverLimit ? '#E0243A' : '#9CA3AF' }}>
                {wordCount} / 200 words
              </span>
            </div>
            <textarea 
              style={{ 
                width: '100%', height: '100px', padding: '10px', borderRadius: '6px', boxSizing: 'border-box',
                border: `1px solid ${isOverLimit ? '#E0243A' : '#D1D5DB'}`, resize: 'vertical', 
                fontFamily: 'inherit', fontSize: '0.85rem', outline: 'none' 
              }} 
              placeholder="Type your suggestions here (optional)..."
              value={formData.suggestion}
              onChange={(e) => handleChange('suggestion', e.target.value)}
            ></textarea>
          </div>
        </div>

        <div style={modalStyles.footer}>
          {showError && <span style={{ color: '#E0243A', fontSize: '0.8rem', fontWeight: '600', width: '100%', marginBottom: '8px' }}>* Please answer all required questions.</span>}
          
          <div style={{ display: 'flex', gap: '10px', width: '100%', justifyContent: 'flex-end' }}>
            <button style={{ padding: '8px 24px', borderRadius: '6px', cursor: 'pointer', border: '1px solid #D1D5DB', background: '#FFF', flex: '1 1 auto', maxWidth: '120px' }} onClick={onClose}>
              Cancel
            </button>
            
            <button 
              style={{ ...modalStyles.closeBtn, opacity: isOverLimit ? 0.5 : 1, cursor: isOverLimit ? 'not-allowed' : 'pointer', flex: '1 1 auto', maxWidth: '200px' }} 
              onClick={handleSubmit} 
              disabled={isOverLimit}
            >
              Submit Feedback
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}