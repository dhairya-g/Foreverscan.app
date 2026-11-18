import React, { useState, useEffect, useRef, useCallback } from 'react';
import { jsPDF } from 'jspdf';
import { FileText, ArrowLeft, RotateCcw, PlusCircle, ChevronDown, Printer, Download, Info, LayoutTemplate, Columns, FileUp, Crop, Trash2, CheckCircle2, Type, PenTool, Wand2, AlertTriangle, Camera, Image as ImageIcon, Settings, Edit2, Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight, X, MousePointer2, PenLine } from 'lucide-react';

import { DndContext, closestCenter, MouseSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { trackUserAction } from '../utils/analytics';

const getDynamicLimits = (page, overrides = {}) => {
    const mergedPage = { ...page, ...overrides }; 
    if (!mergedPage) return { maxSize: 170, maxGap: 100 };
    try {
      const pad = 35;
      const pW = (mergedPage.sheetSize === 'a4-landscape' ? 297 : 210) - pad;
      const pH = (mergedPage.sheetSize === 'a4-landscape' ? 210 : 297) - pad;

      const getR = (img, crop) => {
        if (!img || !crop) return 1.5; 
        const cW = img.width * ((crop.r - crop.l) / 100);
        const cH = img.height * ((crop.b - crop.t) / 100);
        return cW / (cH || 1); 
      };

      const fR = getR(mergedPage.rawFrontImg, mergedPage.frontCrop);
      const bR = getR(mergedPage.rawBackImg, mergedPage.backCrop);
      const fWu = fR >= 1 ? 1 : fR; const fHu = fR >= 1 ? 1 / fR : 1;
      const bWu = bR >= 1 ? 1 : bR; const bHu = bR >= 1 ? 1 / bR : 1;

      let maxS = 200, maxG = 100;
      if (mergedPage.docMode === 'single') {
        maxS = Math.min(pW / fWu, pH / fHu);
      } else {
        const curGap = mergedPage.cardGapMM ?? 15;
        const curSize = mergedPage.cardSizeMM ?? 85;
        if (mergedPage.layout === 'vertical') {
          maxS = Math.min(pW / Math.max(fWu, bWu), (pH - curGap) / (fHu + bHu));
          maxG = Math.max(0, pH - (curSize * (fHu + bHu)));
        } else {
          maxS = Math.min((pW - curGap) / (fWu + bWu), pH / Math.max(fHu, bHu));
          maxG = Math.max(0, pW - (curSize * (fWu + bWu)));
        }
      }
      return { maxSize: Math.max(40, Math.floor(maxS)), maxGap: Math.max(0, Math.floor(maxG)) };
    } catch (e) {
      return { maxSize: 170, maxGap: 100 }; 
    }
};

const enforceLimits = (page, overrides = {}) => {
    if (!page) return page;
    try {
      const mergedPage = { ...page, ...overrides };
      const limits1 = getDynamicLimits(page, overrides); 
      let newSize = mergedPage.cardSizeMM ?? 85;
      if (newSize > limits1.maxSize) newSize = limits1.maxSize;
      const limits2 = getDynamicLimits(mergedPage, { cardSizeMM: newSize });
      let newGap = mergedPage.cardGapMM ?? 15;
      if (newGap > limits2.maxGap) newGap = limits2.maxGap;

      return { ...mergedPage, cardSizeMM: Math.max(40, newSize), cardGapMM: Math.max(0, newGap), elements: mergedPage.elements || [] };
    } catch (err) {
      return { ...page, ...overrides }; 
    }
};

const getSlotStyle = (img, sizeMM, isSingle, crop) => {
    let finalRatio = 1;
    if (img && crop) {
      const croppedWidth = img.width * ((crop.r - crop.l) / 100);
      const croppedHeight = img.height * ((crop.b - crop.t) / 100);
      finalRatio = croppedWidth / (croppedHeight || 1);
    }
    let width, height;
    if (finalRatio >= 1) { width = `${sizeMM}mm`; height = `${sizeMM / finalRatio}mm`; } 
    else { height = `${sizeMM}mm`; width = `${sizeMM * finalRatio}mm`; }
    return { width, height, flexShrink: 0 }; 
};

const LiveFilteredImage = ({ src, colorMode, crop, alt }) => {
    const canvasRef = useRef(null);

    useEffect(() => {
        if (!src) return;
        const img = new Image();
        img.src = src;
        img.onload = () => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);

            if (colorMode === 'bw') {
                ctx.filter = 'grayscale(100%) contrast(1.2)';
                ctx.drawImage(img, 0, 0);
            } else if (colorMode === 'filter') {
                const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const data = imgData.data;
                for (let i = 0; i < data.length; i += 4) {
                    let r = data[i]; let g = data[i + 1]; let b = data[i + 2];
                    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
                    if (lum > 140) { data[i] = 255; data[i+1] = 255; data[i+2] = 255; }
                    else if (lum > 75) { data[i] = Math.min(255, r * 1.05); data[i+1] = Math.min(255, g * 1.05); data[i+2] = Math.min(255, b * 1.05); }
                    else { data[i] = r * 0.7; data[i+1] = g * 0.7; data[i+2] = b * 0.7; }
                }
                ctx.putImageData(imgData, 0, 0);
            }
        };
    }, [src, colorMode]);

    return (
        <canvas
            ref={canvasRef}
            title={alt}
            style={{
                position: 'absolute',
                top: `-${(crop.t / (crop.b - crop.t)) * 100}%`,
                left: `-${(crop.l / (crop.r - crop.l)) * 100}%`,
                width: `${100 / ((crop.r - crop.l) / 100)}%`,
                height: `${100 / ((crop.b - crop.t) / 100)}%`,
                objectFit: 'fill'
            }}
        />
    );
};

