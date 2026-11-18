import React, { useState, useEffect } from 'react';
import { Globe } from 'lucide-react';
import { fetchTotalActions } from '../utils/analytics'; 

export default function Footer({ openModal }) {
  const BASE_COUNT = 1854; // Fallback safe-net
  
  // State 1: Target Count (Jo API se aayega ya memory me hoga)
  const [targetCount, setTargetCount] = useState(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('foreverScanCount') : null;
    return saved ? parseInt(saved, 10) : null; // null means strictly first-time user
  });

  // State 2: Display Count (Jo screen par dikhega)
  const [displayCount, setDisplayCount] = useState(targetCount);
  
  // State 3: Animation Trigger
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    const getLiveCount = async () => {
      const realActions = await fetchTotalActions();
      const newTotal = BASE_COUNT + realActions;
      
      setTargetCount(prev => {
        if (prev !== newTotal) {
          localStorage.setItem('foreverScanCount', newTotal.toString());
          return newTotal;
        }
        return prev;
      });
    };

    getLiveCount();
    const interval = setInterval(getLiveCount, 15000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') getLiveCount();
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Animation Engine: Trigger whenever targetCount is greater than displayCount
  useEffect(() => {
    if (targetCount === null) return; 
    
    if (displayCount === null) {
      // First load completed, show number directly without animation
      setDisplayCount(targetCount);
      return;
    }
    
    if (targetCount > displayCount) {
      // Trigger the Pop & Glow CSS class
      setIsAnimating(true);
      
      setTimeout(() => {
        setDisplayCount(targetCount); // Update the number midway through the animation
        
        // Remove animation class to settle back down
        setTimeout(() => {
          setIsAnimating(false);
        }, 400); 
      }, 150); 
    }
  }, [targetCount, displayCount]);

  return (
    <>
      {/* INLINE CSS FOR SHIMMER & POP ANIMATION */}
      <style>{`
        .shimmer-skeleton {
          display: inline-block;
          width: 50px;
          height: 16px;
          background: #E5E7EB;
          border-radius: 4px;
          position: relative;
          overflow: hidden;
          vertical-align: middle;
          margin: 0 6px;
        }
        .shimmer-skeleton::after {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0; bottom: 0;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent);
          transform: translateX(-100%);
          animation: shimmer 1.5s infinite;
        }
        @keyframes shimmer {
          100% { transform: translateX(100%); }
        }
        
        .animated-counter {
          display: inline-block;
          transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }
        .animated-counter.pop-glow {
          transform: translateY(-3px) scale(1.15);
          color: var(--accent, #E0243A) !important;
          text-shadow: 0 4px 12px rgba(224, 36, 58, 0.3);
        }
      `}</style>

      <div className="stats-strip">
        <div className="stats-content">
          <Globe size={16} />
          <span>
            Over 
            {displayCount === null ? (
              <span className="shimmer-skeleton"></span>
            ) : (
              <span className={`highlight-count animated-counter ${isAnimating ? 'pop-glow' : ''}`}>
                {' '}{displayCount.toLocaleString()}{' '}
              </span>
            )}
            documents processed globally
          </span>
        </div>
      </div>

      <footer className="footer">
        <div>&copy; 2026 Forever Scan. All rights reserved. Powered by Cropper.js</div>
        <div className="footer-links" style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
          <a href="#" style={{ fontSize: '0.75rem', fontWeight: '500', transition: 'color 0.2s' }} onClick={(e) => { e.preventDefault(); openModal('version'); }}>Release Notes</a>
          <a href="#" style={{ fontSize: '0.75rem', fontWeight: '500', transition: 'color 0.2s' }} onClick={(e) => { e.preventDefault(); openModal('privacy'); }}>Privacy Policy</a>
          <a href="#" style={{ fontSize: '0.75rem', fontWeight: '500', transition: 'color 0.2s' }} onClick={(e) => { e.preventDefault(); openModal('about'); }}>About Us</a>
        </div>
      </footer>
    </>
  );
}