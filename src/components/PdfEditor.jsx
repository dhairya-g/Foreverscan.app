import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  FileUp, ArrowLeft, Download, Search, AlertTriangle, ShieldCheck, 
  CheckSquare, Square as SquareIcon, ZoomIn, ZoomOut, SquarePen, Highlighter, Eraser, 
  MousePointer2, Type, GripHorizontal, Trash2, X, ChevronRight,
  ChevronLeft, Minus, Plus, Maximize, Minimize, Hand, RotateCw, 
  PlusCircle, Printer, Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight, Copy, RotateCcw,
  Circle, Square as RectIcon, PenLine, Edit2, ChevronDown, Image as ImageIcon, Settings, ChevronUp, Star, Eraser as WhiteoutIcon, PanelLeft,
  Undo, Redo
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { trackUserAction } from '../utils/analytics';
import { DndContext, closestCenter, MouseSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// IMPORT WELCOME MODAL
import { WelcomeModal } from './Modals';

// Unpkg CDN for Worker to avoid MIME type issues
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.mjs`;

// ==========================================
// RESET CONFIRMATION MODAL
// ==========================================
const ResetConfirmModal = ({ onClose, onConfirm }) => {
    return (
        <div className="modal-overlay" style={{ zIndex: 99999 }}>
            <div className="modal-content" style={{ maxWidth: '400px', padding: '2.5rem 2rem', background: 'var(--ui-bg)', textAlign: 'center', borderRadius: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.2rem' }}>
                   <AlertTriangle size={48} color="var(--accent)" strokeWidth={1.5} />
                </div>
                <h3 style={{ marginBottom: '1rem', color: 'var(--text-main)', fontSize: '1.25rem', fontWeight: '800' }}>Reset All Edits?</h3>
                <p style={{ marginBottom: '2rem', color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: '1.6' }}>
                    This will clear all text, shapes, signatures, and drawings from the pages. The PDF file will remain open.
                </p>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <button className="btn btn-outline" style={{ flex: 1, padding: '12px', background: '#F3F4F6', border: '1px solid var(--border)', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', color: 'var(--text-main)' }} onClick={onClose}>
                        Cancel
                    </button>
                    <button className="btn btn-primary" style={{ flex: 1, padding: '12px', background: 'var(--accent)', color: '#FFF', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }} onClick={() => { onConfirm(); onClose(); }}>
                        Reset Edits
                    </button>
                </div>
            </div>
        </div>
    );
};

// ==========================================
// 1. SIDEBAR THUMBNAIL 
// ==========================================
const SidebarThumbnail = ({ page, index, onToggleSelect, onDelete, onRotate, onDuplicate, scrollToPage }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: page.id });
  const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 100 : 1, opacity: isDragging ? 0.8 : 1, cursor: 'grab', marginBottom: '16px' };

  return (
    <div ref={setNodeRef} style={style} className={`sidebar-thumb-card ${!page.selected ? 'unchecked' : ''}`}>
      <div className="thumb-header-top">
        <div className="thumb-checkbox" onClick={(e) => { e.stopPropagation(); onToggleSelect(page.id); }}>
            {page.selected ? <CheckSquare size={16} color="#E0243A" fill="#FFF" /> : <SquareIcon size={16} color="#9CA3AF" fill="#FFF" />}
        </div>
        <span className="thumb-number">{index + 1}</span>
      </div>
      <div onClick={() => scrollToPage(page.id)} style={{ cursor: 'pointer', padding: '12px 12px 0 12px', background: '#F3F4F6' }}>
          <img src={page.thumbUrl} alt={`Pg ${index + 1}`} style={{ width: '100%', display: 'block', pointerEvents: 'none', transform: `rotate(${page.rotation || 0}deg)`, transition: '0.3s', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }} />
      </div>
      
      <div className="thumb-bottom-actions">
        <button onClick={(e) => { e.stopPropagation(); onDuplicate(page.id); }} title="Duplicate"><Copy size={16} color="#4B5563"/></button>
        <button onClick={(e) => { e.stopPropagation(); onRotate(page.id); }} title="Rotate"><RotateCw size={16} color="#4B5563"/></button>
        <button onClick={(e) => { e.stopPropagation(); onDelete(page.id); }} title="Delete"><Trash2 size={16} color="#E0243A"/></button>
      </div>
      <div className="thumb-drag-handle" {...attributes} {...listeners}><GripHorizontal size={18} color="#9CA3AF" /></div>
    </div>
  );
};

// ==========================================
// 2. MAIN CANVAS PAGE COMPONENT
// ==========================================
const PdfPage = ({ pdfDoc, pageData, zoomLevel, updateElement, removeElement, activeTool, setPages, activeContext, setActiveContext, pendingSignature, setPendingSignature, setActiveTool, setRightPanelOpen, searchResults, currentSearchIndex, recordHistory }) => {
    const mainCanvasRef = useRef(null);
    const drawCanvasRef = useRef(null);
    const renderTaskRef = useRef(null);
    const isDrawingRef = useRef(false);
    const currentPathRef = useRef([]);

    const [pageDimensions, setPageDimensions] = useState({ width: 800, height: 1100 });

    const pageMatches = searchResults.filter(r => r.pageId === pageData.id);

    useEffect(() => {
        if (!pdfDoc || !mainCanvasRef.current) return;
        
        let timeoutId;
        let isCancelled = false;

        const renderPage = async () => {
            try {
                const page = await pdfDoc.getPage(pageData.originalPageNum);
                if (isCancelled) return;

                const baseViewport = page.getViewport({ scale: 1, rotation: pageData.rotation || 0 });
                const cssWidth = baseViewport.width * (zoomLevel / 100);
                const cssHeight = baseViewport.height * (zoomLevel / 100);
                setPageDimensions({ width: cssWidth, height: cssHeight });

                timeoutId = setTimeout(async () => {
                    if (isCancelled) return;
                    
                    const renderScale = (zoomLevel / 100) * (window.devicePixelRatio || 1);
                    const renderViewport = page.getViewport({ scale: renderScale, rotation: pageData.rotation || 0 });
                    
                    const canvas = mainCanvasRef.current;
                    const context = canvas.getContext('2d');
                    canvas.width = renderViewport.width; canvas.height = renderViewport.height;

                    if (renderTaskRef.current) {
                        try { renderTaskRef.current.cancel(); } catch(e){}
                    }
                    
                    try {
                        renderTaskRef.current = page.render({ canvasContext: context, viewport: renderViewport });
                        await renderTaskRef.current.promise;
                        redrawOverlay(renderViewport.width, renderViewport.height); 
                    } catch (e) {
                        // ignore render cancel exceptions
                    }
                }, 150); // Fast debounce

            } catch (e) { console.error("Render Page Error:", e); }
        };
        renderPage();

        return () => {
            isCancelled = true;
            if (timeoutId) clearTimeout(timeoutId);
        };
    }, [pdfDoc, pageData.originalPageNum, zoomLevel, pageData.rotation]);

    const redrawOverlay = useCallback((canvasWidth, canvasHeight) => {
        const canvas = drawCanvasRef.current;
        if (!canvas) return;
        canvas.width = canvasWidth || canvas.width; canvas.height = canvasHeight || canvas.height;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        if (!pageData.drawings) return;
        pageData.drawings.forEach(drawObj => {
            if (drawObj.points.length < 2) return;
            ctx.beginPath();
            ctx.moveTo((drawObj.points[0].x / 100) * canvas.width, (drawObj.points[0].y / 100) * canvas.height);
            for (let i = 1; i < drawObj.points.length; i++) {
                ctx.lineTo((drawObj.points[i].x / 100) * canvas.width, (drawObj.points[i].y / 100) * canvas.height);
            }
            ctx.strokeStyle = drawObj.color;
            ctx.lineWidth = drawObj.width * (canvas.width / 800); 
            ctx.lineCap = drawObj.type === 'eraser' ? 'square' : 'round';
            ctx.lineJoin = drawObj.type === 'eraser' ? 'miter' : 'round';
            ctx.globalAlpha = drawObj.type === 'highlight' ? 0.4 : 1.0;
            ctx.globalCompositeOperation = drawObj.type === 'highlight' ? 'multiply' : 'source-over';
            ctx.stroke();
        });
    }, [pageData.drawings]);

    useEffect(() => { redrawOverlay(); }, [redrawOverlay]);

    const startDrawing = (e) => {
        if (!['draw', 'highlight', 'eraser'].includes(activeTool)) return;
        e.preventDefault(); isDrawingRef.current = true;
        const rect = drawCanvasRef.current.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        currentPathRef.current = [{ x: ((clientX - rect.left) / rect.width) * 100, y: ((clientY - rect.top) / rect.height) * 100 }];
    };

    const draw = (e) => {
        if (!isDrawingRef.current) return;
        e.preventDefault();
        const rect = drawCanvasRef.current.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        currentPathRef.current.push({ x: ((clientX - rect.left) / rect.width) * 100, y: ((clientY - rect.top) / rect.height) * 100 });
        
        const canvas = drawCanvasRef.current;
        const ctx = canvas.getContext('2d');
        const pts = currentPathRef.current;
        if (pts.length < 2) return;
        
        ctx.beginPath();
        ctx.moveTo((pts[pts.length - 2].x / 100) * canvas.width, (pts[pts.length - 2].y / 100) * canvas.height);
        ctx.lineTo((pts[pts.length - 1].x / 100) * canvas.width, (pts[pts.length - 1].y / 100) * canvas.height);
        
        ctx.strokeStyle = activeTool === 'highlight' ? '#FDE047' : activeTool === 'eraser' ? '#FFFFFF' : '#E0243A';
        ctx.lineWidth = (activeTool === 'highlight' ? 16 : activeTool === 'eraser' ? 24 : 3) * (canvas.width / 800);
        ctx.lineCap = activeTool === 'eraser' ? 'square' : 'round';
        ctx.lineJoin = activeTool === 'eraser' ? 'miter' : 'round';
        ctx.globalAlpha = activeTool === 'highlight' ? 0.4 : 1.0;
        ctx.globalCompositeOperation = activeTool === 'highlight' ? 'multiply' : 'source-over';
        ctx.stroke();
    };

    const stopDrawing = () => {
        if (!isDrawingRef.current) return;
        isDrawingRef.current = false;
        if(currentPathRef.current.length < 2) { currentPathRef.current = []; return; }
        
        recordHistory(); 
        
        const newDrawing = {
            id: Date.now(), type: activeTool,
            color: activeTool === 'highlight' ? '#FDE047' : activeTool === 'eraser' ? '#FFFFFF' : '#E0243A',
            width: activeTool === 'highlight' ? 16 : activeTool === 'eraser' ? 24 : 3,
            points: [...currentPathRef.current]
        };
        setPages(prev => prev.map(p => p.id === pageData.id ? { ...p, drawings: [...p.drawings, newDrawing] } : p));
        currentPathRef.current = [];
    };

    const handleCanvasClick = (e) => {
        e.stopPropagation(); 
        const rect = e.currentTarget.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        
        if (activeTool === 'text') {
            recordHistory();
            const newEl = { id: Date.now(), type: 'text', content: '', x, y, fontSize: 16, color: '#111827', fontFamily: 'Arial', textAlign: 'left', isBold: false, isItalic: false, isUnderline: false, scale: 1 };
            setPages(prev => prev.map(p => p.id === pageData.id ? { ...p, elements: [...p.elements, newEl] } : p));
            setActiveContext({ pageId: pageData.id, elementId: newEl.id, mode: 'edit' }); 
            setRightPanelOpen(false); 
            setActiveTool('select');
        } else if (activeTool === 'place-signature' && pendingSignature) {
            recordHistory();
            const newEl = { ...pendingSignature, id: Date.now(), x, y, scale: 1 };
            setPages(prev => prev.map(p => p.id === pageData.id ? { ...p, elements: [...p.elements, newEl] } : p));
            setPendingSignature(null);
            setRightPanelOpen(false);
            setActiveTool('select');
        }
    };

    const renderResizeDots = (el, isActive, isEditing) => {
        if (!isActive || isEditing || el.type === 'text') return null;
        
        const handleResize = (e, factorY) => {
            e.stopPropagation(); e.preventDefault(); 
            const startY = e.clientY || (e.touches && e.touches[0].clientY); 
            const startScale = el.scale || 1;
            
            let hasResized = false;
            
            const onMove = (evt) => {
                if (!hasResized) { recordHistory(); hasResized = true; } 
                const moveY = evt.clientY || (evt.touches && evt.touches[0].clientY);
                const delta = (moveY - startY) * factorY;
                updateElement(pageData.id, el.id, { scale: Math.max(0.1, startScale + delta) });
            };
            const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); document.removeEventListener('touchmove', onMove); document.removeEventListener('touchend', onUp); };
            document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp);
            document.addEventListener('touchmove', onMove, {passive: false}); document.addEventListener('touchend', onUp);
        };

        return (
            <>
                <div className="resize-dot nw" onMouseDown={(e) => handleResize(e, -0.005)} onTouchStart={(e) => handleResize(e, -0.005)}></div>
                <div className="resize-dot n" onMouseDown={(e) => handleResize(e, -0.005)} onTouchStart={(e) => handleResize(e, -0.005)}></div>
                <div className="resize-dot ne" onMouseDown={(e) => handleResize(e, -0.005)} onTouchStart={(e) => handleResize(e, -0.005)}></div>
                <div className="resize-dot w" onMouseDown={(e) => handleResize(e, 0)} onTouchStart={(e) => handleResize(e, 0)}></div>
                <div className="resize-dot e" onMouseDown={(e) => handleResize(e, 0)} onTouchStart={(e) => handleResize(e, 0)}></div>
                <div className="resize-dot sw" onMouseDown={(e) => handleResize(e, 0.005)} onTouchStart={(e) => handleResize(e, 0.005)}></div>
                <div className="resize-dot s" onMouseDown={(e) => handleResize(e, 0.005)} onTouchStart={(e) => handleResize(e, 0.005)}></div>
                <div className="resize-dot se" onMouseDown={(e) => handleResize(e, 0.005)} onTouchStart={(e) => handleResize(e, 0.005)}></div>
            </>
        );
    };

    return (
        <div id={`page-${pageData.id}`} className="pdf-page-shadow" style={{ opacity: pageData.selected ? 1 : 0.3, width: `${pageDimensions.width}px`, height: `${pageDimensions.height}px` }}>
            <div style={{ position: 'relative', width: '100%', height: '100%', backgroundColor: '#FFF', overflow: 'hidden' }}>
                <canvas ref={mainCanvasRef} style={{ width: '100%', height: '100%', display: 'block' }}></canvas>
                
                <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 35 }}>
                    {pageMatches.map((match, idx) => {
                        const isCurrent = searchResults[currentSearchIndex]?.id === match.id;
                        return (
                            <div key={idx} id={match.id} style={{
                                position: 'absolute',
                                left: `calc(${match.x}% - 0.5%)`, 
                                top: `calc(${match.y}% - 0.5%)`,
                                width: `calc(${match.width}% + 1%)`, 
                                height: `calc(${match.height}% + 1%)`,
                                backgroundColor: isCurrent ? 'rgba(224, 36, 58, 0.3)' : 'rgba(224, 36, 58, 0.1)',
                                border: isCurrent ? '2px solid #E0243A' : 'none',
                                borderRadius: '4px',
                                boxShadow: isCurrent ? '0 0 12px rgba(224, 36, 58, 0.4)' : 'none',
                                transition: '0.2s',
                                zIndex: isCurrent ? 10 : 1
                            }}/>
                        );
                    })}
                </div>

                <canvas 
                    ref={drawCanvasRef} 
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 40, touchAction: 'none', 
                             cursor: ['draw', 'highlight', 'eraser'].includes(activeTool) ? 'crosshair' : (activeTool === 'hand' ? 'grab' : 'default'),
                             pointerEvents: ['draw', 'highlight', 'eraser'].includes(activeTool) ? 'auto' : 'none' }}
                    onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={stopDrawing} onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing} onTouchMove={draw} onTouchEnd={stopDrawing}
                />

                {['text', 'place-signature'].includes(activeTool) && (
                    <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 45, cursor: activeTool==='place-signature' ? 'crosshair' : 'text' }} onMouseDown={handleCanvasClick} />
                )}

                {pageData.elements.map(el => {
                    const isActive = activeContext?.elementId === el.id;
                    const isEditing = isActive && activeContext?.mode === 'edit';
                    
                    return (
                    <div 
                        key={el.id} className={`element-wrapper ${isActive ? 'active' : ''}`} 
                        style={{ left: `${el.x}%`, top: `${el.y}%`, pointerEvents: ['draw', 'highlight', 'eraser'].includes(activeTool) ? 'none' : 'auto' }}
                        onClick={(e) => e.stopPropagation()} 
                        onMouseDown={(e) => {
                            e.stopPropagation(); 
                            if (e.target.tagName === 'TEXTAREA' || e.target.closest('.floating-actions') || e.target.closest('.resize-dot')) return;
                            e.preventDefault(); 
                            
                            if(!isActive) {
                                setActiveContext({ pageId: pageData.id, elementId: el.id, mode: 'select' });
                                setRightPanelOpen(false); 
                            }
                            
                            const parentRect = e.currentTarget.parentElement.getBoundingClientRect();
                            const elRect = e.currentTarget.getBoundingClientRect();
                            
                            const elWidthPercent = (elRect.width / parentRect.width) * 100;
                            const elHeightPercent = (elRect.height / parentRect.height) * 100;

                            const startX = el.x; 
                            const startY = el.y; 
                            const startClientX = e.clientX || (e.touches && e.touches[0].clientX); 
                            const startClientY = e.clientY || (e.touches && e.touches[0].clientY);
                            
                            let hasDragged = false;

                            const onMove = (evt) => {
                                if (!hasDragged) { recordHistory(); hasDragged = true; } 
                                
                                const moveX = evt.clientX || (evt.touches && evt.touches[0].clientX);
                                const moveY = evt.clientY || (evt.touches && evt.touches[0].clientY);
                                
                                let newX = startX + ((moveX - startClientX) / parentRect.width) * 100;
                                let newY = startY + ((moveY - startClientY) / parentRect.height) * 100;

                                newX = Math.max(0, Math.min(100 - elWidthPercent, newX));
                                newY = Math.max(0, Math.min(100 - elHeightPercent, newY));

                                updateElement(pageData.id, el.id, { x: newX, y: newY });
                            };
                            
                            const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); document.removeEventListener('touchmove', onMove); document.removeEventListener('touchend', onUp); };
                            
                            document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp);
                            document.addEventListener('touchmove', onMove, {passive: false}); document.addEventListener('touchend', onUp);
                        }}
                        onDoubleClick={(e) => {
                            if(el.type === 'text') {
                                e.stopPropagation();
                                recordHistory();
                                setActiveContext({ pageId: pageData.id, elementId: el.id, mode: 'edit' });
                            }
                        }}
                    >
                        {renderResizeDots(el, isActive, isEditing)}

                        {el.type === 'text' && (
                            isEditing ? (
                                <textarea 
                                    value={el.content} placeholder="Type here.."
                                    onMouseDown={(e) => e.stopPropagation()} 
                                    onTouchStart={(e) => e.stopPropagation()}
                                    onChange={(e) => {
                                        e.target.style.height = 'auto'; e.target.style.height = `${e.target.scrollHeight}px`;
                                        updateElement(pageData.id, el.id, { content: e.target.value });
                                    }}
                                    onBlur={() => setActiveContext({ pageId: pageData.id, elementId: el.id, mode: 'select' })}
                                    className="element-textarea" 
                                    style={{ 
                                        fontSize: `${(el.fontSize || 16) * (zoomLevel / 100)}px`, color: el.color, 
                                        fontWeight: el.isBold ? 'bold' : 'normal', fontStyle: el.isItalic ? 'italic' : 'normal',
                                        textDecoration: el.isUnderline ? 'underline' : 'none', fontFamily: el.fontFamily || 'Arial', textAlign: el.textAlign || 'left'
                                    }}
                                    autoFocus
                                />
                            ) : (
                                <div className="element-text-display" style={{ 
                                    fontSize: `${(el.fontSize || 16) * (zoomLevel / 100)}px`, color: el.color, 
                                    fontWeight: el.isBold ? 'bold' : 'normal', fontStyle: el.isItalic ? 'italic' : 'normal',
                                    textDecoration: el.isUnderline ? 'underline' : 'none', fontFamily: el.fontFamily || 'Arial', textAlign: el.textAlign || 'left',
                                    opacity: el.content ? 1 : 0.5
                                }}>
                                    {el.content || 'Type here..'}
                                </div>
                            )
                        )}

                        {el.type === 'shape-rect' && <div style={{ width: `${100 * el.scale * (zoomLevel / 100)}px`, height: `${100 * el.scale * (zoomLevel / 100)}px`, border: `${(el.strokeWidth || 4) * (zoomLevel / 100)}px solid ${el.color}`, pointerEvents: 'none' }} />}
                        {el.type === 'shape-circle' && <div style={{ width: `${100 * el.scale * (zoomLevel / 100)}px`, height: `${100 * el.scale * (zoomLevel / 100)}px`, border: `${(el.strokeWidth || 4) * (zoomLevel / 100)}px solid ${el.color}`, borderRadius: '50%', pointerEvents: 'none' }} />}
                        {el.type === 'shape-line' && <div style={{ width: `${100 * el.scale * (zoomLevel / 100)}px`, height: `${(el.strokeWidth || 4) * (zoomLevel / 100)}px`, background: el.color, pointerEvents: 'none' }} />}
                        
                        {el.type === 'shape-whiteout' && <div style={{ width: `${100 * el.scale * (zoomLevel / 100)}px`, height: `${100 * el.scale * (zoomLevel / 100)}px`, background: '#FFFFFF', pointerEvents: 'none' }} />}

                        {el.type === 'image' && (
                            <img src={el.src} alt="Inserted" style={{ width: `${150 * el.scale * (zoomLevel / 100)}px`, pointerEvents: 'none' }} />
                        )}

                        {el.type === 'signature' && (
                            <img src={el.src} alt="Signature" style={{ width: `${150 * el.scale * (zoomLevel / 100)}px`, pointerEvents: 'none' }} />
                        )}

                        {isActive && !isEditing && (
                            <div className="floating-actions no-drag">
                                {el.type === 'text' && (
                                    <button className="action-btn" onMouseDown={(e) => { e.stopPropagation(); recordHistory(); setActiveContext({ pageId: pageData.id, elementId: el.id, mode: 'edit' }); }} onTouchStart={(e) => { e.stopPropagation(); recordHistory(); setActiveContext({ pageId: pageData.id, elementId: el.id, mode: 'edit' }); }} title="Edit Text">
                                        <Edit2 size={16} />
                                    </button>
                                )}
                                <div className="action-divider"></div>
                                <button className="action-btn" onMouseDown={(e) => { e.stopPropagation(); setRightPanelOpen(true); }} onTouchStart={(e) => { e.stopPropagation(); setRightPanelOpen(true); }} title="Settings">
                                    <Settings size={16} color="#4B5563"/>
                                </button>
                                <div className="action-divider"></div>
                                <button className="action-btn" onMouseDown={(e) => { e.stopPropagation(); removeElement(pageData.id, el.id); }} onTouchStart={(e) => { e.stopPropagation(); removeElement(pageData.id, el.id); }} title="Delete">
                                    <Trash2 size={16} color="#E0243A"/>
                                </button>
                            </div>
                        )}
                    </div>
                );
                })}
            </div>
        </div>
    );
};

// ==========================================
// 3. SIGNATURE MODAL
// ==========================================
const SignatureModal = ({ onClose, onSave, showToast }) => {
    const [mode, setMode] = useState('type'); 
    const [typedText, setTypedText] = useState('');
    const [selectedFont, setSelectedFont] = useState("'Brush Script MT', cursive");
    const [uploadPreview, setUploadPreview] = useState(null);

    const handleUpload = (e) => {
        const file = e.target.files[0];
        if(!file) return;
        
        if(file.size > 2 * 1024 * 1024) {
            if(showToast) showToast("File too large. Maximum size is 2MB.");
            else alert("File too large. Maximum size is 2MB.");
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
        onSave({ type: 'signature', fontType: 'upload', src: dataUrl, content: typedText, signatureFont: selectedFont }); 
    };

    return (
        <div className="modal-overlay" style={{ zIndex: 99999 }}>
            <div className="modal-content" style={{ width: '90%', maxWidth: '400px', background: '#FFF', padding: '24px', borderRadius: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                    <h3 style={{ margin: 0, color: 'var(--text-main)' }}>Add Signature</h3>
                    <X size={18} style={{cursor: 'pointer'}} onClick={onClose}/>
                </div>
                
                <div style={{ display: 'flex', background: '#F3F4F6', padding: '4px', borderRadius: '8px', marginBottom: '20px' }}>
                    <button onClick={() => setMode('type')} style={{ flex: 1, padding: '8px', background: mode==='type'?'#FFF':'transparent', border: 'none', borderRadius: '6px', fontWeight: 600, color: mode==='type'?'var(--text-main)':'var(--text-muted)', boxShadow: mode==='type'?'0 2px 4px rgba(0,0,0,0.05)':'none', cursor: 'pointer', transition: '0.2s' }}>Type</button>
                    <button onClick={() => setMode('upload')} style={{ flex: 1, padding: '8px', background: mode==='upload'?'#FFF':'transparent', border: 'none', borderRadius: '6px', fontWeight: 600, color: mode==='upload'?'var(--text-main)':'var(--text-muted)', boxShadow: mode==='upload'?'0 2px 4px rgba(0,0,0,0.05)':'none', cursor: 'pointer', transition: '0.2s' }}>Upload</button>
                </div>
                
                {mode === 'type' ? (
                    <div>
                        <input type="text" placeholder="Type your signature..." value={typedText} onChange={(e) => setTypedText(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '1rem', marginBottom: '12px' }} />
                        
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                            {["'Brush Script MT', cursive", "'Lucida Handwriting', cursive", "'Comic Sans MS', cursive"].map((f, i) => (
                                <button key={i} onClick={() => setSelectedFont(f)} style={{ flex: 1, padding: '8px', fontFamily: f, fontSize: '1rem', fontWeight: '400', background: selectedFont === f ? '#E5E7EB' : '#FFF', border: '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer' }}>Sig {i+1}</button>
                            ))}
                        </div>

                        <div style={{ height: '100px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: selectedFont, fontSize: '2.5rem', fontWeight: '400', color: '#111827', background: '#F9FAFB', borderRadius: '6px' }}>
                            {typedText || 'Preview'}
                        </div>

                        {typedText.trim() ? (
                            <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                                <button onClick={() => setTypedText('')} style={{ flex: 1, padding: '12px', background: '#F3F4F6', color: 'var(--text-main)', border: '1px solid var(--border)', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}>Clear</button>
                                <button onClick={handleInsertType} style={{ flex: 2, padding: '12px', background: 'var(--accent)', color: '#FFF', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}>Insert Signature</button>
                            </div>
                        ) : (
                            <button disabled style={{ width: '100%', padding: '12px', background: '#E5E7EB', color: '#9CA3AF', border: 'none', borderRadius: '6px', fontWeight: 600, marginTop: '16px', cursor: 'not-allowed' }}>Insert Signature</button>
                        )}
                    </div>
                ) : (
                    <div>
                        {uploadPreview ? (
                            <>
                                <div style={{ height: '150px', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', background: '#F9FAFB', padding: '8px' }}>
                                    <img src={uploadPreview} style={{maxWidth: '100%', maxHeight: '100%'}} />
                                </div>
                                <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                                    <button onClick={() => document.getElementById('sig-upload-btn').click()} style={{ flex: 1, padding: '12px', background: '#F3F4F6', color: 'var(--text-main)', border: '1px solid var(--border)', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}>Replace</button>
                                    <button onClick={() => onSave({ type: 'signature', fontType: 'upload', src: uploadPreview })} style={{ flex: 2, padding: '12px', background: 'var(--accent)', color: '#FFF', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}>Insert Signature</button>
                                </div>
                            </>
                        ) : (
                            <div style={{ height: '150px', border: '2px dashed var(--border)', display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', cursor: 'pointer', background: '#F9FAFB' }} onClick={() => document.getElementById('sig-upload-btn').click()}>
                                <FileUp size={24} color="var(--text-muted)"/>
                                <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Click to Upload PNG/JPG</span>
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Max file size: 2MB</span>
                            </div>
                        )}
                        <input type="file" id="sig-upload-btn" hidden accept="image/png, image/jpeg, image/jpg" onChange={handleUpload} />
                    </div>
                )}
            </div>
        </div>
    );
};

// ==========================================
// 4. REUSABLE SEARCH BAR COMPONENT
// ==========================================
const SearchBarComponent = ({ searchText, setSearchText, searchResults, currentSearchIndex, handlePrevSearch, handleNextSearch, className, style }) => (
    <div className={`search-container ${className || ''}`} style={style}>
        <Search size={14} color="#9CA3AF" style={{ margin: '0 8px', flexShrink: 0 }} />
        <input type="text" placeholder="Search..." value={searchText} onChange={(e) => setSearchText(e.target.value)} className="search-input" />
        
        <div className={`search-controls ${searchText.trim().length >= 2 ? 'active' : ''}`}>
            <span className="search-count">
                {searchResults.length > 0 ? `${currentSearchIndex + 1} / ${searchResults.length}` : '0 / 0'}
            </span>
            <div className="search-nav-btns">
                <button className="s-btn" onClick={handlePrevSearch} disabled={searchResults.length === 0}><ChevronUp size={16}/></button>
                <button className="s-btn" onClick={handleNextSearch} disabled={searchResults.length === 0}><ChevronDown size={16}/></button>
            </div>
        </div>
    </div>
);

// ==========================================
// 5. MAIN MODIFIER MODULE
// ==========================================
export default function PdfModifier({ showToast, showLoader, hideLoader, triggerFeedback }) {
  const [pages, setPages] = useState([]); 
  const [baseFileName, setBaseFileName] = useState('document');
  
  const [activeContext, setActiveContext] = useState(null); 
  const [activeTool, setActiveTool] = useState('select'); 
  const [zoomLevel, setZoomLevel] = useState(100);
  const [headerPageNum, setHeaderPageNum] = useState('1'); 
  const [isFitWidth, setIsFitWidth] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  
  const [sidebarOpen, setSidebarOpen] = useState(true);
  
  useEffect(() => {
    if (window.innerWidth <= 768) {
      setSidebarOpen(false);
    }
  }, []);
  
  const [showShapeDropdown, setShowShapeDropdown] = useState(false);
  
  const [showSigModal, setShowSigModal] = useState(false);
  const [pendingSignature, setPendingSignature] = useState(null);

  const [formatAlert, setFormatAlert] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);

  // Reference hooks decoupled from render states
  const zoomLevelRef = useRef(zoomLevel);
  useEffect(() => { zoomLevelRef.current = zoomLevel; }, [zoomLevel]);
  const activeToolRef = useRef(activeTool);
  useEffect(() => { activeToolRef.current = activeTool; }, [activeTool]);

  useEffect(() => {
    const hasSeenWelcome = localStorage.getItem('hasSeenPdfWelcomeModal');
    if (!hasSeenWelcome) {
      setShowWelcomeModal(true);
      localStorage.setItem('hasSeenPdfWelcomeModal', 'true');
    }
  }, []);

  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [currentSearchIndex, setCurrentSearchIndex] = useState(0);

  const scrollContainerRef = useRef(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } })
  );

  // ---------- UNDO / REDO SYSTEM ----------
  const [past, setPast] = useState([]);
  const [future, setFuture] = useState([]);
  const pagesRef = useRef(pages);
  
  useEffect(() => { pagesRef.current = pages; }, [pages]);

  const clonePagesState = useCallback((pagesToClone) => {
      return pagesToClone.map(p => ({
          ...p,
          elements: JSON.parse(JSON.stringify(p.elements || [])),
          drawings: JSON.parse(JSON.stringify(p.drawings || [])),
      }));
  }, []);

  const recordHistory = useCallback(() => {
      setPast(prev => {
          const newPast = [...prev, clonePagesState(pagesRef.current)];
          if (newPast.length > 30) newPast.shift();
          return newPast;
      });
      setFuture([]);
  }, [clonePagesState]);

  const undo = useCallback(() => {
      if (past.length === 0) return;
      const previous = past[past.length - 1];
      setPast(prev => prev.slice(0, -1));
      setFuture(prev => [clonePagesState(pagesRef.current), ...prev]);
      setPages(currentPages => currentPages.map(cp => {
          const prevPage = previous.find(p => p.id === cp.id);
          if (prevPage) return { ...cp, elements: prevPage.elements, drawings: prevPage.drawings, rotation: prevPage.rotation, selected: prevPage.selected };
          return cp;
      }).filter(cp => previous.find(p => p.id === cp.id)));
      setActiveContext(null); 
  }, [past, clonePagesState]);

  const redo = useCallback(() => {
      if (future.length === 0) return;
      const next = future[0];
      setFuture(prev => prev.slice(1));
      setPast(prev => [...prev, clonePagesState(pagesRef.current)]);
      setPages(currentPages => currentPages.map(cp => {
        const nextPage = next.find(p => p.id === cp.id);
        if (nextPage) return { ...cp, elements: nextPage.elements, drawings: nextPage.drawings, rotation: nextPage.rotation, selected: nextPage.selected };
        return cp;
      }).filter(cp => next.find(p => p.id === cp.id)));
      setActiveContext(null);
  }, [future, clonePagesState]);

  useEffect(() => {
      const handleKeyDown = (e) => {
          if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return; 
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
              e.preventDefault();
              if (e.shiftKey) redo(); else undo();
          } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
              e.preventDefault();
              redo();
          }
      };
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  useEffect(() => {
      if (!activeContext) setRightPanelOpen(false); 
  }, [activeContext]);

  // 👇 FIX: Robust Page Number Sync Using Native Fast Scroll (RAF) 👇
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || pages.length === 0) return;

    let ticking = false;

    const handleScrollUpdate = () => {
        if (!ticking) {
            window.requestAnimationFrame(() => {
                const containerRect = container.getBoundingClientRect();
                const containerCenter = containerRect.top + containerRect.height / 2;

                let closestId = pages[0]?.id;
                let minDistance = Infinity;

                pages.forEach(p => {
                    const el = document.getElementById(`page-${p.id}`);
                    if (el) {
                        const rect = el.getBoundingClientRect();
                        const elCenter = rect.top + rect.height / 2;
                        const distance = Math.abs(elCenter - containerCenter);

                        if (distance < minDistance) {
                            minDistance = distance;
                            closestId = p.id;
                        }
                    }
                });

                const index = pages.findIndex(p => p.id === closestId);
                if (index !== -1 && headerPageNum !== (index + 1).toString()) {
                    setHeaderPageNum((index + 1).toString());
                }
                ticking = false;
            });
            ticking = true;
        }
    };

    container.addEventListener('scroll', handleScrollUpdate, { passive: true });
    container.addEventListener('touchmove', handleScrollUpdate, { passive: true });
    window.addEventListener('resize', handleScrollUpdate, { passive: true });

    handleScrollUpdate();

    return () => {
        container.removeEventListener('scroll', handleScrollUpdate);
        container.removeEventListener('touchmove', handleScrollUpdate);
        window.removeEventListener('resize', handleScrollUpdate);
    };
  }, [pages, headerPageNum]);

  // 👇 FIX: High-Performance 100% Native Mobile Panning & Zooming (No Hangs) 👇
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    let initialPinchDistance = null;
    let startZoom = 100;

    let startX = 0, startY = 0, scrollLeft = 0, scrollTop = 0;
    let isPanningFlag = false;

    const handleWheel = (e) => {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault(); 
            const zoomDelta = e.deltaY < 0 ? 10 : -10;
            setZoomLevel(Math.min(300, Math.max(30, zoomLevelRef.current + zoomDelta)));
        }
    };

    const handleTouchStart = (e) => {
        if (e.touches.length === 2) {
            isPanningFlag = false;
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            initialPinchDistance = Math.sqrt(dx*dx + dy*dy);
            startZoom = zoomLevelRef.current;
        } else if (e.touches.length === 1 && activeToolRef.current === 'hand') {
            isPanningFlag = true;
            container.style.cursor = 'grabbing';
            startX = e.touches[0].pageX;
            startY = e.touches[0].pageY;
            scrollLeft = container.scrollLeft;
            scrollTop = container.scrollTop;
        }
    };

    const handleTouchMove = (e) => {
        if (e.touches.length === 2 && initialPinchDistance) {
            if (e.cancelable) e.preventDefault(); 
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            const distance = Math.sqrt(dx*dx + dy*dy);
            const ratio = distance / initialPinchDistance;
            setZoomLevel(Math.min(300, Math.max(30, Math.round(startZoom * ratio))));
        } else if (e.touches.length === 1 && isPanningFlag && activeToolRef.current === 'hand') {
            if (e.cancelable) e.preventDefault();
            const x = e.touches[0].pageX;
            const y = e.touches[0].pageY;
            container.scrollLeft = scrollLeft - (x - startX);
            container.scrollTop = scrollTop - (y - startY);
        }
    };

    const handleTouchEnd = (e) => {
        if (e.touches.length < 2) initialPinchDistance = null;
        if (e.touches.length === 0) {
            isPanningFlag = false;
            container.style.cursor = activeToolRef.current === 'hand' ? 'grab' : 'default';
        }
    };

    const onMouseDown = (e) => {
        if (activeToolRef.current !== 'hand') return;
        isPanningFlag = true;
        container.style.cursor = 'grabbing';
        startX = e.pageX;
        startY = e.pageY;
        scrollLeft = container.scrollLeft;
        scrollTop = container.scrollTop;
    };

    const onMouseMove = (e) => {
        if (!isPanningFlag || activeToolRef.current !== 'hand') return;
        if (e.cancelable) e.preventDefault();
        const x = e.pageX;
        const y = e.pageY;
        container.scrollLeft = scrollLeft - (x - startX);
        container.scrollTop = scrollTop - (y - startY);
    };

    const onMouseUp = () => {
        isPanningFlag = false;
        container.style.cursor = activeToolRef.current === 'hand' ? 'grab' : 'default';
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    container.addEventListener('touchstart', handleTouchStart, { passive: false });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);
    
    container.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove, { passive: false });
    window.addEventListener('mouseup', onMouseUp);
    
    return () => {
        container.removeEventListener('wheel', handleWheel);
        container.removeEventListener('touchstart', handleTouchStart);
        window.removeEventListener('touchmove', handleTouchMove);
        window.removeEventListener('touchend', handleTouchEnd);
        
        container.removeEventListener('mousedown', onMouseDown);
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
    };
  }, []); // Using empty array. Re-binds avoided! No More State Freezes.

  const handleZoom = (direction) => {
    setZoomLevel(prev => {
        if (direction === 'in') return Math.min(300, prev + 25);
        if (direction === 'out') return Math.max(30, prev - 25);
        return prev;
    });
  };

  const toggleFitMode = () => {
      const container = scrollContainerRef.current;
      if (!container) return;

      if (isFitWidth) {
          const zoom = Math.floor(((container.clientHeight - 80) / 842) * 100);
          setZoomLevel(Math.max(30, Math.min(300, zoom)));
          setIsFitWidth(false);
      } else {
          const padding = window.innerWidth <= 768 ? 16 : 40;
          const zoom = Math.floor(((container.clientWidth - padding) / 595) * 100);
          setZoomLevel(Math.max(30, Math.min(300, zoom)));
          setIsFitWidth(true);
      }
  };

  const handleFileSelect = async (e) => {
    const files = Array.from(e.target?.files || []);
    if (files.length === 0) return;
    if (showLoader) showLoader("Processing Files...");
    let isFirstFile = pages.length === 0;

    for (const file of files) {
        if (file.type === 'application/pdf') {
            const arrayBuffer = await file.arrayBuffer();
            await processBuffer(arrayBuffer, file.name, isFirstFile);
        } else if (file.type.startsWith('image/')) {
            if (!['image/jpeg', 'image/png', 'image/jpg'].includes(file.type.toLowerCase())) {
                if (showToast) showToast(`Format ${file.type} not supported here. Convert to JPG/PNG.`);
                continue;
            }
            try {
                const arrayBuffer = await file.arrayBuffer();
                const tempPdf = await PDFDocument.create();
                let image;
                if (file.type === 'image/png') image = await tempPdf.embedPng(arrayBuffer);
                else image = await tempPdf.embedJpg(arrayBuffer);
                
                const STANDARD_A4_WIDTH = 595.28;
                const scaleFactor = STANDARD_A4_WIDTH / image.width;
                const scaledWidth = STANDARD_A4_WIDTH;
                const scaledHeight = image.height * scaleFactor;

                const page = tempPdf.addPage([scaledWidth, scaledHeight]);
                page.drawImage(image, { x: 0, y: 0, width: scaledWidth, height: scaledHeight });
                
                const pdfBytes = await tempPdf.save();
                const newBuf = pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteLength + pdfBytes.byteOffset);
                await processBuffer(newBuf, file.name, isFirstFile);
            } catch (err) {
                if (showToast) showToast("Error converting image to PDF.");
            }
        } else {
            setFormatAlert(true);
        }
        isFirstFile = false; 
    }
    e.target.value = ''; 
    if (hideLoader) hideLoader();
  };

  const handleInsertImage = async (e) => {
      const file = e.target.files[0];
      if(!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
          const img = new Image();
          img.onload = () => {
             const targetPage = pages[parseInt(headerPageNum) - 1] || pages[0];
             if(!targetPage) return;
             recordHistory();
             const ratio = img.height / img.width;
             const newEl = { id: Date.now(), type: 'image', src: ev.target.result, x: 20, y: 20, scale: 1, ratio: ratio };
             setPages(prev => prev.map(p => p.id === targetPage.id ? { ...p, elements: [...p.elements, newEl] } : p));
             setActiveContext({ pageId: targetPage.id, elementId: newEl.id, mode: 'select' });
             setRightPanelOpen(false);
             setActiveTool('select');
          };
          img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
      e.target.value = '';
  };

  const processBuffer = async (arrayBuffer, fileName, updateBaseName) => {
      try {
        const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer.slice(0)) });
        const pdf = await loadingTask.promise;
        
        if (updateBaseName) setBaseFileName(fileName.split('.').slice(0, -1).join('.'));

        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 0.25 }); 
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width; canvas.height = viewport.height;
          await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
          
          const newPageObj = { 
              id: `pg_${Date.now()}_${Math.random()}`, 
              sourceBuffer: arrayBuffer, 
              pdfjsDoc: pdf, 
              originalPageNum: i, 
              thumbUrl: canvas.toDataURL('image/jpeg', 0.6), 
              selected: true, elements: [], drawings: [], rotation: 0 
          };
          
          setPages(prev => [...prev, newPageObj]);
          await new Promise(r => setTimeout(r, 15));
        }

        // Auto Fit on Mobile
        if (updateBaseName && window.innerWidth <= 768) {
            const screenWidth = window.innerWidth - 32;
            const targetZoom = Math.floor((screenWidth / 595) * 100);
            setZoomLevel(Math.max(30, Math.min(100, targetZoom)));
        }

      } catch (error) {
        if(showToast) showToast("Error reading file.");
      }
  };

  const addShapeCenter = (type) => {
      const targetPage = pages[parseInt(headerPageNum) - 1] || pages[0];
      if(!targetPage) return;
      recordHistory();
      const newEl = { id: Date.now(), type, x: 45, y: 45, scale: 1, strokeWidth: 4, color: type === 'shape-circle' ? '#2563EB' : (type === 'shape-line' ? '#111827' : '#E0243A') };
      setPages(prev => prev.map(p => p.id === targetPage.id ? { ...p, elements: [...p.elements, newEl] } : p));
      setActiveContext({ pageId: targetPage.id, elementId: newEl.id, mode: 'select' });
      setRightPanelOpen(false);
      setActiveTool(type);
      setShowShapeDropdown(false);
  };

  const duplicatePage = (id) => {
      recordHistory();
      setPages(prev => {
          const idx = prev.findIndex(p => p.id === id);
          if (idx === -1) return prev;
          const p = prev[idx];
          const dup = {
              ...p,
              id: `pg_dup_${Date.now()}_${Math.random()}`,
              elements: p.elements.map(e => ({...e, id: Date.now() + Math.random()})),
              drawings: p.drawings.map(d => ({...d, id: Date.now() + Math.random()}))
          };
          const newArr = [...prev];
          newArr.splice(idx + 1, 0, dup); 
          return newArr;
      });
  };

  const togglePageSelection = (id) => {
      recordHistory();
      setPages(prev => prev.map(p => p.id === id ? { ...p, selected: !p.selected } : p))
  };
  
  const removePageCompletely = (id) => {
      recordHistory();
      setPages(prev => prev.filter(p => p.id !== id))
  };
  
  const rotatePage = (id) => {
      recordHistory();
      setPages(prev => prev.map(p => p.id === id ? { ...p, rotation: (p.rotation + 90) % 360 } : p))
  };
  
  const updateElement = (pageId, elementId, fields) => {
    setPages(prev => prev.map(p => p.id === pageId ? { ...p, elements: p.elements.map(el => el.id === elementId ? { ...el, ...fields } : el) } : p));
  };
  
  const removeElement = (pageId, elementId) => {
    recordHistory();
    setPages(prev => prev.map(p => p.id === pageId ? { ...p, elements: p.elements.filter(el => el.id !== elementId) } : p));
    setActiveContext(null);
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (active && over && active.id !== over.id) {
      recordHistory();
      setPages((items) => {
        const oldIndex = items.findIndex(item => item.id === active.id);
        const newIndex = items.findIndex(item => item.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const scrollToPage = (id) => {
      document.getElementById(`page-${id}`)?.scrollIntoView({ behavior: 'smooth' });
  };

  const scrollToMatch = (match) => {
      if(!match) return;
      setTimeout(() => {
          const matchEl = document.getElementById(match.id);
          if (matchEl) {
              matchEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          } else {
              scrollToPage(match.pageId);
          }
      }, 100);
  };

  useEffect(() => {
      const executeSearch = async () => {
          if (searchText.trim().length < 2) {
              setSearchResults([]);
              return;
          }
          let results = [];
          
          const tempCanvas = document.createElement('canvas');
          const ctx = tempCanvas.getContext('2d');
          ctx.font = `10px sans-serif`; 

          for(let i=0; i<pages.length; i++) {
              const pData = pages[i];
              try {
                  const page = await pData.pdfjsDoc.getPage(pData.originalPageNum);
                  const textContent = await page.getTextContent();
                  const viewport = page.getViewport({ scale: 1, rotation: pData.rotation || 0 });

                  textContent.items.forEach(item => {
                      const text = item.str || '';
                      const searchStr = searchText.toLowerCase();
                      const index = text.toLowerCase().indexOf(searchStr);
                      
                      if(index !== -1) {
                          const fullW = ctx.measureText(text).width || 1;
                          const prefixW = ctx.measureText(text.substring(0, index)).width;
                          const matchW = ctx.measureText(text.substring(index, index + searchStr.length)).width;
                          
                          const prefixRatio = prefixW / fullW;
                          const matchRatio = matchW / fullW;
                          
                          const matchX = item.transform[4] + (item.width * prefixRatio);
                          const matchWidth = item.width * matchRatio;
                          
                          results.push({
                              id: `search_${Date.now()}_${Math.random()}`,
                              pageId: pData.id,
                              x: (matchX / viewport.width) * 100,
                              y: 100 - ((item.transform[5] + item.transform[3]) / viewport.height) * 100,
                              width: (matchWidth / viewport.width) * 100,
                              height: (item.transform[3] / viewport.height) * 100,
                              text: item.str
                          });
                      }
                  });
              } catch(e) {}
          }
          setSearchResults(results);
          if(results.length > 0) {
              setCurrentSearchIndex(0);
              scrollToMatch(results[0]);
          }
      };

      const delayDebounceFn = setTimeout(() => { executeSearch(); }, 600);
      return () => clearTimeout(delayDebounceFn);
  }, [searchText, pages.length]);

  const handleNextSearch = () => {
      if(searchResults.length === 0) return;
      const nextIdx = (currentSearchIndex + 1) % searchResults.length;
      setCurrentSearchIndex(nextIdx);
      scrollToMatch(searchResults[nextIdx]);
  };

  const handlePrevSearch = () => {
      if(searchResults.length === 0) return;
      const prevIdx = currentSearchIndex === 0 ? searchResults.length - 1 : currentSearchIndex - 1;
      setCurrentSearchIndex(prevIdx);
      scrollToMatch(searchResults[prevIdx]);
  };

  const handlePageNavigation = (direction) => {
      let currentIndex = parseInt(headerPageNum) - 1;
      if (direction === 'prev' && currentIndex > 0) currentIndex--;
      if (direction === 'next' && currentIndex < pages.length - 1) currentIndex++;
      setHeaderPageNum((currentIndex + 1).toString());
      scrollToPage(pages[currentIndex].id);
  };

  const handlePageInputJump = (e) => {
      if (e.key === 'Enter' || e.keyCode === 13) {
          const targetIndex = parseInt(headerPageNum) - 1;
          if (targetIndex >= 0 && targetIndex < pages.length) scrollToPage(pages[targetIndex].id);
      }
  };

  const generateExportPdfBlob = async () => {
    const selectedPages = pages.filter(p => p.selected);
    if(selectedPages.length === 0) { 
        if(showToast) showToast("Select at least one page."); 
        return null; 
    }

    const newPdf = await PDFDocument.create(); 
    const loadedDocsMap = new Map(); 
    
    const hexToRgb = (hex) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? { r: parseInt(result[1], 16)/255, g: parseInt(result[2], 16)/255, b: parseInt(result[3], 16)/255 } : { r:0, g:0, b:0 };
    };

    const getBytesFromDataUri = (dataUri) => {
        const base64 = dataUri.split(',')[1];
        const binaryString = window.atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes;
    };

    for (let i = 0; i < selectedPages.length; i++) {
        const pageState = selectedPages[i];
        
        let sourceDoc = loadedDocsMap.get(pageState.sourceBuffer);
        if (!sourceDoc) {
            sourceDoc = await PDFDocument.load(pageState.sourceBuffer);
            loadedDocsMap.set(pageState.sourceBuffer, sourceDoc);
        }

        const [copiedPage] = await newPdf.copyPages(sourceDoc, [pageState.originalPageNum - 1]);
        newPdf.addPage(copiedPage);
        
        if (pageState.rotation > 0) {
            const currentRotation = copiedPage.getRotation().angle;
            copiedPage.setRotation({ angle: currentRotation + pageState.rotation });
        }

        const { width, height } = copiedPage.getSize();
        
        if (pageState.drawings) {
            for (const drawObj of pageState.drawings) {
                if (drawObj.points.length < 2) continue;
                const strokeWidth = drawObj.width * (width / 800); 
                const c = hexToRgb(drawObj.color);
                const drawOpacity = drawObj.type === 'highlight' ? 0.4 : 1;
                
                for (let j = 1; j < drawObj.points.length; j++) {
                    const p1 = drawObj.points[j-1];
                    const p2 = drawObj.points[j];
                    copiedPage.drawLine({
                        start: { x: (p1.x / 100) * width, y: height - (p1.y / 100) * height },
                        end: { x: (p2.x / 100) * width, y: height - (p2.y / 100) * height },
                        thickness: strokeWidth,
                        color: rgb(c.r, c.g, c.b),
                        opacity: drawOpacity
                    });
                }
            }
        }

        for (const el of pageState.elements) {
            if (el.type === 'text') {
                const c = hexToRgb(el.color);
                const scaleRatio = width / 800; 
                const exportedFontSize = (el.fontSize || 16) * scaleRatio;

                let fontType = StandardFonts.Helvetica;
                if (el.fontFamily === 'Times New Roman') fontType = el.isBold ? StandardFonts.TimesRomanBold : (el.isItalic ? StandardFonts.TimesRomanItalic : StandardFonts.TimesRoman);
                else if (el.fontFamily === 'Courier') fontType = el.isBold ? StandardFonts.CourierBold : (el.isItalic ? StandardFonts.CourierOblique : StandardFonts.Courier);
                else fontType = el.isBold ? StandardFonts.HelveticaBold : (el.isItalic ? StandardFonts.HelveticaOblique : StandardFonts.Helvetica);
                
                const font = await newPdf.embedFont(fontType);
                const lines = el.content.split('\n');
                
                let maxLineWidth = 0;
                lines.forEach(l => {
                    const w = font.widthOfTextAtSize(l, exportedFontSize);
                    if (w > maxLineWidth) maxLineWidth = w;
                });

                const boxTopY = height - ((el.y / 100) * height);
                let startY = boxTopY - (4 * scaleRatio) - (exportedFontSize * 0.8);
                const baseX = ((el.x / 100) * width) + (4 * scaleRatio);

                let yPos = startY;
                for(let line of lines) {
                    let lineWidth = font.widthOfTextAtSize(line, exportedFontSize);
                    let xPos = baseX;
                    if (el.textAlign === 'center') xPos = baseX + (maxLineWidth / 2) - (lineWidth / 2);
                    else if (el.textAlign === 'right') xPos = baseX + maxLineWidth - lineWidth;

                    copiedPage.drawText(line, { x: xPos, y: yPos, size: exportedFontSize, font: font, color: rgb(c.r, c.g, c.b) });
                    yPos -= (exportedFontSize * 1.2); 
                }
            } else if (el.type === 'shape-rect') {
                const c = hexToRgb(el.color);
                copiedPage.drawRectangle({ x: ((el.x / 100) * width), y: height - ((el.y / 100) * height) - (100 * el.scale), width: 100 * el.scale, height: 100 * el.scale, borderColor: rgb(c.r, c.g, c.b), borderWidth: el.strokeWidth || 4 });
            } else if (el.type === 'shape-circle') {
                const c = hexToRgb(el.color);
                copiedPage.drawEllipse({ x: ((el.x / 100) * width) + (50 * el.scale), y: height - ((el.y / 100) * height) - (50 * el.scale), xScale: 50 * el.scale, yScale: 50 * el.scale, borderColor: rgb(c.r, c.g, c.b), borderWidth: el.strokeWidth || 4 });
            } else if (el.type === 'shape-line') {
                const c = hexToRgb(el.color);
                copiedPage.drawLine({ start: { x: ((el.x / 100) * width), y: height - ((el.y / 100) * height) }, end: { x: ((el.x / 100) * width) + (100 * el.scale), y: height - ((el.y / 100) * height) }, thickness: el.strokeWidth || 4, color: rgb(c.r, c.g, c.b) });
            } else if (el.type === 'shape-whiteout') {
                copiedPage.drawRectangle({ x: ((el.x / 100) * width), y: height - ((el.y / 100) * height) - (100 * el.scale), width: 100 * el.scale, height: 100 * el.scale, color: rgb(1, 1, 1), borderWidth: 0 });
            } else if (el.type === 'signature' || el.type === 'image') {
                let imgToEmbed;
                const mimeType = el.src.split(';')[0].split(':')[1];
                const imgBytes = getBytesFromDataUri(el.src);
                
                if(mimeType === 'image/png') imgToEmbed = await newPdf.embedPng(imgBytes);
                else imgToEmbed = await newPdf.embedJpg(imgBytes);
                
                const dims = imgToEmbed.scale(1);
                let renderWidth = 150 * el.scale; 
                let renderHeight = renderWidth * (el.type==='image' ? el.ratio : (dims.height / dims.width));
                copiedPage.drawImage(imgToEmbed, { x: ((el.x / 100) * width), y: height - ((el.y / 100) * height) - renderHeight, width: renderWidth, height: renderHeight });
            }
        }
    }

    const pdfBytesSaved = await newPdf.save();
    return new Blob([pdfBytesSaved], { type: 'application/pdf' });
  };

  const exportEditedPDF = async () => {
    if (showLoader) showLoader("Building PDF...");
    try {
        const blob = await generateExportPdfBlob();
        if (!blob) {
            if (hideLoader) hideLoader();
            return;
        }

        trackUserAction('Export', 'PDF_Modifier', 'PDF');

        const link = document.createElement('a');
        link.download = `foreverscan_${baseFileName}_modified.pdf`;
        link.href = URL.createObjectURL(blob);
        link.click();
        
        if(triggerFeedback) triggerFeedback();
    } catch (e) {
        if(showToast) showToast("Error exporting PDF.");
    }
    if (hideLoader) hideLoader();
  };

  const printEditedPDF = async () => {
    if (showLoader) showLoader("Preparing Print...");
    try {
        const blob = await generateExportPdfBlob();
        if (!blob) {
            if (hideLoader) hideLoader();
            return;
        }

        trackUserAction('Print', 'PDF_Modifier', 'Print_Out');

        const blobUrl = URL.createObjectURL(blob);
        const printFrame = document.createElement('iframe');
        printFrame.style.position = 'fixed';
        printFrame.style.right = '0';
        printFrame.style.bottom = '0';
        printFrame.style.width = '0';
        printFrame.style.height = '0';
        printFrame.style.border = '0';
        printFrame.src = blobUrl;

        printFrame.onload = () => {
            printFrame.contentWindow.focus();
            printFrame.contentWindow.print();
            if(triggerFeedback) triggerFeedback();
        };

        document.body.appendChild(printFrame);
    } catch (e) {
        if (showToast) showToast("Error preparing print.");
    }
    if (hideLoader) hideLoader();
  };

  const activeElementData = activeContext ? pages.find(p => p.id === activeContext.pageId)?.elements.find(e => e.id === activeContext.elementId) : null;

  return (
    <div className="pdf-modifier-layout">
      <style>{`
        :root { --ui-bg: #FFFFFF; --canvas-bg: #F9FAFB; --border: #E5E7EB; --accent: #E0243A; --text-main: #111827; --text-muted: #6B7280; }
        .pdf-modifier-layout { display: flex; flex-direction: column; height: 100%; min-height: 80vh; width: 100%; background: var(--canvas-bg); font-family: 'Inter', sans-serif; overflow: hidden; }
        
        .top-navbar { min-height: 60px; background: var(--ui-bg); border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; padding: 8px 16px; z-index: 100; flex-wrap: wrap; }
        .top-nav-group { display: flex; align-items: center; gap: 8px; }
        .nav-btn { height: 36px; background: transparent; border: 1px solid var(--border); padding: 0 12px; border-radius: 6px; cursor: pointer; color: var(--text-main); font-weight: 600; font-size: 0.85rem; display: flex; align-items: center; justify-content: center; gap: 6px; transition: 0.2s; box-sizing: border-box; }
        .nav-btn:hover { background: #F3F4F6; }
        .nav-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        
        .ribbon-tools { display: flex; align-items: center; gap: 4px; background: #F9FAFB; padding: 4px 8px; border-radius: 8px; border: 1px solid var(--border); margin: 0 16px; flex-wrap: wrap; justify-content: center; overflow: visible; }
        .ribbon-btn { flex-shrink: 0; display: flex; align-items: center; justify-content: center; padding: 8px; border-radius: 6px; border: none; background: transparent; color: var(--text-muted); cursor: pointer; transition: 0.2s; white-space: nowrap; }
        .ribbon-btn:hover:not(:disabled) { background: #E5E7EB; color: var(--text-main); }
        .ribbon-btn.active { background: #FEE2E2; color: var(--accent); }
        .ribbon-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .ribbon-divider { flex-shrink: 0; width: 1px; height: 20px; background: var(--border); margin: 0 4px; }

        .shape-dropdown-item {
            display: flex; align-items: center; justify-content: flex-start; width: 100%;
            padding: 8px 12px; border-radius: 6px; border: none; background: transparent;
            color: var(--text-main); cursor: pointer; transition: all 0.15s ease;
            font-size: 0.85rem; font-weight: 600; gap: 10px;
        }
        .shape-dropdown-item:hover {
            background-color: #F9FAFB;
            color: var(--accent);
        }
        .shape-dropdown-item svg { flex-shrink: 0; }

        .mobile-actions { display: none !important; }
        .desktop-right-group { display: flex !important; }
        .mobile-search-row { display: none; }

        .workspace-container { display: flex; flex: 1; height: calc(100vh - 60px); overflow: hidden; position: relative; }
        
        .left-sidebar { width: 240px; background: #F9FAFB; border-right: 1px solid var(--border); display: flex; flex-direction: column; z-index: 80; flex-shrink: 0; transition: margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1), transform 0.3s cubic-bezier(0.4, 0, 0.2, 1); margin-left: 0; }
        .left-sidebar.closed { margin-left: -240px; }

        .mobile-backdrop { display: none; position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 190; transition: opacity 0.3s; opacity: 0; pointer-events: none; }

        .sidebar-thumb-card { border: 1px solid var(--border); border-radius: 8px; overflow: hidden; position: relative; background: #FFF; transition: 0.2s; }
        .sidebar-thumb-card.unchecked { opacity: 0.5; filter: grayscale(100%); }
        .thumb-header-top { position: absolute; top: 8px; left: 8px; right: 8px; display: flex; justify-content: space-between; align-items: center; z-index: 10;}
        .thumb-number { color: #111827; font-size: 0.75rem; font-weight: 800; background: rgba(255,255,255,0.8); padding: 2px 6px; border-radius: 12px; }
        .thumb-checkbox { cursor: pointer; background: #FFF; border-radius: 4px; display: flex;}
        .thumb-bottom-actions { position: absolute; bottom: 20px; left: 0; right: 0; display: flex; justify-content: center; gap: 12px; background: #FFF; border-top: 1px solid var(--border); padding: 8px 0; z-index: 10; box-shadow: 0 -2px 10px rgba(0,0,0,0.05); }
        .thumb-bottom-actions button { background: transparent; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: 0.2s;}
        .thumb-bottom-actions button:hover { transform: scale(1.1); }
        .thumb-drag-handle { background: #F3F4F6; display: flex; justify-content: center; padding: 4px 0; border-top: 1px solid var(--border); cursor: grab; }
        
        .main-canvas-area { flex: 1; position: relative; overflow: auto; scroll-behavior: smooth; outline: none; touch-action: pan-x pan-y; }
        .main-canvas-area.panning { touch-action: none; }
        .canvas-spacer { display: table; margin: 0 auto; padding: 32px 16px 150px 16px; }
        .pdf-page-shadow { display: block; background: #FFF; box-shadow: 0 4px 20px rgba(0,0,0,0.08); margin: 0 auto 24px auto; position: relative; transition: opacity 0.3s; text-align: left; }
        
        .right-panel { 
            width: 280px; 
            background: var(--ui-bg); 
            border-left: 1px solid var(--border); 
            display: flex; 
            flex-direction: column; 
            z-index: 90; 
            flex-shrink: 0; 
            transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), margin-right 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.4s ease; 
            margin-right: 0;
            opacity: 1;
            visibility: visible;
        }
        .right-panel.closed { 
            margin-right: -280px; 
            transform: translateX(100%);
            opacity: 0;
            visibility: hidden;
            pointer-events: none;
        }

        .rp-header { padding: 16px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; }
        .rp-title { font-size: 1rem; font-weight: 700; color: var(--text-main); margin: 0;}
        .rp-content { padding: 16px; flex: 1; overflow-y: auto; }
        
        .rp-box { background: #F9FAFB; border: 1px solid var(--border); border-radius: 8px; padding: 12px; margin-bottom: 16px; }
        .rp-box-title { font-size: 0.75rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-bottom: 12px; display: block; letter-spacing: 0.5px; }
        
        .rp-row { display: flex; gap: 8px; margin-bottom: 12px; }
        .rp-row:last-child { margin-bottom: 0; }
        .rp-select { flex: 1; padding: 8px; border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem; outline: none; color: var(--text-main); background: #FFF;}
        .rp-input { width: 60px; padding: 8px; border: 1px solid var(--border); border-radius: 6px; font-size: 0.85rem; outline: none; text-align: center; }
        .rp-btn { flex: 1; display: flex; justify-content: center; align-items: center; padding: 8px; background: #FFF; border: 1px solid var(--border); border-radius: 6px; cursor: pointer; color: var(--text-muted); transition: 0.2s;}
        .rp-btn:hover { background: #F3F4F6; color: var(--text-main); }
        .rp-btn.active { background: #FEE2E2; color: var(--accent); border-color: var(--accent); }
        .color-circle { width: 32px; height: 32px; border-radius: 50%; cursor: pointer; border: 2px solid transparent; transition: 0.2s; }
        .color-circle:hover { transform: scale(1.1); }
        
        .save-changes-btn { width: 100%; padding: 12px; background: var(--accent); color: #FFF; border: none; border-radius: 8px; font-size: 0.9rem; font-weight: 700; cursor: pointer; box-shadow: 0 4px 12px rgba(224,36,58,0.2); transition: 0.2s; margin-top: 8px;}
        .save-changes-btn:hover { background: #B91C2D; transform: translateY(-2px); }

        .download-btn { height: 36px; padding: 0 16px; display: flex; align-items: center; justify-content: center; gap: 6px; background: var(--accent); color: #FFF; border: none; border-radius: 6px; font-weight: 600; font-size: 0.85rem; cursor: pointer; box-shadow: 0 2px 8px rgba(224,36,58,0.2); transition: 0.2s; box-sizing: border-box; }
        .download-btn:hover { background: #B91C2D; }

        .bottom-nav-pill { position: absolute; bottom: 32px; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 4px; background: var(--ui-bg); padding: 6px 12px; border-radius: 30px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); border: 1px solid var(--border); z-index: 100; color: var(--text-main); }
        
        .bottom-nav-pill .pill-btn { width: 32px !important; height: 32px !important; min-width: 32px !important; min-height: 32px !important; flex: 0 0 32px !important; box-sizing: border-box !important; background: transparent; border: none; color: var(--text-muted); cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0 !important; border-radius: 50% !important; transition: 0.2s; }
        .bottom-nav-pill .pill-btn:hover:not(:disabled) { background: #F3F4F6; color: var(--text-main); }
        .bottom-nav-pill .pill-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        
        .pill-divider { width: 1px; height: 16px; background: var(--border); margin: 0 6px; }
        
        .page-input-box { width: 44px; height: 36px; text-align: center; background: #F9FAFB; border: 1px solid var(--border); color: var(--text-main); border-radius: 6px; padding: 0 4px; font-weight: 700; outline: none; }
        
        .element-wrapper { position: absolute; cursor: pointer; z-index: 50; }
        .element-wrapper.active { z-index: 60; }
        .element-wrapper.active::after { content: ''; position: absolute; top: -2px; left: -2px; right: -2px; bottom: -2px; border: 1.5px dashed #2563EB; pointer-events: none; }
        
        .resize-dot { position: absolute; width: 12px; height: 12px; background: #2563EB; border-radius: 50%; z-index: 65; pointer-events: auto; cursor: ns-resize; }
        .resize-dot.nw { top: -6px; left: -6px; } .resize-dot.n { top: -6px; left: calc(50% - 6px); } .resize-dot.ne { top: -6px; right: -6px; }
        .resize-dot.w { top: calc(50% - 6px); left: -6px; } .resize-dot.e { top: calc(50% - 6px); right: -6px; }
        .resize-dot.sw { bottom: -6px; left: -6px; } .resize-dot.s { bottom: -6px; left: calc(50% - 6px); } .resize-dot.se { bottom: -6px; right: -6px; }

        .element-text-display { padding: 4px; white-space: pre-wrap; word-break: break-word; min-width: 50px; min-height: 20px;}
        .element-textarea { background: transparent; border: none; outline: none; line-height: 1.2; width: 100%; min-width: 100px; resize: both; overflow: hidden; padding: 4px;}
        .element-textarea::placeholder { color: rgba(17, 24, 39, 0.3); }

        .floating-actions { position: absolute; bottom: -45px; left: 50%; transform: translateX(-50%); background: #FFF; border: 1px solid var(--border); box-shadow: 0 4px 12px rgba(0,0,0,0.1); border-radius: 8px; display: flex; align-items: center; padding: 4px; gap: 4px; z-index: 70; }
        .action-btn { background: transparent; border: none; cursor: pointer; color: var(--text-muted); display: flex; align-items: center; justify-content: center; padding: 6px; border-radius: 6px; transition: 0.2s;}
        .action-btn:hover { background: #F3F4F6; color: var(--text-main); }
        .action-divider { width: 1px; height: 16px; background: var(--border); margin: 0 4px; }
        
        .search-container { display: flex; align-items: center; background: #FFF; border: 1px solid var(--border); border-radius: 6px; overflow: hidden; height: 36px; width: 240px; flex-shrink: 0; transition: border-color 0.2s; margin-right: 12px; }
        .search-container:focus-within { border-color: var(--accent); box-shadow: 0 0 0 2px rgba(224, 36, 58, 0.1); }
        .search-input { flex: 1; padding: 0 8px 0 0; border: none; background: transparent; outline: none; font-size: 0.85rem; color: var(--text-main); width: 100px; }
        .search-controls { display: flex; align-items: center; border-left: 1px solid var(--border); height: 100%; opacity: 0.3; pointer-events: none; transition: 0.2s; background: #F9FAFB; padding: 0 6px; }
        .search-controls.active { opacity: 1; pointer-events: auto; }
        .search-count { font-size: 0.8rem; font-weight: 500; color: var(--text-muted); white-space: nowrap; width: 50px; text-align: center; font-family: monospace; }
        .search-nav-btns { display: flex; align-items: center; gap: 2px; }
        .s-btn { background: transparent; border: none; cursor: pointer; padding: 4px; display: flex; align-items: center; justify-content: center; border-radius: 4px; color: var(--text-main); transition: 0.2s;}
        .s-btn:hover { background: #E5E7EB; }
        .s-btn:disabled { opacity: 0.3; cursor: not-allowed; }

        @media (max-width: 1024px) {
            .desktop-right-group { display: none !important; }
            .mobile-actions { display: flex !important; }
        }

        @media (max-width: 768px) {
            .mobile-hide { display: none !important; }
            .mobile-show { display: flex !important; }
            
            .top-navbar { flex-direction: column; align-items: stretch; gap: 8px; padding: 8px 12px; border-bottom: none; }
            
            /* 👇 FIX 1 & 2: Mobile Layout buttons Wrapping and Alignment 👇 */
            .mobile-top-row { display: flex; flex-wrap: nowrap; justify-content: flex-start !important; width: 100%; overflow-x: auto; padding-bottom: 4px; }
            .mobile-actions { width: 100%; justify-content: space-between; margin-top: 4px; display: flex !important; gap: 8px; }
            .mobile-actions .nav-btn, .mobile-actions .download-btn { flex: 1; padding: 10px 0; font-size: 0.9rem; justify-content: center; }
            
            .ribbon-tools { width: max-content; max-width: 100%; margin: 0 auto; justify-content: flex-start; padding: 4px; border: none; background: transparent; overflow: visible; }
            
            .mobile-search-row { display: block; padding: 0 12px 8px 12px; background: var(--ui-bg); border-bottom: 1px solid var(--border); }
            
            .left-sidebar { position: absolute; top: 0; bottom: 0; z-index: 200; transform: translateX(-100%); margin-left: 0; transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
            .left-sidebar.open { transform: translateX(0); }
            .mobile-backdrop.open { display: block; opacity: 1; pointer-events: auto; }
            
            .right-panel { 
                position: fixed; 
                bottom: 0; 
                left: 0; 
                width: 100%; 
                height: auto; 
                max-height: 50vh; 
                border-top-left-radius: 16px; 
                border-top-right-radius: 16px; 
                box-shadow: 0 -4px 20px rgba(0,0,0,0.15); 
                z-index: 300; 
                transform: translateY(100%); 
                margin-right: 0;
                transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.4s ease, visibility 0.4s;
                opacity: 0;
                visibility: hidden;
            }
            .right-panel:not(.closed) { 
                transform: translateY(0); 
                opacity: 1;
                visibility: visible;
                display: flex; 
            }
            .right-panel.closed {
                transform: translateY(100%);
                opacity: 0;
                visibility: hidden;
                display: flex;
            }
            
            .resize-dot { width: 24px; height: 24px; }
            .resize-dot.nw { top: -12px; left: -12px; } .resize-dot.n { top: -12px; left: calc(50% - 12px); } .resize-dot.ne { top: -12px; right: -12px; }
            .resize-dot.w { top: calc(50% - 12px); left: -12px; } .resize-dot.e { top: calc(50% - 12px); right: -12px; }
            .resize-dot.sw { bottom: -12px; left: -12px; } .resize-dot.s { bottom: -12px; left: calc(50% - 12px); } .resize-dot.se { bottom: -12px; right: -12px; }
            
            /* 👇 FIX 3: Scrollable Mobile Navigation Pill for missing fit/zoom buttons 👇 */
            .bottom-nav-pill { 
                flex-wrap: nowrap !important; 
                overflow-x: auto; 
                -webkit-overflow-scrolling: touch; 
                justify-content: flex-start;
                padding: 6px 12px; 
                width: max-content; 
                max-width: 95vw; 
                border-radius: 20px;
            }
            .bottom-nav-pill::-webkit-scrollbar { display: none; }
            .bottom-nav-pill .pill-btn { width: 30px !important; height: 30px !important; min-width: 30px !important; }
            .page-input-box { width: 34px; height: 26px; }
        }

        @media (max-width: 400px) {
            .mobile-top-row .nav-btn { font-size: 0.75rem; padding: 0 8px; }
            .mobile-actions .nav-btn, .mobile-actions .download-btn { font-size: 0.85rem; padding: 8px 0; }
            .ribbon-btn { padding: 6px; }
            .bottom-nav-pill .pill-btn { width: 28px !important; height: 28px !important; min-width: 28px !important; }
        }
      `}</style>

      {formatAlert && (
        <div className="modal-overlay" style={{ zIndex: 99999 }}>
          <div className="modal-content" style={{ maxWidth: '400px', padding: '2.5rem 2rem', background: 'var(--ui-bg)', textAlign: 'center', borderRadius: '16px' }}>
             <AlertTriangle size={48} color="var(--accent)" style={{ margin: '0 auto 1.2rem' }} />
            <h3 style={{ marginBottom: '1rem', color: 'var(--text-main)', fontSize: '1.25rem', fontWeight: '800' }}>Invalid Format</h3>
            <p style={{ marginBottom: '2rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>Please upload a valid PDF or Image file.</p>
            <button className="btn btn-primary" onClick={() => setFormatAlert(false)}>Okay</button>
          </div>
        </div>
      )}

      {showResetModal && (
          <ResetConfirmModal 
              onClose={() => setShowResetModal(false)} 
              onConfirm={() => {
                  if (typeof recordHistory === 'function') recordHistory();
                  setPages(prevPages => prevPages.map(page => ({
                      ...page,
                      elements: [],
                      drawings: [],
                      rotation: 0
                  })));
                  setActiveContext(null);
              }} 
          />
      )}

      {showWelcomeModal && (
          <WelcomeModal onClose={() => setShowWelcomeModal(false)} />
      )}

      {showSigModal && <SignatureModal onClose={() => setShowSigModal(false)} showToast={showToast} onSave={(sigData) => { 
          setShowSigModal(false); 
          if (activeContext && pages.find(p => p.id === activeContext.pageId)?.elements.find(e => e.id === activeContext.elementId)?.type === 'signature') {
              recordHistory();
              updateElement(activeContext.pageId, activeContext.elementId, { src: sigData.src, content: sigData.content, fontType: sigData.fontType });
          } else {
              setPendingSignature(sigData); setActiveTool('place-signature'); 
          }
      }} />}

      {pages.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div onClick={() => document.getElementById('pdf-upload').click()} style={{ maxWidth: '400px', width: '90%', padding: '3.5rem 1.5rem', border: '2px dashed var(--border)', borderRadius: '16px', background: 'var(--ui-bg)', textAlign: 'center', cursor: 'pointer', boxShadow: '0 4px 20px rgba(0,0,0,0.02)' }}>
            <FileUp size={44} color="var(--accent)" style={{ margin: '0 auto 1.2rem auto' }} />
            <h3 style={{ color: 'var(--text-main)', marginBottom: '8px', fontSize: '1.2rem', fontWeight: '700' }}>Open PDF File</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>100% Secure. Local browser processing.</p>
            <input type="file" id="pdf-upload" hidden multiple accept="application/pdf, image/*" onChange={handleFileSelect} />
          </div>
        </div>
      ) : (
        <>
          <header className="top-navbar">
            <div className="top-nav-group mobile-top-row">
              <button className="nav-btn" onClick={() => setPages([])} title="Back">
                 <ArrowLeft size={16}/> <span className="mobile-hide">Back</span>
              </button>
              <button className="nav-btn" onClick={() => setSidebarOpen(!sidebarOpen)} title="Toggle Pages">
                 <PanelLeft size={16}/> <span className="mobile-hide">Pages</span>
              </button>
              <button className="nav-btn" onClick={() => setShowResetModal(true)} title="Reset All">
                 <RotateCcw size={16}/> <span>Reset</span>
              </button>
            </div>
            
            <div className="mobile-actions">
              <button className="nav-btn" onClick={printEditedPDF} title="Print">
                <Printer size={16}/> <span>Print</span>
              </button>
              <button className="download-btn" onClick={exportEditedPDF}>
                <Download size={16}/> <span>Download</span>
              </button>
            </div>
            
            <div className="ribbon-tools">
                <button className={`ribbon-btn ${activeTool === 'select' ? 'active' : ''}`} onClick={() => setActiveTool('select')} title="Select"><MousePointer2 size={16}/></button>
                <button className={`ribbon-btn ${activeTool === 'hand' ? 'active' : ''}`} onClick={() => setActiveTool('hand')} title="Pan"><Hand size={16}/></button>
                <div className="ribbon-divider"/>
                <button className={`ribbon-btn ${activeTool === 'text' ? 'active' : ''}`} onClick={() => setActiveTool('text')} title="Add Text"><Type size={16}/></button>
                <button className="ribbon-btn" onClick={() => document.getElementById('insert-image-upload').click()} title="Add Image"><ImageIcon size={16}/></button>
                <input type="file" id="insert-image-upload" hidden accept="image/*" onChange={handleInsertImage} />
                <button className={`ribbon-btn ${activeTool === 'draw' ? 'active' : ''}`} onClick={() => setActiveTool('draw')} title="Draw"><SquarePen size={16}/></button>
                <button className={`ribbon-btn ${activeTool === 'highlight' ? 'active' : ''}`} onClick={() => setActiveTool('highlight')} title="Highlight"><Highlighter size={16}/></button>
                <button className={`ribbon-btn ${activeTool === 'eraser' ? 'active' : ''}`} onClick={() => setActiveTool('eraser')} title="Eraser"><Eraser size={16}/></button>
                <div className="ribbon-divider"/>
                
                <>
                    {showShapeDropdown && (
                        <div 
                            style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9998 }} 
                            onClick={(e) => { e.stopPropagation(); setShowShapeDropdown(false); }}
                            onTouchStart={(e) => { e.stopPropagation(); setShowShapeDropdown(false); }}
                        />
                    )}

                    <div 
                        style={{ position: 'relative', display: 'flex', alignItems: 'center', zIndex: showShapeDropdown ? 9999 : 'auto' }} 
                        onMouseEnter={() => setShowShapeDropdown(true)} 
                        onMouseLeave={() => setShowShapeDropdown(false)}
                    >
                        <button className={`ribbon-btn ${activeTool.startsWith('shape') ? 'active' : ''}`} onClick={() => addShapeCenter(activeTool.startsWith('shape') ? activeTool : 'shape-rect')} title="Add Shape">
                            {activeTool === 'shape-circle' ? <Circle size={16}/> : (activeTool === 'shape-line' ? <Minus size={16}/> : (activeTool === 'shape-whiteout' ? <WhiteoutIcon size={16}/> : <RectIcon size={16}/>))}
                        </button>
                        <button className="ribbon-btn" style={{padding: '8px 4px'}} onClick={(e) => { e.stopPropagation(); setShowShapeDropdown(!showShapeDropdown); }}>
                            <ChevronDown size={12}/>
                        </button>

                        {showShapeDropdown && (
                            <div style={{ position: 'absolute', top: '100%', right: 0, paddingTop: '4px', minWidth: '160px' }}>
                                <div style={{ background: '#FFF', border: '1px solid var(--border)', borderRadius: '8px', padding: '6px', display: 'flex', flexDirection: 'column', gap: '2px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}>
                                    <button className="shape-dropdown-item" onClick={() => { addShapeCenter('shape-rect'); setShowShapeDropdown(false); }}><RectIcon size={16}/> <span>Rectangle</span></button>
                                    <button className="shape-dropdown-item" onClick={() => { addShapeCenter('shape-circle'); setShowShapeDropdown(false); }}><Circle size={16}/> <span>Circle</span></button>
                                    <button className="shape-dropdown-item" onClick={() => { addShapeCenter('shape-line'); setShowShapeDropdown(false); }}><Minus size={16}/> <span>Line</span></button>
                                    <div style={{width: '100%', height: '1px', background: 'var(--border)', margin: '4px 0'}}></div>
                                    <button className="shape-dropdown-item" onClick={() => { addShapeCenter('shape-whiteout'); setShowShapeDropdown(false); }}><WhiteoutIcon size={16}/> <span>Whiteout</span></button>
                                </div>
                            </div>
                        )}
                    </div>
                </>

                <div className="ribbon-divider"/>
                <button className={`ribbon-btn ${activeTool === 'place-signature' ? 'active' : ''}`} onClick={() => setShowSigModal(true)} title="Add Signature"><PenLine size={16}/></button>
            </div>

            <div className="top-nav-group desktop-right-group">
              <SearchBarComponent searchText={searchText} setSearchText={setSearchText} searchResults={searchResults} currentSearchIndex={currentSearchIndex} handlePrevSearch={handlePrevSearch} handleNextSearch={handleNextSearch} />

              <button className="nav-btn" onClick={printEditedPDF} title="Print PDF">
                <Printer size={16}/> <span className="mobile-hide">Print</span>
              </button>

              <button className="download-btn desktop-download" onClick={exportEditedPDF}>
                <Download size={16}/> <span>Download PDF</span>
              </button>
            </div>
          </header>

          <div className="mobile-search-row">
             <SearchBarComponent searchText={searchText} setSearchText={setSearchText} searchResults={searchResults} currentSearchIndex={currentSearchIndex} handlePrevSearch={handlePrevSearch} handleNextSearch={handleNextSearch} style={{ width: '100%', margin: 0 }} />
          </div>

          <div className="workspace-container">
            <div className={`mobile-backdrop ${sidebarOpen ? 'open' : ''}`} onClick={() => setSidebarOpen(false)} />
            
            <aside className={`left-sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px', letterSpacing: '0.5px' }}>File Name</div>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)', wordBreak: 'break-all' }}>{baseFileName}.pdf</div>
              </div>
              
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', padding: '12px 16px 4px 16px', fontWeight: 600 }}>PREVIEW</div>
              <div style={{ flex: 1, padding: '0 16px 16px 16px', overflowY: 'auto' }}>
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={pages.map(p => p.id)} strategy={verticalListSortingStrategy}>
                        {pages.map((page, index) => (
                            <SidebarThumbnail key={page.id} page={page} index={index} onToggleSelect={togglePageSelection} onDelete={removePageCompletely} onRotate={rotatePage} onDuplicate={duplicatePage} scrollToPage={scrollToPage} />
                        ))}
                    </SortableContext>
                </DndContext>
                
                <div onClick={() => document.getElementById('add-more-pdf').click()} style={{ padding: '24px 16px', border: '1px dashed var(--border)', borderRadius: '8px', textAlign: 'center', cursor: 'pointer', marginTop: '8px', background: '#FFF' }}>
                    <PlusCircle size={20} color="var(--accent)" style={{ margin: '0 auto 8px auto' }} />
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Add PDF/Image</div>
                    <input type="file" id="add-more-pdf" hidden multiple accept="application/pdf, image/*" onChange={handleFileSelect} />
                </div>
              </div>
            </aside>

            <div className="main-canvas-area" ref={scrollContainerRef} tabIndex="0"
                 onMouseDown={(e) => {
                     if (e.target.tagName === 'CANVAS') {
                         setActiveContext(null);
                         setRightPanelOpen(false);
                     }
                 }}
            >
              <div className="canvas-spacer">
                  {pages.map(pageData => (
                      <PdfPage key={pageData.id} pdfDoc={pageData.pdfjsDoc} pageData={pageData} zoomLevel={zoomLevel} updateElement={updateElement} removeElement={removeElement} activeTool={activeTool} setActiveTool={setActiveTool} setPages={setPages} activeContext={activeContext} setActiveContext={setActiveContext} pendingSignature={pendingSignature} setPendingSignature={setPendingSignature} setRightPanelOpen={setRightPanelOpen} searchResults={searchResults} currentSearchIndex={currentSearchIndex} recordHistory={recordHistory} />
                  ))}
              </div>
            </div>

            <div className="bottom-nav-pill" onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}>
              <button className="pill-btn" onClick={undo} disabled={past.length === 0} title="Undo (Ctrl+Z)"><Undo size={16}/></button>
              <button className="pill-btn" onClick={redo} disabled={future.length === 0} title="Redo (Ctrl+Y)"><Redo size={16}/></button>
              
              <div className="pill-divider" />
              
              <button className="pill-btn" onClick={() => handlePageNavigation('prev')}><ChevronLeft size={16}/></button>
              <div style={{display: 'flex', alignItems: 'center', gap: '4px', margin: '0 2px'}}>
                  <span className="mobile-hide" style={{ fontSize: '0.8rem', display: 'none' }}>Page</span>
                  <input type="number" className="page-input-box" value={headerPageNum} onChange={(e) => setHeaderPageNum(e.target.value)} onKeyDown={handlePageInputJump} />
                  <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>/ {pages.length}</span>
              </div>
              <button className="pill-btn" onClick={() => handlePageNavigation('next')}><ChevronRight size={16}/></button>
              
              <div className="pill-divider" />
              
              <button className="pill-btn" onClick={() => handleZoom('out')}><Minus size={14}/></button>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, minWidth: '32px', textAlign: 'center' }}>{zoomLevel}%</span>
              <button className="pill-btn" onClick={() => handleZoom('in')}><Plus size={14}/></button>
              
              <div className="pill-divider" />
              
              <button className="pill-btn" onClick={toggleFitMode} title={isFitWidth ? "Fit to Height" : "Fit to Width"}>
                  {isFitWidth ? <Minimize size={14}/> : <Maximize size={14}/>}
              </button>
            </div>

            <aside className={`right-panel ${rightPanelOpen && activeContext ? '' : 'closed'}`} onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}>
              <div className="rp-header">
                  <h2 className="rp-title">Settings</h2>
                  <X size={18} color="var(--text-muted)" style={{ cursor: 'pointer' }} onClick={() => setRightPanelOpen(false)} />
              </div>
              
              <div className="rp-content">
                  {activeElementData ? (
                      <>
                          {activeElementData.type === 'text' && (
                              <>
                                  <div className="rp-box">
                                      <span className="rp-box-title">Text Styles</span>
                                      <div className="rp-row">
                                          <select className="rp-select" value={activeElementData.fontFamily || 'Arial'} onFocus={recordHistory} onChange={(e) => updateElement(activeContext.pageId, activeContext.elementId, { fontFamily: e.target.value })}>
                                              <option value="Arial">Arial</option>
                                              <option value="Times New Roman">Times Roman</option>
                                              <option value="Courier">Courier</option>
                                          </select>
                                          <input type="number" className="rp-input" value={activeElementData.fontSize || 16} onFocus={recordHistory} onChange={(e) => updateElement(activeContext.pageId, activeContext.elementId, { fontSize: Number(e.target.value) })} />
                                      </div>
                                  </div>
                                  
                                  <div className="rp-box">
                                      <span className="rp-box-title">Typography</span>
                                      <div className="rp-row">
                                          <button className={`rp-btn ${activeElementData.isBold ? 'active' : ''}`} onClick={() => { recordHistory(); updateElement(activeContext.pageId, activeContext.elementId, { isBold: !activeElementData.isBold })}}><Bold size={16}/></button>
                                          <button className={`rp-btn ${activeElementData.isItalic ? 'active' : ''}`} onClick={() => { recordHistory(); updateElement(activeContext.pageId, activeContext.elementId, { isItalic: !activeElementData.isItalic })}}><Italic size={16}/></button>
                                          <button className={`rp-btn ${activeElementData.isUnderline ? 'active' : ''}`} onClick={() => { recordHistory(); updateElement(activeContext.pageId, activeContext.elementId, { isUnderline: !activeElementData.isUnderline })}}><Underline size={16}/></button>
                                      </div>
                                      <div className="rp-row">
                                          <button className={`rp-btn ${activeElementData.textAlign === 'left' ? 'active' : ''}`} onClick={() => { recordHistory(); updateElement(activeContext.pageId, activeContext.elementId, { textAlign: 'left' })}}><AlignLeft size={16}/></button>
                                          <button className={`rp-btn ${activeElementData.textAlign === 'center' ? 'active' : ''}`} onClick={() => { recordHistory(); updateElement(activeContext.pageId, activeContext.elementId, { textAlign: 'center' })}}><AlignCenter size={16}/></button>
                                          <button className={`rp-btn ${activeElementData.textAlign === 'right' ? 'active' : ''}`} onClick={() => { recordHistory(); updateElement(activeContext.pageId, activeContext.elementId, { textAlign: 'right' })}}><AlignRight size={16}/></button>
                                      </div>
                                  </div>

                                  <div className="rp-box">
                                      <span className="rp-box-title">Color</span>
                                      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                          {['#111827', '#E0243A', '#2563EB', '#16A34A', '#D97706', '#9333EA', '#4B5563', '#FFFFFF'].map(c => (
                                              <div key={c} onClick={() => { recordHistory(); updateElement(activeContext.pageId, activeContext.elementId, { color: c })}}
                                                  className="color-circle" style={{ background: c, borderColor: activeElementData.color === c ? '#2563EB' : (c==='#FFFFFF' ? '#E5E7EB' : 'transparent'), boxShadow: activeElementData.color === c ? '0 0 0 2px #FFF inset' : 'none' }} />
                                          ))}
                                      </div>
                                  </div>
                              </>
                          )}

                          {activeElementData.type.startsWith('shape') && activeElementData.type !== 'shape-whiteout' && (
                              <>
                                  <div className="rp-box">
                                      <span className="rp-box-title">Border Thickness</span>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                          <input type="range" min="1" max="24" step="1" style={{flex: 1}} value={activeElementData.strokeWidth || 4} onMouseDown={recordHistory} onTouchStart={recordHistory} onChange={(e) => updateElement(activeContext.pageId, activeContext.elementId, { strokeWidth: parseInt(e.target.value) })} />
                                          <span style={{ fontSize: '0.8rem', fontWeight: 700, width: '24px', textAlign: 'right' }}>{activeElementData.strokeWidth || 4}px</span>
                                      </div>
                                  </div>
                                  
                                  <div className="rp-box">
                                      <span className="rp-box-title">Shape Color</span>
                                      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                          {['#111827', '#E0243A', '#2563EB', '#16A34A', '#D97706', '#9333EA', '#4B5563', '#FFFFFF'].map(c => (
                                              <div key={c} onClick={() => { recordHistory(); updateElement(activeContext.pageId, activeContext.elementId, { color: c })}}
                                                  className="color-circle" style={{ background: c, borderColor: activeElementData.color === c ? '#2563EB' : (c==='#FFFFFF' ? '#E5E7EB' : 'transparent'), boxShadow: activeElementData.color === c ? '0 0 0 2px #FFF inset' : 'none' }} />
                                          ))}
                                      </div>
                                  </div>
                              </>
                          )}
                          
                          {activeElementData.type === 'shape-whiteout' && (
                               <div className="rp-box">
                                  <span className="rp-box-title">Whiteout / Eraser</span>
                                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Use this to cover up existing PDF text or mistakes. It exports as a solid white block.</div>
                              </div>
                          )}

                          {activeElementData.type === 'signature' && (
                              <div className="rp-box">
                                  <span className="rp-box-title">Signature Settings</span>
                                  <div style={{ padding: '16px', background: '#F3F4F6', borderRadius: '8px', marginBottom: '16px', textAlign: 'center', border: '1px solid var(--border)' }}>
                                      <img src={activeElementData.src} style={{ maxWidth: '100%', maxHeight: '60px' }} alt="sig" />
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                                      <span style={{fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)'}}>Scale</span>
                                      <input type="range" min="0.3" max="3" step="0.1" style={{flex: 1}} value={activeElementData.scale || 1} onMouseDown={recordHistory} onTouchStart={recordHistory} onChange={(e) => updateElement(activeContext.pageId, activeContext.elementId, { scale: parseFloat(e.target.value) })} />
                                  </div>
                                  <button className="rp-btn" style={{width: '100%', padding: '10px'}} onClick={() => { setShowSigModal(true); setRightPanelOpen(false); }}>Change Signature</button>
                              </div>
                          )}

                          {activeElementData.type === 'image' && (
                              <div className="rp-box">
                                  <span className="rp-box-title">Image Settings</span>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                                      <span style={{fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)'}}>Scale</span>
                                      <input type="range" min="0.1" max="5" step="0.1" style={{flex: 1}} value={activeElementData.scale || 1} onMouseDown={recordHistory} onTouchStart={recordHistory} onChange={(e) => updateElement(activeContext.pageId, activeContext.elementId, { scale: parseFloat(e.target.value) })} />
                                  </div>
                                  <button className="rp-btn" style={{width: '100%', padding: '10px'}} onClick={() => { document.getElementById('insert-image-upload').click(); setRightPanelOpen(false); }}>Replace Image</button>
                              </div>
                          )}

                          <button className="save-changes-btn" onClick={() => { setActiveContext(null); setRightPanelOpen(false); }}>
                              Save Changes
                          </button>
                      </>
                  ) : (
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: '40px' }}>Select an element to edit properties.</div>
                  )}
              </div>
            </aside>

          </div>
        </>
      )}
    </div>
  );
}