const OverlayElement = ({ element, pageId, updateElement, removeElement, activeContext, setActiveContext, setRightPanelOpen }) => {
  const isActive = activeContext?.elementId === element.id;
  const isEditing = isActive && activeContext?.mode === 'edit';

  const startDrag = (e) => {
    if (e.target.closest('.ds-action-btn') || e.target.closest('.ds-floating-actions') || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.closest('.ds-resize-dot')) return;
    e.preventDefault();
    e.stopPropagation(); 

    const paper = e.currentTarget.closest('.paper');
    const parentRect = paper.getBoundingClientRect();
    const elRect = e.currentTarget.getBoundingClientRect();
    
    const elWidthPercent = (elRect.width / parentRect.width) * 100;
    const elHeightPercent = (elRect.height / parentRect.height) * 100;
    
    const getClientXY = (evt) => {
        if (evt.touches) return { x: evt.touches[0].clientX, y: evt.touches[0].clientY };
        return { x: evt.clientX, y: evt.clientY };
    };
    
    const startPos = getClientXY(e);
    const startX = element.x;
    const startY = element.y;

    if (!isActive) {
        setActiveContext({ pageId, elementId: element.id, mode: 'select' });
        setRightPanelOpen(false);
    }

    const onMove = (moveEvt) => {
        const currentPos = getClientXY(moveEvt);
        const dx = currentPos.x - startPos.x;
        const dy = currentPos.y - startPos.y;
        
        const percentX = startX + (dx / parentRect.width) * 100;
        const percentY = startY + (dy / parentRect.height) * 100;
        
        const clampedX = Math.max(0, Math.min(100 - elWidthPercent, percentX));
        const clampedY = Math.max(0, Math.min(100 - elHeightPercent, percentY));

        updateElement(pageId, element.id, { x: clampedX, y: clampedY });
    };
    
    const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.removeEventListener('touchmove', onMove);
        document.removeEventListener('touchend', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onUp);
  };

  const renderResizeDots = () => {
    if (!isActive || isEditing || element.type === 'text') return null;
    
    const startResize = (e, factorY) => {
        e.stopPropagation(); e.preventDefault(); 
        const startY = e.clientY || (e.touches && e.touches[0].clientY); 
        const startScale = element.scale || 1;
        
        const onMove = (evt) => {
            const moveY = evt.clientY || (evt.touches && evt.touches[0].clientY);
            const delta = (moveY - startY) * factorY;
            updateElement(pageId, element.id, { scale: Math.max(0.1, startScale + delta) });
        };
        const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); document.removeEventListener('touchmove', onMove); document.removeEventListener('touchend', onUp); };
        document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp);
        document.addEventListener('touchmove', onMove, {passive: false}); document.addEventListener('touchend', onUp);
    };

    return (
        <>
            <div className="ds-resize-dot nw" onMouseDown={(e) => startResize(e, -0.005)} onTouchStart={(e) => startResize(e, -0.005)}></div>
            <div className="ds-resize-dot n" onMouseDown={(e) => startResize(e, -0.005)} onTouchStart={(e) => startResize(e, -0.005)}></div>
            <div className="ds-resize-dot ne" onMouseDown={(e) => startResize(e, -0.005)} onTouchStart={(e) => startResize(e, -0.005)}></div>
            <div className="ds-resize-dot w" onMouseDown={(e) => startResize(e, 0)} onTouchStart={(e) => startResize(e, 0)}></div>
            <div className="ds-resize-dot e" onMouseDown={(e) => startResize(e, 0)} onTouchStart={(e) => startResize(e, 0)}></div>
            <div className="ds-resize-dot sw" onMouseDown={(e) => startResize(e, 0.005)} onTouchStart={(e) => startResize(e, 0.005)}></div>
            <div className="ds-resize-dot s" onMouseDown={(e) => startResize(e, 0.005)} onTouchStart={(e) => startResize(e, 0.005)}></div>
            <div className="ds-resize-dot se" onMouseDown={(e) => startResize(e, 0.005)} onTouchStart={(e) => startResize(e, 0.005)}></div>
        </>
    );
  };

  return (
    <div 
        className={`ds-element-wrapper ${isActive ? 'active' : ''}`} 
        style={{ 
            left: `${element.x}%`, 
            top: `${element.y}%`, 
            position: 'absolute', 
            cursor: 'pointer', 
            zIndex: isActive ? 60 : 50,
            width: 'max-content' 
        }}
        onClick={(e) => {
            e.stopPropagation();
            if (!isActive) {
                setActiveContext({ pageId, elementId: element.id, mode: 'select' });
                setRightPanelOpen(false);
            }
        }}
        onMouseDown={startDrag}
        onTouchStart={startDrag}
        onDoubleClick={(e) => {
            if (element.type === 'text') {
                e.stopPropagation();
                setActiveContext({ pageId, elementId: element.id, mode: 'edit' });
            }
        }}
    >
        {renderResizeDots()}

        {element.type === 'text' && isEditing ? (
            <div style={{ display: 'inline-grid', width: 'max-content', alignItems: 'center' }}>
                <span style={{
                    gridArea: '1 / 1 / 2 / 2',
                    visibility: 'hidden',
                    whiteSpace: 'pre', 
                    padding: '10px 14px',
                    fontSize: `${element.fontSize || 40}px`,
                    fontFamily: element.fontFamily || 'Arial',
                    fontWeight: element.isBold ? 'bold' : 'normal',
                    fontStyle: element.isItalic ? 'italic' : 'normal',
                    lineHeight: 1.2,
                    textAlign: element.textAlign || 'left',
                    minWidth: '10px' 
                }}>
                    {element.content ? element.content + ' ' : 'Type here.. '}
                </span>
                <textarea 
                    value={element.content} 
                    onChange={(e) => {
                        updateElement(pageId, element.id, { content: e.target.value });
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                    placeholder="Type here.."
                    style={{ 
                        gridArea: '1 / 1 / 2 / 2',
                        width: '100%',
                        height: '100%',
                        resize: 'none',
                        overflow: 'hidden',
                        background: 'transparent',
                        border: 'none',
                        outline: 'none',
                        margin: 0,
                        boxSizing: 'border-box',
                        whiteSpace: 'pre',
                        padding: '10px 14px',
                        fontSize: `${element.fontSize || 40}px`, 
                        color: element.color || '#111827', 
                        fontWeight: element.isBold ? 'bold' : 'normal', 
                        fontStyle: element.isItalic ? 'italic' : 'normal',
                        textDecoration: element.isUnderline ? 'underline' : 'none', 
                        fontFamily: element.fontFamily || 'Arial', 
                        textAlign: element.textAlign || 'left',
                        lineHeight: 1.2
                    }}
                    autoFocus
                />
            </div>
        ) : element.type === 'text' ? (
            <div style={{ 
                whiteSpace: 'pre', 
                padding: '10px 14px', 
                fontSize: `${element.fontSize || 40}px`, 
                color: element.color || '#111827', 
                fontWeight: element.isBold ? 'bold' : 'normal', 
                fontStyle: element.isItalic ? 'italic' : 'normal',
                textDecoration: element.isUnderline ? 'underline' : 'none', 
                fontFamily: element.fontFamily || 'Arial', 
                textAlign: element.textAlign || 'left',
                opacity: element.content ? 1 : 0.5,
                lineHeight: 1.2,
                width: 'max-content'
            }}>
                {element.content || 'Type here..'}
            </div>
        ) : (
            <img 
                src={element.src} 
                alt="Signature" 
                style={{ width: `${150 * (element.scale || 1)}px`, pointerEvents: 'none', display: 'block' }} 
            />
        )}

        {isActive && (
            <div className="ds-floating-actions no-drag">
                {element.type === 'text' && (
                    <>
                        <button className="ds-action-btn" onMouseDown={(e) => { e.stopPropagation(); setActiveContext({ pageId, elementId: element.id, mode: 'edit' }); }} title="Edit Text">
                            <Edit2 size={32} color="#4B5563" />
                        </button>
                        <div className="ds-action-divider"></div>
                    </>
                )}
                <button className="ds-action-btn" onMouseDown={(e) => { e.stopPropagation(); setRightPanelOpen(true); }} title="Settings">
                    <Settings size={32} color="#4B5563"/>
                </button>
                <div className="ds-action-divider"></div>
                <button className="ds-action-btn" onMouseDown={(e) => { e.stopPropagation(); removeElement(pageId, element.id); }} title="Delete">
                    <Trash2 size={32} color="#E0243A"/>
                </button>
            </div>
        )}
    </div>
  );
};

const SortablePageCard = ({ pg, i, activePageId, setActivePageId, setPages, setEditing, removePage, totalPages, updateElement, removeElement, activeContext, setActiveContext, setRightPanelOpen, activeTool, setActiveTool, pendingSignature, setPendingSignature }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: pg.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 100 : 1, 
    opacity: isDragging ? 0.8 : 1, 
  };

  const handlePaperClick = (e) => {
      e.stopPropagation();
      const paperRect = e.currentTarget.parentElement.getBoundingClientRect(); 
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const x = ((clientX - paperRect.left) / paperRect.width) * 100;
      const y = ((clientY - paperRect.top) / paperRect.height) * 100;
      
      if (activeTool === 'text') {
          const newEl = { 
              id: Date.now(), type: 'text', content: '', 
              x, y, scale: 1, fontSize: 40,
              color: '#111827', fontFamily: 'Arial',
              textAlign: 'left', isBold: false, isItalic: false, isUnderline: false 
          };
          setPages(prev => prev.map(p => p.id === pg.id ? { ...p, elements: [...(p.elements || []), newEl] } : p));
          setActiveContext({ pageId: pg.id, elementId: newEl.id, mode: 'edit' });
          setActiveTool('select');
      } else if (activeTool === 'place-signature' && pendingSignature) {
          const newEl = { id: Date.now(), type: 'signature', src: pendingSignature.src, x, y, scale: 1 };
          setPages(prev => prev.map(p => p.id === pg.id ? { ...p, elements: [...(p.elements || []), newEl] } : p));
          setActiveContext({ pageId: pg.id, elementId: newEl.id, mode: 'select' });
          setPendingSignature(null);
          setActiveTool('select');
      }
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className={`paper-wrapper ${pg.sheetSize} ${pg.id === activePageId ? 'active' : ''}`} onClick={() => setActivePageId(pg.id)}>
      
      <label className="page-checkbox-container" onClick={(e) => e.stopPropagation()}>
        <input type="checkbox" className="page-checkbox" checked={pg.selected} 
          onChange={() => setPages(prev => prev.map(p => p.id === pg.id ? { ...p, selected: !p.selected } : p))}
        />
        <span className="page-checkbox-label">{pg.selected ? 'Selected' : 'Select'}</span>
      </label>

      {totalPages > 1 && (
        <button 
          className="page-delete-btn" 
          onClick={(e) => { e.stopPropagation(); removePage(pg.id); }}
          title="Delete Page"
        >
          <Trash2 size={16} />
        </button>
      )}

      <div className="page-number-text">Page {i + 1}</div>
      
      <div className={`paper ${pg.sheetSize}`} style={{ backgroundColor: '#FFFFFF' }}
           onMouseDown={(e) => {
               if (activeTool === 'select' && !e.target.closest('.ds-element-wrapper') && !e.target.closest('.card-slot')) {
                   setActiveContext(null);
                   setRightPanelOpen(false);
               }
           }}
           onTouchStart={(e) => {
               if (activeTool === 'select' && !e.target.closest('.ds-element-wrapper') && !e.target.closest('.card-slot')) {
                   setActiveContext(null);
                   setRightPanelOpen(false);
               }
           }}
      >
        
        {['text', 'place-signature'].includes(activeTool) && (
            <div 
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 45, cursor: activeTool==='place-signature' ? 'crosshair' : 'text' }} 
                onMouseDown={handlePaperClick} 
                onTouchStart={handlePaperClick}
            />
        )}

        <div className="layout-container" style={{ 
            flexDirection: pg.docMode === 'single' ? 'column' : (pg.layout === 'vertical' ? 'column' : 'row'), 
            gap: `${pg.cardGapMM}mm`,
            justifyContent: pg.docMode === 'single' ? (pg.singleAlign === 'top' ? 'flex-start' : (pg.singleAlign === 'bottom' ? 'flex-end' : 'center')) : 'center',
            alignItems: 'center',
            position: 'relative'
        }}>
          {!pg.frontSrc && !pg.backSrc ? (
              <div style={{
                  position: 'absolute', top: '15mm', left: '15mm', right: '15mm', bottom: '15mm',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  textAlign: 'center', padding: '2.5rem'
              }}>
                  <p style={{ fontSize: '2.4rem', fontWeight: 500, color: '#9CA3AF', margin: 0, maxWidth: '85%', lineHeight: 1.5 }}>
                      Your uploaded document <br /> will appear here.
                  </p>
              </div>
          ) : (
              <>
                  {pg.frontSrc && (
                      <div className="card-slot" 
                           style={{ ...getSlotStyle(pg.rawFrontImg, pg.cardSizeMM, pg.docMode === 'single', pg.frontCrop), cursor: activeTool === 'select' ? 'pointer' : 'default' }}
                           onClick={(e) => { 
                               if(activeTool !== 'select') return;
                               e.stopPropagation(); 
                               setEditing({ pageId: pg.id, side: 'front', src: pg.frontSrc, crop: pg.frontCrop, imgObj: pg.rawFrontImg }); 
                           }}
                      >
                          <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
                            <LiveFilteredImage
                                src={pg.frontSrc}
                                colorMode={pg.colorMode}
                                crop={pg.frontCrop}
                                alt="Front"
                            />
                          </div>
                      </div>
                  )}
                  {pg.backSrc && pg.docMode === 'double' && (
                      <div className="card-slot" 
                           style={{ ...getSlotStyle(pg.rawBackImg, pg.cardSizeMM, false, pg.backCrop), cursor: activeTool === 'select' ? 'pointer' : 'default' }}
                           onClick={(e) => { 
                               if(activeTool !== 'select') return;
                               e.stopPropagation(); 
                               setEditing({ pageId: pg.id, side: 'back', src: pg.backSrc, crop: pg.backCrop, imgObj: pg.rawBackImg }); 
                           }}
                      >
                          <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
                            <LiveFilteredImage
                                src={pg.backSrc}
                                colorMode={pg.colorMode}
                                crop={pg.backCrop}
                                alt="Back"
                            />
                          </div>
                      </div>
                  )}
              </>
          )}
        </div>
        
        {(pg.elements || []).map(el => (
            <OverlayElement 
                key={el.id} 
                element={el} 
                pageId={pg.id} 
                updateElement={updateElement} 
                removeElement={removeElement}
                activeContext={activeContext}
                setActiveContext={setActiveContext}
                setRightPanelOpen={setRightPanelOpen}
            />
        ))}

      </div>
    </div>
  );
};

export default function DocScanner({ showToast, triggerFeedback, showLoader, hideLoader, transferData }) {
  const [screen, setScreen] = useState(1);
  const [pages, setPages] = useState([]);
  const [activePageId, setActivePageId] = useState(null);
  const [editing, setEditing] = useState(null); 
  const [baseFileName, setBaseFileName] = useState('document');
  
  const [activeDropdown, setActiveDropdown] = useState(null);
  const [formatAlert, setFormatAlert] = useState(false);
  const [uploadActionTarget, setUploadActionTarget] = useState(null);

  const [showAdjTooltip, setShowAdjTooltip] = useState(false);
  const [hasSeenAdjTooltip, setHasSeenAdjTooltip] = useState(false);

  // Tools state
  const [activeTool, setActiveTool] = useState('select');
  const [pendingSignature, setPendingSignature] = useState(null);
  const [activeContext, setActiveContext] = useState(null);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [showSigModal, setShowSigModal] = useState(false);

  const processedRef = useRef(null);
  const activePageIdRef = useRef(activePageId);

  const isMobile = typeof window !== 'undefined' && /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  useEffect(() => {
    activePageIdRef.current = activePageId;
  }, [activePageId]);

  useEffect(() => {
    if (!transferData) return;

    let imgUrl = null;
    let targetSlot = 'auto';

    if (typeof transferData === 'string') {
        imgUrl = transferData;
    } else if (typeof transferData === 'object') {
        imgUrl = transferData.image || transferData.img || transferData.src || transferData.dataUrl;
        targetSlot = transferData.slot || 'auto';
    }

    if (!imgUrl) return;

    const processTransfer = async () => {
        if (showLoader) showLoader("Importing Image...");
        const imgObj = new Image();
        imgObj.src = imgUrl;
        
        await new Promise((resolve) => {
            imgObj.onload = resolve;
        });

        setPages(prev => {
            let newPages = [...prev];

            if (newPages.length === 0) {
                const newPage = enforceLimits({
                    id: Date.now(), sheetSize: 'a4-portrait', docMode: 'single', layout: 'vertical', singleAlign: 'center',
                    cardSizeMM: 85, cardGapMM: 15, rawFrontImg: imgObj, rawBackImg: null, frontSrc: imgUrl, backSrc: '', 
                    frontCrop: { t: 0, b: 100, l: 0, r: 100 }, backCrop: { t: 0, b: 100, l: 0, r: 100 }, selected: true, colorMode: 'color', elements: []
                });
                setActivePageId(newPage.id);
                setScreen(2); 
                return [newPage];
            }

            const activeIdx = newPages.findIndex(p => p.id === activePageIdRef.current);
            const targetIdx = activeIdx >= 0 ? activeIdx : 0;
            let targetPage = { ...newPages[targetIdx] };

            if (targetSlot === 'front') {
                targetPage.rawFrontImg = imgObj;
                targetPage.frontSrc = imgUrl;
                targetPage.frontCrop = { t: 0, b: 100, l: 0, r: 100 };
            } else if (targetSlot === 'back') {
                targetPage.docMode = 'double'; 
                targetPage.rawBackImg = imgObj;
                targetPage.backSrc = imgUrl;
                targetPage.backCrop = { t: 0, b: 100, l: 0, r: 100 };
            } else {
                if (!targetPage.rawFrontImg) {
                    targetPage.rawFrontImg = imgObj;
                    targetPage.frontSrc = imgUrl;
                    targetPage.frontCrop = { t: 0, b: 100, l: 0, r: 100 };
                } else if (!targetPage.rawBackImg) { 
                    // 👇 FIX: Automatically enable double mode if back is empty 👇
                    targetPage.docMode = 'double'; 
                    targetPage.rawBackImg = imgObj;
                    targetPage.backSrc = imgUrl;
                    targetPage.backCrop = { t: 0, b: 100, l: 0, r: 100 };
                } else {
                    const newPage = enforceLimits({
                        id: Date.now(), sheetSize: targetPage.sheetSize, docMode: targetPage.docMode, layout: targetPage.layout, singleAlign: targetPage.singleAlign,
                        cardSizeMM: targetPage.cardSizeMM, cardGapMM: targetPage.cardGapMM, rawFrontImg: imgObj, rawBackImg: null, frontSrc: imgUrl, backSrc: '', 
                        frontCrop: { t: 0, b: 100, l: 0, r: 100 }, backCrop: { t: 0, b: 100, l: 0, r: 100 }, selected: true, colorMode: 'color', elements: []
                    });
                    setActivePageId(newPage.id);
                    newPages.push(newPage);
                    setScreen(2);
                    return newPages;
                }
            }

            newPages[targetIdx] = enforceLimits(targetPage);
            setScreen(2); 
            return newPages;
        });

        if (hideLoader) hideLoader();
    };

    processTransfer();
  }, [transferData]);

  useEffect(() => {
    const handleResetScanner = () => {
        setScreen(1);
        setPages([]);
        setActivePageId(null);
        setActiveDropdown(null);
        setActiveTool('select');
        setPendingSignature(null);
        setActiveContext(null);
        setRightPanelOpen(false);
    };
    window.addEventListener('reset-doc-scanner', handleResetScanner);
    return () => window.removeEventListener('reset-doc-scanner', handleResetScanner);
  }, []);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } })
  );

  const defaultCrop = { t: 0, b: 100, l: 0, r: 100 };
  const activePage = pages.find(p => p.id === activePageId) || pages[0];
  const activePageHasContent = activePage && (activePage.frontSrc || activePage.backSrc);
  const hasContent = pages.some(p => p.rawFrontImg || p.rawBackImg);

  useEffect(() => {
    let openTimer;
    if (activePageHasContent && !hasSeenAdjTooltip) {
      openTimer = setTimeout(() => {
        setShowAdjTooltip(true);
        setHasSeenAdjTooltip(true);
      }, 400);
    }
    return () => { if (openTimer) clearTimeout(openTimer); };
  }, [activePageHasContent, hasSeenAdjTooltip]);

  useEffect(() => {
    const handleClickOutside = (e) => {
        if (!e.target.closest('.custom-dropdown-container') && !e.target.closest('.right-panel')) {
            setActiveDropdown(null);
        }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const toggleDropdown = (e, name) => {
    e.stopPropagation();
    setActiveDropdown(prev => prev === name ? null : name);
  };

  const startLayout = (sheetSize) => {
    const newPage = enforceLimits({
      id: Date.now(), sheetSize, docMode: 'double', layout: 'vertical', singleAlign: 'center',
      cardSizeMM: 85, cardGapMM: 15, rawFrontImg: null, rawBackImg: null, frontSrc: '', backSrc: '', 
      frontCrop: { ...defaultCrop }, backCrop: { ...defaultCrop }, selected: true, colorMode: 'color', elements: []
    }, { sheetSize }); 
    setPages([newPage]); setActivePageId(newPage.id); setScreen(2);
  };

  const updateActivePage = (fields) => setPages(prev => prev.map(p => p.id === activePage?.id ? enforceLimits(p, fields) : p));
  const updateAllPages = (fields) => setPages(prev => prev.map(p => enforceLimits(p, fields)));

  const updateElement = (pageId, elementId, fields) => {
    setPages(prev => prev.map(p => {
        if (p.id !== pageId) return p;
        return { ...p, elements: (p.elements || []).map(el => el.id === elementId ? { ...el, ...fields } : el) };
    }));
  };

  const removeElement = (pageId, elementId) => {
    setPages(prev => prev.map(p => {
        if (p.id !== pageId) return p;
        return { ...p, elements: (p.elements || []).filter(el => el.id !== elementId) };
    }));
    setActiveContext(null);
    setRightPanelOpen(false);
  };

  const resetAll = () => {
    const newPage = enforceLimits({
      id: Date.now(), sheetSize: 'a4-portrait', docMode: 'double', layout: 'vertical', singleAlign: 'center',
      cardSizeMM: 85, cardGapMM: 15, rawFrontImg: null, rawBackImg: null, frontSrc: '', backSrc: '', 
      frontCrop: { ...defaultCrop }, backCrop: { ...defaultCrop }, selected: true, colorMode: 'color', elements: []
    });
    setPages([newPage]); setActivePageId(newPage.id);
  };

  const applyColorMode = (mode) => {
    if (showLoader) showLoader("Applying Filter...");
    setTimeout(() => {
        const hasSelected = pages.some(p => p.selected);
        setPages(prev => prev.map(p => {
          if (hasSelected && p.selected) return enforceLimits(p, { colorMode: mode });
          if (!hasSelected && p.id === activePageId) return enforceLimits(p, { colorMode: mode });
          return p;
        }));
        if (hideLoader) hideLoader();
    }, 600);
  };

  const handleUploadClick = (targetId) => {
    if (isMobile) {
        setUploadActionTarget(targetId);
    } else {
        const el = document.getElementById(`${targetId}-gallery`);
        if (el) el.click();
    }
  };

  const handleDropUpload = (e, side, targetId) => {
    e.preventDefault(); 
    e.stopPropagation();
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
        handleFileUpload({ target: { files: files } }, side);
    }
  };

  const handleFileUpload = (e, side) => {
    const files = Array.from(e.target?.files || []);
    if (!files.length) return;

    const validTypes = ['image/jpeg', 'image/png', 'image/heic', 'image/heif'];
    const validExtensions = ['.jpg', '.jpeg', '.png', '.heic'];
    
    const validFiles = files.filter(file => 
        validTypes.includes(file.type) || validExtensions.some(ext => file.name.toLowerCase().endsWith(ext))
    ).slice(0, 2);

    if (validFiles.length === 0) {
        setFormatAlert(true);
        if (e.target && e.target.value !== undefined) e.target.value = '';
        return;
    }

    const nameWithoutExt = validFiles[0].name.split('.').slice(0, -1).join('.') || 'document';
    setBaseFileName(nameWithoutExt);

    if (showLoader) showLoader("Processing Upload...");
    
    const processFile = (file) => {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (ev) => {
                const img = new Image();
                img.onload = () => resolve({ img, src: ev.target.result });
                img.src = ev.target.result;
            };
            reader.readAsDataURL(file);
        });
    };

    setTimeout(async () => {
        if (validFiles.length === 1) {
            const { img, src } = await processFile(validFiles[0]);
            if (side === 'front' || !side) {
                updateActivePage({ rawFrontImg: img, frontSrc: src, frontCrop: { ...defaultCrop } });
            } else {
                updateActivePage({ rawBackImg: img, backSrc: src, backCrop: { ...defaultCrop } });
            }
        } else if (validFiles.length === 2) {
            const [frontData, backData] = await Promise.all([
                processFile(validFiles[0]),
                processFile(validFiles[1])
            ]);
            
            updateActivePage({ 
                docMode: 'double', 
                rawFrontImg: frontData.img, frontSrc: frontData.src, frontCrop: { ...defaultCrop },
                rawBackImg: backData.img, backSrc: backData.src, backCrop: { ...defaultCrop }
            });
        }
        
        if (hideLoader) hideLoader();
    }, 600); 

    if (e.target && e.target.value !== undefined) e.target.value = '';
  };

  const SignatureModal = ({ onClose, onSave }) => {
      const [mode, setMode] = useState('type'); 
      const [typedText, setTypedText] = useState('');
      const [selectedFont, setSelectedFont] = useState("'Brush Script MT', cursive");
      const [uploadPreview, setUploadPreview] = useState(null);

      const handleUpload = (e) => {
          const file = e.target.files[0];
          if(!file) return;
          if(file.size > 2 * 1024 * 1024) {
              if(showToast) showToast("File too large. Maximum size is 2MB.");
              e.target.value = '';
              return;
          }
          const reader = new FileReader();
          reader.onload = (ev) => setUploadPreview(ev.target.result);
          reader.readAsDataURL(file);
      };

      const handleInsertType = () => {
          if (!typedText.trim()) return;
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          const fontSize = 60;
          ctx.font = `normal 400 ${fontSize}px ${selectedFont}`;
          const metrics = ctx.measureText(typedText);
          canvas.width = metrics.width + 40;
          canvas.height = fontSize * 1.5;
          ctx.font = `normal 400 ${fontSize}px ${selectedFont}`;
          ctx.fillStyle = '#111827';
          ctx.textBaseline = 'middle';
          ctx.fillText(typedText, 20, canvas.height / 2);
          const dataUrl = canvas.toDataURL('image/png');
          onSave({ type: 'signature', src: dataUrl }); 
      };

      return (
          <div className="modal-overlay" style={{ zIndex: 99999 }}>
              <div className="modal-content" style={{ width: '90%', maxWidth: '400px', background: '#FFF', padding: '24px', borderRadius: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                      <h3 style={{ margin: 0, color: '#111827' }}>Add Signature</h3>
                      <span style={{ cursor: 'pointer', fontSize: '1.2rem', fontWeight: 'bold' }} onClick={onClose}>&times;</span>
                  </div>
                  
                  <div style={{ display: 'flex', background: '#F3F4F6', padding: '4px', borderRadius: '8px', marginBottom: '20px' }}>
                      <button onClick={() => setMode('type')} style={{ flex: 1, padding: '8px', background: mode==='type'?'#FFF':'transparent', border: 'none', borderRadius: '6px', fontWeight: 600, color: mode==='type'?'#111827':'#6B7280', cursor: 'pointer' }}>Type</button>
                      <button onClick={() => setMode('upload')} style={{ flex: 1, padding: '8px', background: mode==='upload'?'#FFF':'transparent', border: 'none', borderRadius: '6px', fontWeight: 600, color: mode==='upload'?'#111827':'#6B7280', cursor: 'pointer' }}>Upload</button>
                  </div>
                  
                  {mode === 'type' ? (
                      <div>
                          <input type="text" placeholder="Type your signature..." value={typedText} onChange={(e) => setTypedText(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '1rem', marginBottom: '12px', outline: 'none' }} />
                          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                              {["'Brush Script MT', cursive", "'Lucida Handwriting', cursive", "'Comic Sans MS', cursive"].map((f, i) => (
                                  <button key={i} onClick={() => setSelectedFont(f)} style={{ flex: 1, padding: '8px', fontFamily: f, fontSize: '1rem', background: selectedFont === f ? '#E5E7EB' : '#FFF', border: '1px solid #D1D5DB', borderRadius: '6px', cursor: 'pointer' }}>Sig {i+1}</button>
                              ))}
                          </div>
                          <div style={{ height: '100px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: selectedFont, fontSize: '2.5rem', color: '#111827', background: '#F9FAFB', borderRadius: '6px' }}>
                              {typedText || 'Preview'}
                          </div>
                          {typedText.trim() ? (
                              <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                                  <button onClick={() => setTypedText('')} style={{ flex: 1, padding: '12px', background: '#F3F4F6', border: '1px solid #D1D5DB', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}>Clear</button>
                                  <button onClick={handleInsertType} style={{ flex: 2, padding: '12px', background: '#E0243A', color: '#FFF', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}>Insert Signature</button>
                              </div>
                          ) : (
                              <button disabled style={{ width: '100%', padding: '12px', background: '#E5E7EB', color: '#9CA3AF', border: 'none', borderRadius: '6px', fontWeight: 600, marginTop: '16px', cursor: 'not-allowed' }}>Insert Signature</button>
                          )}
                      </div>
                  ) : (
                      <div>
                          {uploadPreview ? (
                              <>
                                  <div style={{ height: '150px', border: '1px solid #D1D5DB', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', background: '#F9FAFB', padding: '8px' }}>
                                      <img src={uploadPreview} style={{maxWidth: '100%', maxHeight: '100%', objectFit: 'contain'}} alt="Upload Preview" />
                                  </div>
                                  <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                                      <button onClick={() => document.getElementById('sig-upload-btn').click()} style={{ flex: 1, padding: '12px', background: '#F3F4F6', border: '1px solid #D1D5DB', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}>Replace</button>
                                      <button onClick={() => onSave({ type: 'signature', src: uploadPreview })} style={{ flex: 2, padding: '12px', background: '#E0243A', color: '#FFF', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}>Insert Signature</button>
                                  </div>
                              </>
                          ) : (
                              <div style={{ height: '150px', border: '2px dashed #D1D5DB', display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', cursor: 'pointer', background: '#F9FAFB' }} onClick={() => document.getElementById('sig-upload-btn').click()}>
                                  <FileUp size={24} color="#6B7280"/>
                                  <span style={{ color: '#4B5563', fontWeight: 600 }}>Click to Upload PNG/JPG</span>
                                  <span style={{ color: '#9CA3AF', fontSize: '0.75rem' }}>Max file size: 2MB</span>
                              </div>
                          )}
                          <input type="file" id="sig-upload-btn" hidden accept="image/png, image/jpeg, image/jpg" onChange={handleUpload} />
                      </div>
                  )}
              </div>
          </div>
      );
  };

  const addMorePage = () => {
    if (!activePageHasContent) {
      if (showToast) showToast("Upload at least one image before adding a new page.");
      return;
    }
    const newPage = enforceLimits({
      id: Date.now(), sheetSize: activePage.sheetSize, docMode: activePage.docMode,
      layout: 'vertical', singleAlign: 'center', cardSizeMM: 85, cardGapMM: 15, rawFrontImg: null, rawBackImg: null, frontSrc: '', backSrc: '', 
      frontCrop: { ...defaultCrop }, backCrop: { ...defaultCrop }, selected: true, colorMode: 'color', elements: []
    });
    setPages(prev => [...prev, newPage]); setActivePageId(newPage.id);
  };

  const removePage = (pageId) => {
    setPages(prev => {
        const newPages = prev.filter(p => p.id !== pageId);
        if (activePageId === pageId && newPages.length > 0) {
            setActivePageId(newPages[0].id);
        }
        return newPages;
    });
  };

  const renderCanvasForPage = (page) => {
    const mmToPx = (mm) => (mm * 300) / 25.4;
    const isLandscape = page.sheetSize === 'a4-landscape';
    const pW = mmToPx(isLandscape ? 297 : 210); const pH = mmToPx(isLandscape ? 210 : 297);
    const canvas = document.createElement('canvas'); canvas.width = pW; canvas.height = pH;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, pW, pH);
    const cX = pW / 2; const cY = pH / 2;

    if (page.colorMode === 'bw') ctx.filter = 'grayscale(100%) contrast(1.2)'; 
    else ctx.filter = 'none'; 

    const drawCroppedImage = (img, crop, targetX, targetY, targetW, targetH) => {
      const sx = img.width * (crop.l / 100); const sy = img.height * (crop.t / 100);
      const sw = img.width * ((crop.r - crop.l) / 100); const sh = img.height * ((crop.b - crop.t) / 100);
      ctx.drawImage(img, sx, sy, sw, sh, targetX, targetY, targetW, targetH);
    };

    if (page.docMode === 'single' && page.rawFrontImg) {
      const cW = page.rawFrontImg.width * ((page.frontCrop.r - page.frontCrop.l) / 100);
      const cH = page.rawFrontImg.height * ((page.frontCrop.b - page.frontCrop.t) / 100);
      const ratio = cW / (cH || 1);
      const imgW = mmToPx(page.cardSizeMM); const imgH = imgW / ratio;
      let drawY = cY - imgH / 2;
      if (page.singleAlign === 'top') drawY = mmToPx(15);
      if (page.singleAlign === 'bottom') drawY = pH - imgH - mmToPx(15);
      drawCroppedImage(page.rawFrontImg, page.frontCrop, cX - imgW / 2, drawY, imgW, imgH);
    } else {
      const gap = mmToPx(page.cardGapMM);
      const getDims = (img, crop) => {
        if (!img) return { w: 0, h: 0 };
        const cW = img.width * ((crop.r - crop.l) / 100); const cH = img.height * ((crop.b - crop.t) / 100);
        const r = cW / (cH || 1);
        return r >= 1 ? { w: mmToPx(page.cardSizeMM), h: mmToPx(page.cardSizeMM) / r } : { h: mmToPx(page.cardSizeMM), w: mmToPx(page.cardSizeMM) * r };
      };
      
      const fD = getDims(page.rawFrontImg, page.frontCrop); const bD = getDims(page.rawBackImg, page.backCrop);
      
      if (page.layout === 'vertical') {
        const totalH = fD.h + bD.h + (page.rawFrontImg && page.rawBackImg ? gap : 0);
        let sY = cY - totalH / 2;
        if (page.rawFrontImg) { drawCroppedImage(page.rawFrontImg, page.frontCrop, cX - fD.w / 2, sY, fD.w, fD.h); sY += fD.h + gap; }
        if (page.rawBackImg) { drawCroppedImage(page.rawBackImg, page.backCrop, cX - bD.w / 2, sY, bD.w, bD.h); }
      } else {
        const totalW = fD.w + bD.w + (page.rawFrontImg && page.rawBackImg ? gap : 0);
        let sX = cX - totalW / 2;
        if (page.rawFrontImg) { drawCroppedImage(page.rawFrontImg, page.frontCrop, sX, cY - fD.h / 2, fD.w, fD.h); sX += fD.w + gap; }
        if (page.rawBackImg) { drawCroppedImage(page.rawBackImg, page.backCrop, sX, cY - bD.h / 2, bD.w, bD.h); }
      }
    }

    if (page.colorMode === 'filter') {
        const imgData = ctx.getImageData(0, 0, pW, pH);
        const data = imgData.data;
        for (let i = 0; i < data.length; i += 4) {
            let r = data[i]; let g = data[i + 1]; let b = data[i + 2];
            const lum = 0.299 * r + 0.587 * g + 0.114 * b;
            
            if (lum > 140) {
                data[i] = 255; data[i+1] = 255; data[i+2] = 255; 
            } 
            else if (lum > 75) {
                data[i] = Math.min(255, r * 1.05); data[i+1] = Math.min(255, g * 1.05); data[i+2] = Math.min(255, b * 1.05);
            } 
            else {
                data[i] = r * 0.7; data[i+1] = g * 0.7; data[i+2] = b * 0.7;
            }
        }
        ctx.putImageData(imgData, 0, 0);
    }

    if (page.elements && page.elements.length > 0) {
        ctx.filter = 'none'; 
        page.elements.forEach(el => {
            const posX = pW * (el.x / 100);
            const posY = pH * (el.y / 100);
            
            if (el.type === 'text') {
                const fontSize = (el.fontSize || 40) * el.scale * (pW / 800);
                ctx.font = `${el.isBold ? 'bold' : 'normal'} ${el.isItalic ? 'italic' : 'normal'} ${fontSize}px ${el.fontFamily || 'Arial'}`;
                ctx.fillStyle = el.color || '#111827';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'top';
                
                const lines = (el.content || '').split('\n');
                const pad = 10 * (pW / 800); // reduced pad visually
                
                lines.forEach((line, index) => {
                    ctx.fillText(line, posX + pad, posY + pad + (index * fontSize * 1.2));
                });
            } else if (el.type === 'signature') {
                const imgObj = new Image();
                imgObj.src = el.src;
                const baseWidth = mmToPx(50); 
                const baseHeight = baseWidth * 0.5;
                const w = baseWidth * (el.scale || 1);
                const h = baseHeight * (el.scale || 1);
                ctx.drawImage(imgObj, posX, posY, w, h);
            }
        });
    }

    return canvas;
  };

  const handlePrint = () => {
    const selected = pages.filter(p => p.selected && (p.rawFrontImg || p.rawBackImg));
    if (!selected.length) { 
        if(showToast) showToast("Upload an image first or select at least one page to print."); 
        return; 
    }
    
    trackUserAction('Print', 'Doc_Scanner', 'Print_Out');
    
    if (showLoader) showLoader("Preparing Print...");
    setTimeout(() => {
        const doc = new jsPDF({ orientation: selected[0].sheetSize === 'a4-landscape' ? 'l' : 'p', unit: 'mm', format: 'a4' });
        selected.forEach((pg, idx) => {
          if (idx > 0) doc.addPage('a4', pg.sheetSize === 'a4-landscape' ? 'l' : 'p');
          const canvas = renderCanvasForPage(pg);
          doc.addImage(canvas.toDataURL('image/jpeg', 1.0), 'JPEG', 0, 0, doc.internal.pageSize.getWidth(), doc.internal.pageSize.getHeight());
        });
        
        doc.autoPrint();
        window.open(doc.output('bloburl'), '_blank');
        if (hideLoader) hideLoader();
        if(triggerFeedback) triggerFeedback();
    }, 600);
  };

  const exportPDF = () => {
    const selected = pages.filter(p => p.selected && (p.rawFrontImg || p.rawBackImg));
    if (!selected.length) return; 
    setActiveDropdown(null); 
    
    trackUserAction('Export', 'Doc_Scanner', 'PDF');
    
    if (showLoader) showLoader("Generating PDF...");
    setTimeout(() => {
        const doc = new jsPDF({ orientation: selected[0].sheetSize === 'a4-landscape' ? 'l' : 'p', unit: 'mm', format: 'a4' });
        selected.forEach((pg, idx) => {
          if (idx > 0) doc.addPage('a4', pg.sheetSize === 'a4-landscape' ? 'l' : 'p');
          const canvas = renderCanvasForPage(pg);
          doc.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, doc.internal.pageSize.getWidth(), doc.internal.pageSize.getHeight());
        });
        
        doc.save(`foreverscan_${baseFileName}.pdf`);
        
        if (hideLoader) hideLoader();
        if(triggerFeedback) triggerFeedback();
    }, 600);
  };

  const exportImage = (format) => {
    const selected = pages.filter(p => p.selected && (p.rawFrontImg || p.rawBackImg));
    if (!selected.length) return; 
    setActiveDropdown(null); 
    const ext = format === 'image/jpeg' ? 'jpg' : 'png';
    
    trackUserAction('Export', 'Doc_Scanner', ext.toUpperCase());
    
    if (showLoader) showLoader(`Generating ${ext.toUpperCase()}...`);
    setTimeout(() => {
        selected.forEach((pg, idx) => {
          const canvas = renderCanvasForPage(pg);
          const link = document.createElement('a');
          
          link.download = `foreverscan_${baseFileName}${selected.length > 1 ? `_page${idx+1}` : ''}.${ext}`;
          
          link.href = canvas.toDataURL(format, 1.0);
          link.click();
        });
        if (hideLoader) hideLoader();
        if(triggerFeedback) triggerFeedback();
    }, 600);
  };

  const handleDeleteImage = () => {
    if (editing.side === 'front') updateActivePage({ rawFrontImg: null, frontSrc: '', frontCrop: { ...defaultCrop } });
    else updateActivePage({ rawBackImg: null, backSrc: '', backCrop: { ...defaultCrop } });
    setEditing(null);
  };

  const handleSaveCrop = () => {
    if (editing.side === 'front') updateActivePage({ frontCrop: editing.crop });
    else updateActivePage({ backCrop: editing.crop });
    setEditing(null);
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;

    if (active.id !== over.id) {
      setPages((items) => {
        const oldIndex = items.findIndex(item => item.id === active.id);
        const newIndex = items.findIndex(item => item.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const activeElementData = activeContext ? pages.find(p => p.id === activeContext.pageId)?.elements?.find(e => e.id === activeContext.elementId) : null;
  const dynamicLimits = getDynamicLimits(activePage);

  return (
    <div id="module-document" className="module" style={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column' }}>
        
      <style>{`
        .ds-element-wrapper { position: absolute; z-index: 50; width: max-content; }
        .ds-element-wrapper.active { z-index: 60; }
        .ds-element-wrapper.active::after { content: ''; position: absolute; top: 0px; left: 0px; right: 0px; bottom: 0px; border: 2.5px dashed #2563EB; border-radius: 0px; pointer-events: none; }
        
        .ds-floating-actions { position: absolute; top: calc(100% + 20px); left: 50%; transform: translateX(-50%); background: #FFF; border: 2px solid #E5E7EB; box-shadow: 0 16px 40px rgba(0,0,0,0.15); border-radius: 16px; display: flex; align-items: center; padding: 12px 16px; gap: 8px; z-index: 70; width: max-content; }
        .ds-action-btn { background: transparent; border: none; cursor: pointer; color: #4B5563; display: flex; align-items: center; justify-content: center; min-width: 64px; min-height: 64px; padding: 16px; border-radius: 16px; transition: 0.2s;}
        .ds-action-btn:hover { background: #F3F4F6; color: #111827; }
        .ds-action-divider { width: 2px; height: 48px; background: #E5E7EB; margin: 0 8px; }

        .right-panel { 
            width: 280px; background: #FFFFFF; border-left: 1px solid #E5E7EB; display: flex; flex-direction: column; z-index: 90; flex-shrink: 0; 
            transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), margin-right 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.4s ease; margin-right: 0; opacity: 1; visibility: visible;
        }
        .right-panel.closed { margin-right: -280px; transform: translateX(100%); opacity: 0; visibility: hidden; pointer-events: none; }
        .rp-header { padding: 16px; border-bottom: 1px solid #E5E7EB; display: flex; justify-content: space-between; align-items: center; }
        .rp-title { font-size: 1rem; font-weight: 700; color: #111827; margin: 0;}
        .rp-content { padding: 16px; flex: 1; overflow-y: auto; }
        .rp-box { background: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 8px; padding: 12px; margin-bottom: 16px; }
        .rp-box-title { font-size: 0.75rem; font-weight: 700; color: #6B7280; text-transform: uppercase; margin-bottom: 12px; display: block; letter-spacing: 0.5px; }
        .rp-row { display: flex; gap: 8px; margin-bottom: 12px; }
        .rp-row:last-child { margin-bottom: 0; }
        .rp-select { flex: 1; padding: 8px; border: 1px solid #E5E7EB; border-radius: 6px; font-size: 0.85rem; outline: none; color: #111827; background: #FFF;}
        .rp-input { width: 60px; padding: 8px; border: 1px solid #E5E7EB; border-radius: 6px; font-size: 0.85rem; outline: none; text-align: center; }
        .rp-btn { flex: 1; display: flex; justify-content: center; align-items: center; padding: 8px; background: #FFF; border: 1px solid #E5E7EB; border-radius: 6px; cursor: pointer; color: #6B7280; transition: 0.2s;}
        .rp-btn:hover { background: #F3F4F6; color: #111827; }
        .rp-btn.active { background: #FEE2E2; color: #E0243A; border-color: #E0243A; }
        .color-circle { width: 32px; height: 32px; border-radius: 50%; cursor: pointer; border: 2px solid transparent; transition: 0.2s; }
        .color-circle:hover { transform: scale(1.1); }
        .save-changes-btn { width: 100%; padding: 12px; background: #E0243A; color: #FFF; border: none; border-radius: 8px; font-size: 0.9rem; font-weight: 700; cursor: pointer; transition: 0.2s; margin-top: 8px;}
        .save-changes-btn:hover { background: #B91C2D; }

        .export-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid #E5E7EB; background: #FFF; flex-wrap: wrap; gap: 10px; }
        
        .custom-dropdown-container:hover .dropdown-content-menu,
        .custom-dropdown-container.active .dropdown-content-menu { 
            display: flex !important; animation: fadeIn 0.15s ease-out; 
        }
        .dropdown-content-menu { display: none; }
        .dropdown-content-menu::before { content: ''; position: absolute; top: -15px; left: 0; right: 0; height: 15px; background: transparent; }
        .dropdown-content-btn {
            padding: 8px 12px; font-size: 0.85rem; font-weight: 600; color: #1F2937;
            background: transparent; border: none; display: flex; align-items: center;
            gap: 10px; width: 100%; cursor: pointer; text-align: left; border-radius: 6px;
            transition: all 0.15s ease;
        }
        .dropdown-content-btn:hover { background-color: #F9FAFB; color: #E0243A; }

        .filter-toggle-group {
            display: inline-flex; background: #F3F4F6; border-radius: 6px; padding: 2px; border: 1px solid #E5E7EB;
            height: 34px; align-items: center; box-sizing: border-box;
        }
        .filter-toggle-btn { position: relative; cursor: pointer; margin: 0; height: 100%; display: flex; align-items: center;}
        .filter-toggle-btn input { display: none; }
        .filter-toggle-btn span {
            display: flex; align-items: center; justify-content: center; padding: 0 12px; font-size: 0.8rem; height: 100%;
            font-weight: 600; color: #6B7280; border-radius: 4px; transition: all 0.2s ease; white-space: nowrap; box-sizing: border-box;
        }
        .filter-toggle-btn input:checked + span {
            background: #FFFFFF; color: #111827 !important; box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }

        .adj-tooltip-content { left: -132px !important; width: 230px !important; }
        .adj-tooltip-content::after { left: 137px !important; }
        
        .action-sheet-overlay {
          position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 99999; display: flex; align-items: flex-end; justify-content: center;
        }
        .action-sheet-content { background: #FFFFFF; width: 100%; border-radius: 16px 16px 0 0; padding: 1.5rem; animation: slideUp 0.3s ease-out; }
        .action-sheet-btn { width: 100%; padding: 14px; background: #F3F4F6; border: none; border-radius: 10px; margin-bottom: 10px; font-size: 1rem; font-weight: 600; color: #1F2937; display: flex; align-items: center; justify-content: center; gap: 10px; cursor: pointer; }
        .action-sheet-cancel { width: 100%; padding: 14px; background: transparent; border: none; font-size: 1rem; font-weight: 700; color: #E0243A; cursor: pointer; margin-top: 5px; }
        @media (min-width: 768px) {
          .action-sheet-overlay { align-items: center; }
          .action-sheet-content { max-width: 400px; border-radius: 16px; }
        }
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }

        .page-delete-btn {
            position: absolute;
            top: 12px;
            right: 12px;
            background: #FFF;
            border: 1px solid #E5E7EB;
            border-radius: 6px;
            padding: 6px;
            color: #E0243A;
            cursor: pointer;
            z-index: 10;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 2px 8px rgba(0,0,0,0.05);
            transition: 0.2s;
        }
        .page-delete-btn:hover {
            background: #FEE2E2;
        }

        @media (max-width: 768px) {
            .right-panel { 
                position: fixed; bottom: 0; left: 0; width: 100%; height: auto; max-height: 50vh; border-top-left-radius: 16px; border-top-right-radius: 16px; 
                box-shadow: 0 -4px 20px rgba(0,0,0,0.15); z-index: 300; transform: translateY(100%); margin-right: 0; transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.4s ease, visibility 0.4s; opacity: 0; visibility: hidden; display: flex;
            }
            .right-panel:not(.closed) { transform: translateY(0); opacity: 1; visibility: visible; }
            .export-header { flex-direction: column; align-items: flex-start; }
            .export-right { width: 100%; justify-content: space-between; }
        }

        .ds-resize-dot { position: absolute; width: 24px; height: 24px; background: #2563EB; border-radius: 50%; z-index: 65; pointer-events: auto; cursor: ns-resize; border: 3px solid #FFF; box-shadow: 0 2px 6px rgba(0,0,0,0.2); }
        .ds-resize-dot.nw { top: -12px; left: -12px; } .ds-resize-dot.n { top: -12px; left: calc(50% - 12px); } .ds-resize-dot.ne { top: -12px; right: -12px; }
        .ds-resize-dot.w { top: calc(50% - 12px); left: -12px; } .ds-resize-dot.e { top: calc(50% - 12px); right: -12px; }
        .ds-resize-dot.sw { bottom: -12px; left: -12px; } .ds-resize-dot.s { bottom: -12px; left: calc(50% - 12px); } .ds-resize-dot.se { bottom: -12px; right: -12px; }
      `}</style>

      {uploadActionTarget && (
        <div className="action-sheet-overlay" onClick={() => setUploadActionTarget(null)}>
          <div className="action-sheet-content" onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 1.2rem 0', textAlign: 'center', fontSize: '1.1rem', color: 'var(--primary)' }}>Select Image Source</h3>
            <button className="action-sheet-btn" onClick={() => { document.getElementById(`${uploadActionTarget}-camera`).click(); setUploadActionTarget(null); }}>
              <Camera size={20} color="var(--accent)" /> Take Photo
            </button>
            <button className="action-sheet-btn" onClick={() => { document.getElementById(`${uploadActionTarget}-gallery`).click(); setUploadActionTarget(null); }}>
              <ImageIcon size={20} color="var(--accent)" /> Choose from Gallery
            </button>
            <button className="action-sheet-cancel" onClick={() => setUploadActionTarget(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {formatAlert && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '400px', padding: '2.5rem 2rem', background: 'var(--surface)', textAlign: 'center', borderRadius: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.2rem' }}>
               <AlertTriangle size={48} color="#E0243A" strokeWidth={1.5} />
            </div>
            <h3 style={{ marginBottom: '1rem', color: 'var(--primary)', fontSize: '1.25rem', fontWeight: '800' }}>Invalid Format</h3>
            <p style={{ marginBottom: '2rem', color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: '1.6' }}>
              We recommend you to upload JPG, PNG and HEIC format only.
            </p>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <button className="btn btn-primary" style={{ padding: '10px 32px', minWidth: '120px' }} onClick={() => setFormatAlert(false)}>
                Okay
              </button>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '450px', padding: '1.5rem', background: 'var(--surface)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '1rem', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Crop size={18} /> Edit Image
              </h3>
              <span style={{ fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => setEditing(null)}>&times;</span>
            </div>

            <div style={{ height: '300px', display: 'flex', justifyContent: 'center', alignItems: 'center', backgroundColor: 'var(--bg-color)', borderRadius: '8px', padding: '12px' }}>
              <div style={{ position: 'relative', display: 'inline-block', maxWidth: '100%', maxHeight: '100%', overflow: 'hidden', borderRadius: '4px' }}>
                <img src={editing.src} alt="Editing" style={{ maxWidth: '100%', maxHeight: '276px', display: 'block', objectFit: 'contain' }} />
                <div style={{
                  position: 'absolute',
                  top: `${editing.crop.t}%`, bottom: `${100 - editing.crop.b}%`,
                  left: `${editing.crop.l}%`, right: `${100 - editing.crop.r}%`,
                  border: '2px solid var(--accent)',
                  boxShadow: '0 0 0 9999px rgba(28, 30, 38, 0.65)'
                }}></div>
              </div>
            </div>

            <div className="slider-section" style={{ marginTop: '1.5rem', gap: '10px' }}>
              {[{ label: 'Top', key: 't', min: 0, max: editing.crop.b - 5 }, 
                { label: 'Bottom', key: 'b', min: editing.crop.t + 5, max: 100 },
                { label: 'Left', key: 'l', min: 0, max: editing.crop.r - 5 }, 
                { label: 'Right', key: 'r', min: editing.crop.l + 5, max: 100 }].map(control => (
                <div className="slider-group" key={control.key} style={{ flexDirection: 'row', alignItems: 'center', gap: '12px' }}>
                  <label style={{ width: '50px', fontSize: '0.7rem' }}>{control.label}</label>
                  <input type="range" min={control.min} max={control.max} value={editing.crop[control.key]} 
                    onChange={(e) => setEditing({ ...editing, crop: { ...editing.crop, [control.key]: parseInt(e.target.value) } })}
                    className="custom-slider" style={{ flex: 1, margin: 0 }}
                  />
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1.5rem', gap: '10px' }}>
              <button className="btn btn-outline" style={{ color: '#E0243A', borderColor: '#E0243A', flex: 1 }} onClick={handleDeleteImage}>
                <Trash2 size={16} /> Delete
              </button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleSaveCrop}>
                <CheckCircle2 size={16} /> Save Crop
              </button>
            </div>
          </div>
        </div>
      )}

      {showSigModal && <SignatureModal onClose={() => setShowSigModal(false)} showToast={showToast} onSave={(sigData) => { 
          setShowSigModal(false); 
          if (activeContext && pages.find(p => p.id === activeContext.pageId)?.elements?.find(e => e.id === activeContext.elementId)?.type === 'signature') {
              updateElement(activeContext.pageId, activeContext.elementId, { src: sigData.src, content: sigData.content, signatureFont: sigData.signatureFont });
          } else {
              setPendingSignature(sigData); 
              setActiveTool('place-signature'); 
          }
      }} />}

      {screen === 1 ? (
        <section id="doc-screen-1" className="screen">
          <header className="app-header">
            <h1 className="main-heading">Select your <span style={{ color: 'var(--accent)' }}>Layout</span></h1>
            <p>Cleanly optimize and format your documents for professional usage.</p>
          </header>
          <div className="sheet-options">
            <button className="sheet-btn" onClick={() => startLayout('a4-portrait')}>
              <div className="icon-wrapper"><FileText size={24} /></div>
              <span>A4 Portrait</span>
            </button>
            <button className="sheet-btn" onClick={() => startLayout('a4-landscape')}>
              <div className="icon-wrapper"><FileText size={24} style={{ transform: 'rotate(90deg)' }} /></div>
              <span>A4 Landscape</span>
            </button>
          </div>
        </section>
      ) : (
        <section id="doc-screen-2" className="screen" style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          <header className="export-header">
            <div className="export-left" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <button className="btn btn-outline" style={{ height: '34px', margin: 0, boxSizing: 'border-box', padding: '0 12px', fontSize: '0.8rem' }} onClick={() => setScreen(1)}><ArrowLeft size={16}/> Home</button>
              <button className="btn btn-outline" style={{ height: '34px', margin: 0, boxSizing: 'border-box', padding: '0 12px', fontSize: '0.8rem' }} onClick={resetAll}><RotateCcw size={16}/> Reset All</button>
            </div>

            <div className="export-right" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                
              <div className="filter-toggle-group">
                  <label className="filter-toggle-btn">
                    <input type="radio" name="color_mode" value="color" checked={activePage?.colorMode === 'color'} onChange={() => applyColorMode('color')}/>
                    <span>Original</span>
                  </label>
                  <label className="filter-toggle-btn">
                    <input type="radio" name="color_mode" value="bw" checked={activePage?.colorMode === 'bw'} onChange={() => applyColorMode('bw')}/>
                    <span>B & W</span>
                  </label>
                  <label className="filter-toggle-btn">
                    <input type="radio" name="color_mode" value="filter" checked={activePage?.colorMode === 'filter'} onChange={() => applyColorMode('filter')}/>
                    <span><Wand2 size={12} style={{display:'inline', marginRight:'4px'}}/> Magic Filter</span>
                  </label>
              </div>

              {/* Add Element Dropdown */}
              <div 
                  className={`custom-dropdown-container ${activeDropdown === 'add' ? 'active' : ''}`} 
                  style={{ position: 'relative', display: 'inline-block', height: '34px', margin: 0, boxSizing: 'border-box' }}
              >
                  <button 
                      className="btn btn-outline" 
                      style={{ width: '100%', height: '100%', margin: 0, boxSizing: 'border-box', padding: '0 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '600', backgroundColor: '#FFF', color: '#111827', borderColor: '#E5E7EB' }} 
                      onClick={(e) => { e.stopPropagation(); toggleDropdown(e, 'add'); }}
                  >
                      <PlusCircle size={16}/> Add Element <ChevronDown size={14}/>
                  </button>
                  
                  <div className="dropdown-content-menu" style={{
                      position: 'absolute', top: '100%', left: '0', right: 'auto',
                      flexDirection: 'column', gap: '2px', background: '#FFFFFF',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.12)', border: '1px solid #E5E7EB',
                      borderRadius: '8px', padding: '6px', marginTop: '6px', zIndex: 9999, minWidth: '180px'
                  }}>
                      <div style={{ position: 'absolute', top: '-10px', left: 0, right: 0, height: '10px' }}></div>
                      <button className="dropdown-content-btn" onClick={() => { setActiveDropdown(null); setActiveTool('text'); }}>
                          <Type size={16}/> Add Text
                      </button>
                      <button className="dropdown-content-btn" onClick={() => { setActiveDropdown(null); setShowSigModal(true); }}>
                          <PenLine size={16}/> Add Signature
                      </button>
                  </div>
              </div>

              <button className="btn btn-outline" style={{ height: '34px', margin: 0, boxSizing: 'border-box', padding: '0 12px', fontSize: '0.8rem' }} disabled={!hasContent} onClick={handlePrint}><Printer size={16}/> Print</button>
              
              <div 
                className={`custom-dropdown-container ${activeDropdown === 'export' ? 'active' : ''} ${!hasContent ? 'disabled' : ''}`} 
                style={{ position: 'relative', display: 'inline-block', height: '34px', margin: 0, boxSizing: 'border-box' }}
              >
                <button 
                  className="btn" 
                  style={{ 
                      backgroundColor: '#E0243A', color: '#FFFFFF', border: '1px solid #E0243A',
                      fontSize: '0.8rem', padding: '0 12px', borderRadius: '6px', display: 'flex', 
                      justifyContent: 'center', alignItems: 'center', gap: '6px', fontWeight: '600', height: '100%',
                      margin: 0, boxSizing: 'border-box'
                  }} 
                  disabled={!hasContent} 
                  onClick={(e) => { e.stopPropagation(); toggleDropdown(e, 'export'); }}
                >
                  <FileUp size={16}/> Export <ChevronDown size={14}/>
                </button>
                
                <div className="dropdown-content-menu right" style={{
                    position: 'absolute', top: '100%', right: '0', left: 'auto',
                    flexDirection: 'column', gap: '2px', background: '#FFFFFF',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.12)', border: '1px solid #E5E7EB',
                    borderRadius: '8px', padding: '6px', marginTop: '6px', zIndex: 9999, minWidth: '180px'
                }}>
                    <div style={{ position: 'absolute', top: '-10px', left: 0, right: 0, height: '10px' }}></div>
                    <button className="dropdown-content-btn" onClick={exportPDF}>
                        <FileText size={16}/> as PDF
                    </button>
                    <button className="dropdown-content-btn" onClick={() => exportImage('image/jpeg')}>
                        <Download size={16}/> as JPG Image / zip
                    </button>
                    <button className="dropdown-content-btn" onClick={() => exportImage('image/png')}>
                        <Download size={16}/> as PNG Image / zip
                    </button>
                </div>
              </div>
            </div>
          </header>

          <div className="dashboard" style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
            <aside className="sidebar">
              <div className="sidebar-section">
                <h3>Document Setup</h3>
                <div className="pill-group">
                  <button className={`pill-btn ${activePage?.sheetSize === 'a4-portrait' ? 'active' : ''}`} onClick={() => updateAllPages({ sheetSize: 'a4-portrait' })}>A4 Portrait</button>
                  <button className={`pill-btn ${activePage?.sheetSize === 'a4-landscape' ? 'active' : ''}`} onClick={() => updateAllPages({ sheetSize: 'a4-landscape' })}>A4 Landscape</button>
                </div>

                <h3 style={{ overflow: 'visible' }}>
                Scan Mode 
                <div className="tooltip-container" tabIndex="0">
                    <Info size={15} color="var(--primary)" />
                    <div className="tooltip-content">
                    <ul>
                        <li><strong>Full Page:</strong> Ideal for scanning standard full-page paper documents.</li>
                        <li><strong>ID's (Front & Back):</strong> Perfect for dual-sided documents like Voter IDs, PAN cards, etc.</li>
                    </ul>
                    </div>
                </div>
                </h3>
                <div className="pill-group">
                  <button className={`pill-btn ${activePage?.docMode === 'single' ? 'active' : ''}`} onClick={() => updateAllPages({ docMode: 'single' })}>Full Page</button>
                  <button className={`pill-btn ${activePage?.docMode === 'double' ? 'active' : ''}`} onClick={() => updateAllPages({ docMode: 'double' })}>ID's (Front & Back)</button>
                </div>

                {activePage?.docMode === 'double' ? (
                  <>
                    <h3 style={{textTransform: 'none', color: 'var(--primary)', fontSize: '0.75rem'}}>Placement Layout</h3>
                    <div className="radio-group-cards">
                      <label className={`radio-card ${activePage?.layout === 'vertical' ? 'active' : ''}`}>
                        <input type="radio" name="layout" checked={activePage?.layout === 'vertical'} onChange={() => updateAllPages({ layout: 'vertical' })} />
                        <LayoutTemplate size={16} color={activePage?.layout === 'vertical' ? 'var(--accent)' : 'var(--primary)'} />
                        <span>Top & Bottom</span>
                      </label>
                      <label className={`radio-card ${activePage?.layout === 'horizontal' ? 'active' : ''}`}>
                        <input type="radio" name="layout" checked={activePage?.layout === 'horizontal'} onChange={() => updateAllPages({ layout: 'horizontal' })} />
                        <Columns size={16} color={activePage?.layout === 'horizontal' ? 'var(--accent)' : 'var(--primary)'} />
                        <span>Side by Side</span>
                      </label>
                    </div>
                  </>
                ) : (
                  <>
                    <h3 style={{textTransform: 'none', color: 'var(--primary)', fontSize: '0.75rem'}}>Vertical Alignment</h3>
                    <div className="radio-group-cards">
                      <label className={`radio-card ${activePage?.singleAlign === 'top' ? 'active' : ''}`}>
                        <input type="radio" name="align" checked={activePage?.singleAlign === 'top'} onChange={() => updateAllPages({ singleAlign: 'top' })} />
                        <span>Top</span>
                      </label>
                      <label className={`radio-card ${activePage?.singleAlign === 'center' ? 'active' : ''}`}>
                        <input type="radio" name="align" checked={activePage?.singleAlign === 'center'} onChange={() => updateAllPages({ singleAlign: 'center' })} />
                        <span>Center</span>
                      </label>
                      <label className={`radio-card ${activePage?.singleAlign === 'bottom' ? 'active' : ''}`}>
                        <input type="radio" name="align" checked={activePage?.singleAlign === 'bottom'} onChange={() => updateAllPages({ singleAlign: 'bottom' })} />
                        <span>Bottom</span>
                      </label>
                    </div>
                  </>
                )}
              </div>

              <div className="sidebar-section" style={{ borderBottom: activePageHasContent ? '1px solid var(--border-color)' : 'none' }}>
                <div style={{ marginBottom: '1rem' }}>
                    <h3 style={{textTransform: 'uppercase', margin: 0}}>Upload Documents</h3>
                </div>
                {activePage?.docMode === 'double' ? (
                  <div className="upload-grid">
                    <div className="upload-col">
                      <h5>Front Side</h5>
                      <div className="upload-area" 
                           onClick={() => handleUploadClick('front-file')}
                           onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                           onDrop={(e) => handleDropUpload(e, 'front', 'front-file')}
                      >
                        <FileUp size={20} color={activePage?.frontSrc ? 'var(--accent)' : 'var(--text-muted)'} />
                        <p style={{color: activePage?.frontSrc ? 'var(--accent)' : ''}}>{activePage?.frontSrc ? 'Uploaded' : 'Click or drop an image'}</p>
                        
                        <input type="file" id="front-file-camera" hidden multiple accept="image/*" capture="environment" onChange={(e) => handleFileUpload(e, 'front')} />
                        <input type="file" id="front-file-gallery" hidden multiple accept="image/jpeg, image/png, image/heic, .jpg, .jpeg, .png, .heic" onChange={(e) => handleFileUpload(e, 'front')} />
                      </div>
                    </div>
                    <div className="upload-col">
                      <h5>Back Side</h5>
                      <div className="upload-area" 
                           onClick={() => handleUploadClick('back-file')}
                           onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                           onDrop={(e) => handleDropUpload(e, 'back', 'back-file')}
                      >
                        <FileUp size={20} color={activePage?.backSrc ? 'var(--accent)' : 'var(--text-muted)'} />
                        <p style={{color: activePage?.backSrc ? 'var(--accent)' : ''}}>{activePage?.backSrc ? 'Uploaded' : 'Click or drop an image'}</p>
                        
                        <input type="file" id="back-file-camera" hidden multiple accept="image/*" capture="environment" onChange={(e) => handleFileUpload(e, 'back')} />
                        <input type="file" id="back-file-gallery" hidden multiple accept="image/jpeg, image/png, image/heic, .jpg, .jpeg, .png, .heic" onChange={(e) => handleFileUpload(e, 'back')} />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="upload-grid">
                    <div className="upload-col">
                      <div className="upload-area" 
                           onClick={() => handleUploadClick('front-file')}
                           onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                           onDrop={(e) => handleDropUpload(e, 'front', 'front-file')}
                      >
                        <FileUp size={24} color={activePage?.frontSrc ? 'var(--accent)' : 'var(--text-muted)'} />
                        <p style={{color: activePage?.frontSrc ? 'var(--accent)' : ''}}>{activePage?.frontSrc ? 'Document Uploaded' : 'Click or drop an image'}</p>
                        
                        <input type="file" id="front-file-camera" hidden multiple accept="image/*" capture="environment" onChange={(e) => handleFileUpload(e, 'front')} />
                        <input type="file" id="front-file-gallery" hidden multiple accept="image/jpeg, image/png, image/heic, .jpg, .jpeg, .png, .heic" onChange={(e) => handleFileUpload(e, 'front')} />
                      </div>
                    </div>
                  </div>
                )}
                
              </div>

              {activePageHasContent && (
                <div className="sidebar-section" style={{ borderBottom: 'none', paddingBottom: '5rem' }}>
                  <h3 style={{textTransform: 'uppercase', overflow: 'visible', display: 'flex', alignItems: 'center', gap: '6px'}}>
                      Image Adjustments
                      <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                          <Info 
                              size={15} 
                              color="var(--primary)" 
                              style={{ cursor: 'pointer' }}
                              onClick={(e) => { e.stopPropagation(); setShowAdjTooltip(!showAdjTooltip); }} 
                          />
                          <div className="tooltip-content adj-tooltip-content" style={showAdjTooltip ? { visibility: 'visible', opacity: 1, transform: 'translateY(0)', pointerEvents: 'auto' } : { pointerEvents: 'none' }}>
                              <p style={{margin: 0, fontSize: '0.8rem', color: 'var(--primary)', lineHeight: '1.5', textTransform: 'none', fontWeight: '500'}}>
                                  Adjust the size and spacing gap between documents for precise layout placement on the page.
                              </p>
                              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                                  <button 
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); setShowAdjTooltip(false); }}
                                      style={{ background: 'var(--accent)', color: '#fff', border: 'none', padding: '8px 24px', minWidth: '64px', minHeight: '36px', borderRadius: '6px', fontSize: '0.85rem', fontWeight: '600', cursor: 'pointer' }}
                                  >
                                      OK
                                  </button>
                              </div>
                          </div>
                      </div>
                  </h3>
                  
                  <div className="slider-section">
                    <div className="slider-group">
                      <div className="slider-header">
                        <label>Document Size</label>
                        <span>{activePage?.cardSizeMM} mm</span>
                      </div>
                      <input 
                        type="range" min="40" max={dynamicLimits.maxSize} 
                        value={activePage?.cardSizeMM || 85} 
                        onChange={(e) => {
                          setShowAdjTooltip(false);
                          const val = parseInt(e.target.value);
                          if (val >= dynamicLimits.maxSize && showToast) showToast("Maximum page limit reached.");
                          updateActivePage({ cardSizeMM: val }); 
                        }}
                        className="custom-slider"
                      />
                    </div>

                    {activePage?.docMode === 'double' && (
                      <div className="slider-group">
                        <div className="slider-header">
                          <label>Spacing Gap</label>
                          <span>{activePage?.cardGapMM} mm</span>
                        </div>
                        <input 
                          type="range" min="0" max={dynamicLimits.maxGap} 
                          value={activePage?.cardGapMM || 15} 
                          onChange={(e) => {
                            setShowAdjTooltip(false);
                            const val = parseInt(e.target.value);
                            if (val >= dynamicLimits.maxGap && showToast) showToast("Maximum gap limit reached.");
                            updateActivePage({ cardGapMM: val });
                          }}
                          className="custom-slider"
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </aside>

            <div className="preview-area" style={{ flex: 1, position: 'relative', overflow: 'auto' }}
                 onMouseDown={(e) => {
                    if (!e.target.closest('.ds-element-wrapper') && !e.target.closest('.right-panel') && !e.target.closest('.custom-dropdown-container')) {
                        setActiveContext(null);
                        setRightPanelOpen(false);
                    }
                 }}
                 onTouchStart={(e) => {
                    if (!e.target.closest('.ds-element-wrapper') && !e.target.closest('.right-panel') && !e.target.closest('.custom-dropdown-container')) {
                        setActiveContext(null);
                        setRightPanelOpen(false);
                    }
                 }}
            >
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={pages.map(p => p.id)} strategy={horizontalListSortingStrategy}>
                  <div className="papers-scroll-container">
                    
                    {pages.map((pg, i) => (
                        <SortablePageCard
                            key={pg.id}
                            pg={pg}
                            i={i}
                            activePageId={activePageId}
                            setActivePageId={setActivePageId}
                            setPages={setPages}
                            setEditing={setEditing}
                            removePage={removePage}
                            totalPages={pages.length}
                            updateElement={updateElement}
                            removeElement={removeElement}
                            activeContext={activeContext}
                            setActiveContext={setActiveContext}
                            setRightPanelOpen={setRightPanelOpen}
                            activeTool={activeTool}
                            setActiveTool={setActiveTool}
                            pendingSignature={pendingSignature}
                            setPendingSignature={setPendingSignature}
                        />
                    ))}
                    
                    <button className={`add-page-btn ${activePage ? activePage.sheetSize : 'a4-portrait'} ${!activePageHasContent ? 'disabled' : ''}`} 
                      onClick={addMorePage} style={{ opacity: activePageHasContent ? 1 : 0.35, cursor: activePageHasContent ? 'pointer' : 'default', border: '4px dashed #E5E7EB' }}>
                      <PlusCircle size={44} color={activePageHasContent ? "#8d95a6" : "#6B7280"} strokeWidth={2} style={{ marginBottom: '8px' }} />
                      <p style={{ fontWeight: 600, margin: 0, color: activePageHasContent ? '#8d95a6' : '#6B7280', fontSize: '1.2rem' }}>Scan More</p>
                    </button>
                  </div>
                </SortableContext>
              </DndContext>
            </div>
            
            <aside className={`right-panel ${rightPanelOpen && activeContext ? '' : 'closed'}`} onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}>
              <div className="rp-header">
                  <h2 className="rp-title">Settings</h2>
                  <X size={18} color="#6B7280" style={{ cursor: 'pointer' }} onClick={() => setRightPanelOpen(false)} />
              </div>
              
              <div className="rp-content">
                  {activeElementData ? (
                      <>
                          {activeElementData.type === 'text' && (
                              <>
                                  <div className="rp-box">
                                      <span className="rp-box-title">Text Styles</span>
                                      <div className="rp-row">
                                          <select className="rp-select" value={activeElementData.fontFamily || 'Arial'} onChange={(e) => updateElement(activeContext.pageId, activeContext.elementId, { fontFamily: e.target.value })}>
                                              <option value="Arial">Arial</option>
                                              <option value="Times New Roman">Times Roman</option>
                                              <option value="Courier">Courier</option>
                                          </select>
                                          <input type="number" className="rp-input" value={activeElementData.fontSize || 40} onChange={(e) => updateElement(activeContext.pageId, activeContext.elementId, { fontSize: Number(e.target.value) })} />
                                      </div>
                                  </div>
                                  
                                  <div className="rp-box">
                                      <span className="rp-box-title">Typography</span>
                                      <div className="rp-row">
                                          <button className={`rp-btn ${activeElementData.isBold ? 'active' : ''}`} onClick={() => updateElement(activeContext.pageId, activeContext.elementId, { isBold: !activeElementData.isBold })}><Bold size={16}/></button>
                                          <button className={`rp-btn ${activeElementData.isItalic ? 'active' : ''}`} onClick={() => updateElement(activeContext.pageId, activeContext.elementId, { isItalic: !activeElementData.isItalic })}><Italic size={16}/></button>
                                          <button className={`rp-btn ${activeElementData.isUnderline ? 'active' : ''}`} onClick={() => updateElement(activeContext.pageId, activeContext.elementId, { isUnderline: !activeElementData.isUnderline })}><Underline size={16}/></button>
                                      </div>
                                      <div className="rp-row">
                                          <button className={`rp-btn ${activeElementData.textAlign === 'left' ? 'active' : ''}`} onClick={() => updateElement(activeContext.pageId, activeContext.elementId, { textAlign: 'left' })}><AlignLeft size={16}/></button>
                                          <button className={`rp-btn ${activeElementData.textAlign === 'center' ? 'active' : ''}`} onClick={() => updateElement(activeContext.pageId, activeContext.elementId, { textAlign: 'center' })}><AlignCenter size={16}/></button>
                                          <button className={`rp-btn ${activeElementData.textAlign === 'right' ? 'active' : ''}`} onClick={() => updateElement(activeContext.pageId, activeContext.elementId, { textAlign: 'right' })}><AlignRight size={16}/></button>
                                      </div>
                                  </div>

                                  <div className="rp-box">
                                      <span className="rp-box-title">Color</span>
                                      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                          {['#111827', '#E0243A', '#2563EB', '#16A34A', '#D97706', '#9333EA', '#4B5563', '#FFFFFF'].map(c => (
                                              <div key={c} onClick={() => updateElement(activeContext.pageId, activeContext.elementId, { color: c })}
                                                  className="color-circle" style={{ background: c, borderColor: activeElementData.color === c ? '#2563EB' : (c==='#FFFFFF' ? '#E5E7EB' : 'transparent'), boxShadow: activeElementData.color === c ? '0 0 0 2px #FFF inset' : 'none' }} />
                                          ))}
                                      </div>
                                  </div>
                              </>
                          )}

                          {activeElementData.type === 'signature' && (
                              <div className="rp-box">
                                  <span className="rp-box-title">Signature Settings</span>
                                  <div style={{ padding: '16px', background: '#F3F4F6', borderRadius: '8px', marginBottom: '16px', textAlign: 'center', border: '1px solid #E5E7EB' }}>
                                      <img src={activeElementData.src} style={{ maxWidth: '100%', maxHeight: '60px', objectFit: 'contain' }} alt="sig" />
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                                      <span style={{fontSize: '0.8rem', fontWeight: 600, color: '#6B7280'}}>Scale</span>
                                      <input type="range" min="0.3" max="3" step="0.1" style={{flex: 1}} value={activeElementData.scale || 1} onChange={(e) => updateElement(activeContext.pageId, activeContext.elementId, { scale: parseFloat(e.target.value) })} />
                                  </div>
                                  <button className="rp-btn" style={{width: '100%', padding: '10px'}} onClick={() => { setShowSigModal(true); setRightPanelOpen(false); }}>Change Signature</button>
                              </div>
                          )}

                          <button className="save-changes-btn" onClick={() => { setActiveContext(null); setRightPanelOpen(false); }}>
                              Save Changes
                          </button>
                      </>
                  ) : (
                      <div style={{ fontSize: '0.8rem', color: '#6B7280', textAlign: 'center', marginTop: '40px' }}>Select an element to edit properties.</div>
                  )}
              </div>
            </aside>

          </div>
        </section>
      )}
    </div>
  );
}