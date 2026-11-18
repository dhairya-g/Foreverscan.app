import React, { useState, useEffect, useRef, useCallback } from 'react';
import Cropper from 'cropperjs';
import 'cropperjs/dist/cropper.css';
import { jsPDF } from 'jspdf';
import { trackUserAction } from '../utils/analytics';
import { 
    ArrowLeft, RotateCcw, RotateCw, Download, ChevronDown, 
    Crop, FlipHorizontal, FlipVertical, Wand2, ZoomIn, 
    FileText, FileUp, FileImage, Check, X, Sparkles, ShieldCheck, AlertTriangle, Camera, Image as ImageIcon,
    Undo, Redo
} from 'lucide-react';

export default function ImageScanner({ goHome, onTransferToDoc, onTransferToCompress, showToast, triggerFeedback, showLoader, hideLoader }) {
    const [imageSrc, setImageSrc] = useState(null);
    const [baseWorkingSrc, setBaseWorkingSrc] = useState(null); 
    const [originalImageSrc, setOriginalImageSrc] = useState(null); 
    const imageRef = useRef(null);
    const [cropper, setCropper] = useState(null);
    
    const [baseFileName, setBaseFileName] = useState('scanned_image');

    const [zoomPercent, setZoomPercent] = useState(100);
    const [currentRes, setCurrentRes] = useState({ w: 0, h: 0 });
    const [imageAspectRatio, setImageAspectRatio] = useState(1);
    
    const [filterMode, setFilterMode] = useState('original');
    const [activeDropdown, setActiveDropdown] = useState(null);
    const [showTransferModal, setShowTransferModal] = useState(false);
    
    const [formatAlert, setFormatAlert] = useState(false);
    const [uploadActionTarget, setUploadActionTarget] = useState(null);
    
    const [transferSlot, setTransferSlot] = useState('auto'); 
    const [isSlotDropdownOpen, setIsSlotDropdownOpen] = useState(false);

    const [activeTool, setActiveTool] = useState(null); 
    const [isCropping, setIsCropping] = useState(false);
    
    const [resW, setResW] = useState('');
    const [resH, setResH] = useState('');

    // UNDO / REDO HISTORY STATES
    const [past, setPast] = useState([]);
    const [future, setFuture] = useState([]);

    // FLAGS TO CONTROL ZOOM STATE PERSISTENCE
    const zoomTo100OnNextReady = useRef(false);
    const targetZoomRatio = useRef(null);

    const isMobile = typeof window !== 'undefined' && /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (!e.target.closest('.custom-dropdown-container')) setActiveDropdown(null);
            if (!e.target.closest('.slot-dropdown-container')) setIsSlotDropdownOpen(false);
        };
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, []);

    // UNDO/REDO KEYBOARD SHORTCUTS
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            
            if (e.key === 'Escape' && isCropping && cropper) {
                cancelCrop();
            } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                if (e.shiftKey) handleRedo();
                else handleUndo();
            } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
                e.preventDefault();
                handleRedo();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isCropping, cropper, past, future, baseWorkingSrc, filterMode]);

    useEffect(() => {
        if (imageRef.current && imageSrc && !cropper) {
            const newCropper = new Cropper(imageRef.current, {
                viewMode: 1,
                dragMode: 'move', 
                autoCrop: false, 
                background: false,
                restore: false,
                guides: true,
                center: true,
                highlight: false,
                cropBoxMovable: true,
                cropBoxResizable: true,
                toggleDragModeOnDblclick: false,
                ready: () => {
                    if (zoomTo100OnNextReady.current) {
                        newCropper.zoomTo(1);
                        zoomTo100OnNextReady.current = false;
                    } else if (targetZoomRatio.current) {
                        newCropper.zoomTo(targetZoomRatio.current);
                        targetZoomRatio.current = null;
                    }
                    updateLiveZoomAndRes(newCropper);
                },
                zoom: (e) => {
                    setZoomPercent(Math.round(e.detail.ratio * 100));
                },
                crop: () => {
                    updateLiveZoomAndRes(newCropper);
                }
            });
            setCropper(newCropper);
        }
    }, [imageSrc]);

    // HISTORY FUNCTIONS
    const recordHistory = useCallback(() => {
        if (baseWorkingSrc) {
            setPast(prev => [...prev, { src: baseWorkingSrc, filter: filterMode }].slice(-30));
            setFuture([]);
        }
    }, [baseWorkingSrc, filterMode]);

    const handleUndo = () => {
        if (past.length === 0) return;
        const previousState = past[past.length - 1];
        
        setFuture(prev => [{ src: baseWorkingSrc, filter: filterMode }, ...prev]);
        setPast(prev => prev.slice(0, -1));
        
        if (cropper) {
            const canvasData = cropper.getCanvasData();
            targetZoomRatio.current = canvasData.width / canvasData.naturalWidth;
        }

        setBaseWorkingSrc(previousState.src);
        setFilterMode(previousState.filter);
        updatePreview(previousState.src, previousState.filter, false);
    };

    const handleRedo = () => {
        if (future.length === 0) return;
        const nextState = future[0];
        
        setPast(prev => [...prev, { src: baseWorkingSrc, filter: filterMode }]);
        setFuture(prev => prev.slice(1));
        
        if (cropper) {
            const canvasData = cropper.getCanvasData();
            targetZoomRatio.current = canvasData.width / canvasData.naturalWidth;
        }

        setBaseWorkingSrc(nextState.src);
        setFilterMode(nextState.filter);
        updatePreview(nextState.src, nextState.filter, false);
    };

    const applyFilter = (canvas, mode = filterMode) => {
        if (mode === 'original') return canvas;
        const ctx = canvas.getContext('2d');
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;

        if (mode === 'magic') {
            for (let i = 0; i < data.length; i += 4) {
                let r = data[i]; let g = data[i + 1]; let b = data[i + 2];
                const lum = 0.299 * r + 0.587 * g + 0.114 * b;
                if (lum > 140) { data[i] = 255; data[i+1] = 255; data[i+2] = 255; } 
                else if (lum > 75) { data[i] = Math.min(255, r * 1.05); data[i+1] = Math.min(255, g * 1.05); data[i+2] = Math.min(255, b * 1.05); } 
                else { data[i] = r * 0.7; data[i+1] = g * 0.7; data[i+2] = b * 0.7; }
            }
        } else if (mode === 'enhanced') {
            for (let i = 0; i < data.length; i += 4) {
                let r = data[i]; let g = data[i + 1]; let b = data[i + 2];
                const contrast = 25; 
                const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
                r = factor * (r - 128) + 128; g = factor * (g - 128) + 128; b = factor * (b - 128) + 128;
                const lum = 0.299 * r + 0.587 * g + 0.114 * b;
                const sat = 1.25; 
                r = lum + (r - lum) * sat; g = lum + (g - lum) * sat; b = lum + (b - lum) * sat;
                data[i] = Math.min(255, Math.max(0, r + 8)); data[i+1] = Math.min(255, Math.max(0, g + 8)); data[i+2] = Math.min(255, Math.max(0, b + 8));
            }
        }
        ctx.putImageData(imgData, 0, 0);
        return canvas;
    };

    const updatePreview = (baseSrc, mode, maintainState) => {
        if (!cropper || !baseSrc) return;
        const img = new Image();
        img.src = baseSrc;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            
            const filteredCanvas = applyFilter(canvas, mode);
            const mimeType = originalImageSrc?.startsWith('data:image/png') ? 'image/png' : 'image/jpeg';
            if (!maintainState) cropper.clear();
            cropper.replace(filteredCanvas.toDataURL(mimeType, 1.0), maintainState);
        };
    };

    const commitActionAndBake = () => {
        if (!cropper) return;
        const canvasData = cropper.getCanvasData();
        targetZoomRatio.current = canvasData.width / canvasData.naturalWidth;

        const canvas = cropper.getCroppedCanvas({ imageSmoothingEnabled: true, imageSmoothingQuality: 'high' });
        if (canvas) {
            recordHistory();
            const mimeType = originalImageSrc?.startsWith('data:image/png') ? 'image/png' : 'image/jpeg';
            const newSrc = canvas.toDataURL(mimeType, 1.0);
            setBaseWorkingSrc(newSrc);
            setFilterMode('original');
            updatePreview(newSrc, 'original', false);
        }
    };

    const updateLiveZoomAndRes = (c) => {
        if (!c) return;
        const canvasData = c.getCanvasData();
        const imageData = c.getImageData();
        const cropBoxData = c.getCropBoxData();
        
        if (canvasData && imageData && cropBoxData) {
            setZoomPercent(Math.round((canvasData.width / imageData.naturalWidth) * 100) || 100);
            const scaleX = imageData.naturalWidth / imageData.width;
            const resW = Math.round(cropBoxData.width * scaleX);
            const resH = Math.round(cropBoxData.height * scaleX);
            setCurrentRes({ w: resW || Math.round(imageData.naturalWidth), h: resH || Math.round(imageData.naturalHeight) });
            setImageAspectRatio(imageData.naturalWidth / imageData.naturalHeight);
        }
    };

    const handleUploadClick = (targetId) => {
        if (isMobile) {
            setUploadActionTarget(targetId);
        } else {
            const el = document.getElementById(`${targetId}-gallery`);
            if (el) el.click();
        }
    };

    const handleDropUpload = (e, targetId) => {
        e.preventDefault(); 
        e.stopPropagation();
        const files = e.dataTransfer?.files;
        if (files && files.length > 0) {
            const file = files[0];
            const validTypes = ['image/jpeg', 'image/png', 'image/heic', 'image/heif'];
            const validExtensions = ['.jpg', '.jpeg', '.png', '.heic'];
            if (!(validTypes.includes(file.type) || validExtensions.some(ext => file.name.toLowerCase().endsWith(ext)))) {
                setFormatAlert(true);
                return;
            }
            handleFileUpload({ target: { files: files } });
        }
    };

    const handleFileUpload = (e) => {
        const file = e.target?.files?.[0];
        if (file) {
            const validTypes = ['image/jpeg', 'image/png', 'image/heic', 'image/heif'];
            const validExtensions = ['.jpg', '.jpeg', '.png', '.heic'];
            if (!validTypes.includes(file.type) && !validExtensions.some(ext => file.name.toLowerCase().endsWith(ext))) {
                setFormatAlert(true);
                if (e.target && e.target.value !== undefined) e.target.value = '';
                return;
            }

            const nameWithoutExt = file.name.split('.').slice(0, -1).join('.') || 'scanned_image';
            setBaseFileName(nameWithoutExt);

            if (showLoader) showLoader("Processing Image...");
            setTimeout(() => {
                const reader = new FileReader();
                reader.onload = (ev) => {
                    const res = ev.target.result;
                    setImageSrc(res);
                    setBaseWorkingSrc(res);
                    setOriginalImageSrc(res); 
                    setFilterMode('original');
                    setIsCropping(false);
                    setActiveTool(null);
                    setPast([]);
                    setFuture([]);
                    targetZoomRatio.current = null;
                    zoomTo100OnNextReady.current = false;
                    
                    if (cropper) {
                        cropper.destroy();
                        setCropper(null);
                    }
                    if (hideLoader) hideLoader();
                };
                reader.readAsDataURL(file);
            }, 600); 
        }
        if(e.target && e.target.value !== undefined) e.target.value = '';
    };

    const getProcessedCanvas = () => {
        if (!cropper) return null;
        return cropper.getCroppedCanvas({
            imageSmoothingEnabled: true,
            imageSmoothingQuality: 'high',
        });
    };

    const cancelCrop = () => {
        if (cropper) { cropper.clear(); cropper.setDragMode('move'); }
        setIsCropping(false);
        setActiveTool(null);
    };

    const handleAction = (action) => {
        if (!cropper) return;
        if (action !== 'crop' && isCropping) cancelCrop();

        switch (action) {
            case 'crop': 
                if (isCropping) {
                    commitActionAndBake();
                    setIsCropping(false);
                    setActiveTool(null);
                    cropper.setDragMode('move');
                    if(showToast) showToast("Crop applied successfully.");
                } else {
                    setIsCropping(true);
                    setActiveTool('crop');
                    cropper.setDragMode('crop');
                }
                break;
            case 'rotateL': 
                setActiveTool('rotateL');
                cropper.rotate(-90);
                commitActionAndBake();
                setTimeout(() => setActiveTool(null), 300);
                break;
            case 'rotateR': 
                setActiveTool('rotateR');
                cropper.rotate(90);
                commitActionAndBake();
                setTimeout(() => setActiveTool(null), 300);
                break;
            case 'flipH': 
                setActiveTool('flipH');
                cropper.scaleX(cropper.getData().scaleX === -1 ? 1 : -1); 
                commitActionAndBake();
                setTimeout(() => setActiveTool(null), 300);
                break;
            case 'flipV': 
                setActiveTool('flipV');
                cropper.scaleY(cropper.getData().scaleY === -1 ? 1 : -1); 
                commitActionAndBake();
                setTimeout(() => setActiveTool(null), 300);
                break;
            default: break;
        }
    };

    const handleResetAll = () => {
        if (cropper && originalImageSrc) {
            recordHistory();
            const canvasData = cropper.getCanvasData();
            targetZoomRatio.current = canvasData.width / canvasData.naturalWidth;

            setBaseWorkingSrc(originalImageSrc);
            setFilterMode('original');
            updatePreview(originalImageSrc, 'original', false); 
        }
        setActiveTool(null);
        setIsCropping(false);
        setResW('');
        setResH('');
        if (showToast) showToast("All edits and filters reset to original.");
    };

    const handleResWChange = (e) => setResW(e.target.value);
    const handleResHChange = (e) => setResH(e.target.value);

    const handleApplyResolution = () => {
        if(!cropper || !resW || !resH) return;
        const w = parseInt(resW);
        const h = parseInt(resH);
        
        if (w > 0 && h > 0) {
            if (showLoader) showLoader("Resizing Image...");
            setTimeout(() => {
                const sourceCanvas = cropper.getCroppedCanvas({
                    imageSmoothingEnabled: true,
                    imageSmoothingQuality: 'high'
                });

                if (sourceCanvas) {
                    recordHistory();
                    
                    const stretchedCanvas = document.createElement('canvas');
                    stretchedCanvas.width = w;
                    stretchedCanvas.height = h;
                    
                    const ctx = stretchedCanvas.getContext('2d');
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = 'high';
                    ctx.drawImage(sourceCanvas, 0, 0, w, h);

                    const mimeType = originalImageSrc?.startsWith('data:image/png') ? 'image/png' : 'image/jpeg';
                    const newSrc = stretchedCanvas.toDataURL(mimeType, 1.0);
                    
                    zoomTo100OnNextReady.current = true;

                    setBaseWorkingSrc(newSrc);
                    setFilterMode('original');
                    updatePreview(newSrc, 'original', false);
                    
                    if(showToast) showToast(`Image successfully resized to ${w}x${h}`);
                    setResW('');
                    setResH('');
                }
                if (hideLoader) hideLoader();
            }, 600); 
        }
    };

    const toggleDropdown = (e, name) => {
        e.stopPropagation();
        setActiveDropdown(prev => prev === name ? null : name);
    };

    const handleTransferProceed = () => {
        setShowTransferModal(false);
        trackUserAction('Transfer', 'Image_Editor', 'To_Doc_Scanner');

        if (showLoader) showLoader("Transferring to Doc Scanner...");
        setTimeout(() => {
            const processedCanvas = getProcessedCanvas();
            if (processedCanvas && onTransferToDoc) {
                const mimeType = originalImageSrc?.startsWith('data:image/png') ? 'image/png' : 'image/jpeg';
                const dataUrl = processedCanvas.toDataURL(mimeType, 1.0); 
                onTransferToDoc(dataUrl, transferSlot); 
            }
            if (hideLoader) hideLoader();
        }, 600); 
    };

    const exportImage = (format) => {
        setActiveDropdown(null);
        trackUserAction('Export', 'Image_Editor', format === 'image/jpeg' ? 'JPG' : 'PNG');
        
        if (showLoader) showLoader("Saving Image...");
        setTimeout(() => {
            const processedCanvas = getProcessedCanvas();
            if (processedCanvas) {
                const ext = format === 'image/jpeg' ? 'jpg' : 'png';
                const link = document.createElement('a');
                link.download = `foreverscan_${baseFileName}.${ext}`;
                link.href = processedCanvas.toDataURL(format, 1.0);
                link.click();
            }
            if (hideLoader) hideLoader();
            if(triggerFeedback) triggerFeedback();
        }, 600); 
    };

    const exportPDF = () => {
        setActiveDropdown(null);
        trackUserAction('Export', 'Image_Editor', 'PDF');

        if (showLoader) showLoader("Generating PDF...");
        setTimeout(() => {
            const processedCanvas = getProcessedCanvas();
            if (processedCanvas) {
                const mimeType = originalImageSrc?.startsWith('data:image/png') ? 'image/png' : 'image/jpeg';
                const imgData = processedCanvas.toDataURL(mimeType, 1.0);
                const pdf = new jsPDF({
                    orientation: processedCanvas.width > processedCanvas.height ? 'l' : 'p',
                    unit: 'px',
                    format: [processedCanvas.width, processedCanvas.height]
                });
                const pdfFormat = mimeType === 'image/png' ? 'PNG' : 'JPEG';
                pdf.addImage(imgData, pdfFormat, 0, 0, processedCanvas.width, processedCanvas.height);
                pdf.save(`foreverscan_${baseFileName}.pdf`);
            }
            if (hideLoader) hideLoader();
            if(triggerFeedback) triggerFeedback();
        }, 600); 
    };

    return (
        <div className="module" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            
            <style>{`
                .custom-dropdown-container:hover .dropdown-content-menu,
                .custom-dropdown-container.active .dropdown-content-menu { 
                    display: flex !important; animation: fadeIn 0.15s ease-out; 
                }
                
                .dropdown-content-menu { display: none; }
                
                .dropdown-content-menu::before {
                    content: '';
                    position: absolute;
                    top: -15px;
                    left: 0;
                    right: 0;
                    height: 15px;
                    background: transparent;
                }

                .dropdown-content-btn {
                    padding: 8px 12px; font-size: 0.85rem; font-weight: 600; color: #1F2937;
                    background: transparent; border: none; display: flex; align-items: center;
                    gap: 10px; width: 100%; cursor: pointer; text-align: left; border-radius: 6px;
                    transition: all 0.15s ease;
                }
                .dropdown-content-btn:hover { background-color: #F9FAFB; color: #E0243A; }

                .custom-dropdown-container.disabled {
                    pointer-events: none;
                    opacity: 0.6;
                }

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
                
                .action-sheet-overlay {
                  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                  background: rgba(0,0,0,0.5); z-index: 99999;
                  display: flex; align-items: flex-end; justify-content: center;
                }
                .action-sheet-content {
                  background: var(--surface, #FFFFFF); width: 100%; border-radius: 16px 16px 0 0;
                  padding: 1.5rem; animation: slideUp 0.3s ease-out;
                }
                .action-sheet-btn {
                  width: 100%; padding: 14px; background: #F3F4F6; border: none; border-radius: 10px;
                  margin-bottom: 10px; font-size: 1rem; font-weight: 600; color: #1F2937;
                  display: flex; align-items: center; justify-content: center; gap: 10px; cursor: pointer;
                }
                .action-sheet-cancel {
                  width: 100%; padding: 14px; background: transparent; border: none;
                  font-size: 1rem; font-weight: 700; color: #E0243A; cursor: pointer; margin-top: 5px;
                }
                @media (min-width: 768px) {
                  .action-sheet-overlay { align-items: center; }
                  .action-sheet-content { max-width: 400px; border-radius: 16px; }
                }
                @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }

                @media (max-width: 1024px) {
                    .dropdown-content-menu.right {
                        left: 0 !important;
                        right: auto !important;
                    }
                }

                .floating-toolbar {
                    position: absolute;
                    top: auto !important;
                    bottom: 32px !important;
                    left: 50%;
                    transform: translateX(-50%) !important;
                    display: flex;
                    flex-direction: row !important;
                    align-items: center;
                    height: auto !important;
                    background: rgba(255, 255, 255, 0.95);
                    backdrop-filter: blur(10px);
                    border-radius: 12px;
                    border: 1px solid var(--border-color);
                    box-shadow: 0 4px 20px rgba(0,0,0,0.12);
                    z-index: 100;
                    padding: 4px;
                }

                .floating-toolbar .toolbar-item {
                    border-bottom: none;
                    border-right: 1px solid var(--border-color);
                    display: flex;
                    align-items: center;
                }
                
                .floating-toolbar .toolbar-item:last-child {
                    border-right: none;
                }

                .floating-toolbar .icon-btn {
                    width: 44px;
                    height: 44px;
                    padding: 0;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: transparent;
                    border: none;
                    color: var(--primary);
                    cursor: pointer;
                    transition: all 0.2s ease;
                    border-radius: 8px;
                }

                .floating-toolbar .icon-btn:hover,
                .floating-toolbar .icon-btn.active-tool {
                    color: var(--accent);
                    background: var(--accent-light);
                }
                
                .floating-toolbar .icon-btn.cancel-tool:hover {
                    background: #F3F4F6;
                    color: var(--primary);
                }
                
                .floating-toolbar .icon-btn:disabled {
                    opacity: 0.3;
                    cursor: not-allowed;
                }

                .floating-toolbar .tooltip-content.side-tooltip {
                    top: auto;
                    bottom: calc(100% + 12px);
                    left: 50%;
                    transform: translate(-50%, 5px);
                    margin: 0;
                    width: max-content;
                    padding: 6px 12px;
                    font-size: 0.75rem;
                    font-weight: 600;
                }
                
                .floating-toolbar .tooltip-container:hover .side-tooltip {
                    transform: translate(-50%, 0);
                }
                
                .floating-toolbar .tooltip-content.side-tooltip::after {
                    top: auto;
                    bottom: -5px;
                    left: 50%;
                    transform: translateX(-50%) rotate(45deg);
                }

                .zoom-overlay {
                    position: absolute; 
                    top: 24px; 
                    left: 50%; 
                    transform: translateX(-50%);
                    background: rgba(28, 30, 38, 0.85); 
                    color: white; 
                    padding: 8px 20px;
                    border-radius: 24px; 
                    font-size: 0.85rem; 
                    font-weight: 600; 
                    z-index: 100;
                    display: flex; 
                    align-items: center; 
                    gap: 12px; 
                    backdrop-filter: blur(4px);
                    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                }
                
                @media (max-width: 1024px) {
                    .zoom-overlay {
                        display: flex !important;
                        top: 16px !important;
                        bottom: auto !important;
                    }
                    .floating-toolbar {
                        bottom: 24px !important;
                    }
                }
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

            {showTransferModal && (
                <div className="modal-overlay">
                    <div className="modal-content" style={{ maxWidth: '420px', textAlign: 'center', overflow: 'visible' }}>
                        <h3 style={{ fontSize: '1.2rem', color: 'var(--primary)', marginBottom: '10px' }}>Transfer to DocScanner</h3>
                        <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '15px', lineHeight: '1.5' }}>
                            Your edited image will be seamlessly transferred to the Document Scanner module.
                        </p>
                        
                        <div style={{ marginBottom: '25px', textAlign: 'left', background: '#F9FAFB', padding: '12px', borderRadius: '8px', border: '1px solid #E5E7EB' }}>
                            <label style={{ fontSize: '0.8rem', fontWeight: '700', color: '#374151', display: 'block', marginBottom: '8px' }}>Select Destination:</label>
                            
                            <div className="slot-dropdown-container" style={{ position: 'relative', width: '100%' }}>
                                <button 
                                    className="btn btn-outline"
                                    type="button"
                                    style={{ width: '100%', justifyContent: 'space-between', padding: '10px 14px', background: '#FFF', borderColor: '#D1D5DB', height: '38px', margin: 0 }}
                                    onClick={(e) => { e.stopPropagation(); setIsSlotDropdownOpen(!isSlotDropdownOpen); }}
                                >
                                    <span style={{ color: 'var(--primary)', fontWeight: '600' }}>
                                      {transferSlot === 'auto' && 'Auto Detect'}
                                      {transferSlot === 'front' && 'Replace Front Side'}
                                      {transferSlot === 'back' && 'Replace Back Side'}
                                    </span>
                                    <ChevronDown size={14} color="var(--text-muted)"/>
                                </button>
                                
                                {isSlotDropdownOpen && (
                                    <div style={{
                                        position: 'absolute', top: '100%', left: '0', right: '0',
                                        display: 'flex', flexDirection: 'column', gap: '2px', background: '#FFFFFF',
                                        boxShadow: '0 8px 24px rgba(0,0,0,0.12)', border: '1px solid #E5E7EB',
                                        borderRadius: '8px', padding: '6px', marginTop: '4px', zIndex: 9999
                                    }}>
                                        <button className="dropdown-content-btn" type="button" onClick={(e) => { e.stopPropagation(); setTransferSlot('auto'); setIsSlotDropdownOpen(false); }}>
                                          <span>Auto Detect</span>
                                        </button>
                                        <button className="dropdown-content-btn" type="button" onClick={(e) => { e.stopPropagation(); setTransferSlot('front'); setIsSlotDropdownOpen(false); }}>
                                          <span>Replace Front Side</span>
                                        </button>
                                        <button className="dropdown-content-btn" type="button" onClick={(e) => { e.stopPropagation(); setTransferSlot('back'); setIsSlotDropdownOpen(false); }}>
                                          <span>Replace Back Side</span>
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setShowTransferModal(false)}>Cancel</button>
                            <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleTransferProceed}>Proceed</button>
                        </div>
                    </div>
                </div>
            )}

            {!imageSrc ? (
                <section className="screen" style={{ justifyContent: 'center', alignItems: 'center', padding: '2rem' }}>
                    <header className="app-header" style={{ textAlign: 'center', marginBottom: '2rem' }}>
                        <h1 className="main-heading">Scan & <span style={{ color: 'var(--accent)' }}>Edit Image</span></h1>
                        <p style={{ margin: 0 }}>
                            Crop, auto-align, and enhance documents preserving real quality.
                        </p>
                    </header>
                    <div 
                        onClick={() => handleUploadClick('main-upload')}
                        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                        onDrop={(e) => handleDropUpload(e, 'main-upload')}
                        style={{
                            maxWidth: '450px', width: '100%', padding: '3rem 1.5rem', 
                            border: '3px dashed var(--border-color)', borderRadius: '16px', 
                            background: 'var(--surface)', textAlign: 'center', cursor: 'pointer',
                            transition: 'all 0.2s',
                        }}
                    >
                        <FileUp size={40} color="var(--accent)" style={{ margin: '0 auto 1rem auto' }} />
                        <h3 style={{ color: 'var(--primary)', marginBottom: '5px', fontSize: '1.1rem', fontWeight: '600' }}>Click or drop an image</h3>
                        
                        <input type="file" id="main-upload-camera" hidden accept="image/*" capture="environment" onChange={handleFileUpload} />
                        <input type="file" id="main-upload-gallery" hidden accept="image/jpeg, image/png, image/heic, .jpg, .jpeg, .png, .heic" onChange={handleFileUpload} />
                    </div>
                </section>
            ) : (
                <section className="screen" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                    
                    <header className="export-header" style={{ 
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
                        flexWrap: 'wrap', gap: '12px', padding: '0.8rem 1.5rem' 
                    }}>
                        
                        <div className="export-left" style={{ display: 'flex', gap: '10px', flex: '1 1 auto', justifyContent: 'flex-start', alignItems: 'center' }}>
                            <button className="btn btn-outline" style={{ height: '34px', margin: 0, boxSizing: 'border-box', padding: '0 12px', fontSize: '0.8rem' }} onClick={() => { setImageSrc(null); if(cropper) cropper.destroy(); }}><ArrowLeft size={16}/> Back</button>
                            <button className="btn btn-outline" style={{ height: '34px', margin: 0, boxSizing: 'border-box', padding: '0 12px', fontSize: '0.8rem' }} onClick={handleResetAll}><RotateCcw size={16}/> Reset All</button>
                        </div>
                        
                        <div className="export-right" style={{ display: 'flex', gap: '10px', flex: '1 1 auto', justifyContent: 'flex-end', alignItems: 'center' }}>
                            
                            <div className="filter-toggle-group">
                                <label className="filter-toggle-btn">
                                    <input type="radio" name="img_filter" checked={filterMode === 'original'} onChange={() => {
                                        recordHistory();
                                        setFilterMode('original');
                                        if (cropper) targetZoomRatio.current = cropper.getCanvasData().width / cropper.getCanvasData().naturalWidth;
                                        if (showLoader) showLoader("Applying Filter...");
                                        setTimeout(() => { updatePreview(baseWorkingSrc, 'original', false); if(hideLoader) hideLoader(); }, 600);
                                    }}/>
                                    <span>Original</span>
                                </label>
                                <label className="filter-toggle-btn">
                                    <input type="radio" name="img_filter" checked={filterMode === 'enhanced'} onChange={() => {
                                        recordHistory();
                                        setFilterMode('enhanced');
                                        if (cropper) targetZoomRatio.current = cropper.getCanvasData().width / cropper.getCanvasData().naturalWidth;
                                        if (showLoader) showLoader("Applying Filter...");
                                        setTimeout(() => { updatePreview(baseWorkingSrc, 'enhanced', false); if(hideLoader) hideLoader(); }, 600);
                                    }}/>
                                    <span><Sparkles size={12} style={{display:'inline', marginRight:'4px'}}/> Enhanced</span>
                                </label>
                                <label className="filter-toggle-btn">
                                    <input type="radio" name="img_filter" checked={filterMode === 'magic'} onChange={() => {
                                        recordHistory();
                                        setFilterMode('magic');
                                        if (cropper) targetZoomRatio.current = cropper.getCanvasData().width / cropper.getCanvasData().naturalWidth;
                                        if (showLoader) showLoader("Applying Filter...");
                                        setTimeout(() => { updatePreview(baseWorkingSrc, 'magic', false); if(hideLoader) hideLoader(); }, 600);
                                    }}/>
                                    <span><Wand2 size={12} style={{display:'inline', marginRight:'4px'}}/> Magic Filter</span>
                                </label>
                            </div>

                            <div className={`custom-dropdown-container ${activeDropdown === 'transport' ? 'active' : ''}`} style={{ position: 'relative', display: 'inline-block', height: '34px', margin: 0, boxSizing: 'border-box' }}>
                                <button 
                                    className="btn btn-outline"
                                    style={{ padding: '0 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '600', height: '100%', boxSizing: 'border-box', margin: 0 }} 
                                    onClick={(e) => { e.stopPropagation(); toggleDropdown(e, 'transport'); }}
                                >
                                    Move to <ChevronDown size={14}/>
                                </button>
                                
                                <div className="dropdown-content-menu right" style={{
                                    position: 'absolute', top: '100%', right: '0', left: 'auto',
                                    flexDirection: 'column', gap: '2px', background: '#FFFFFF',
                                    boxShadow: '0 8px 24px rgba(0,0,0,0.12)', border: '1px solid #E5E7EB',
                                    borderRadius: '8px', padding: '6px', marginTop: '6px', zIndex: 9999, minWidth: '180px'
                                }}>
                                    <div style={{ position: 'absolute', top: '-10px', left: 0, right: 0, height: '10px' }}></div>
                                    <button className="dropdown-content-btn" onClick={() => { setActiveDropdown(null); setShowTransferModal(true); }}>
                                        Document Scanner
                                    </button>
                                </div>
                            </div>

                            <div className={`custom-dropdown-container ${activeDropdown === 'export' ? 'active' : ''}`} style={{ position: 'relative', display: 'inline-block', height: '34px', margin: 0, boxSizing: 'border-box' }}>
                                <button 
                                    className="btn"
                                    style={{ 
                                        backgroundColor: '#E0243A', color: '#FFFFFF', border: '1px solid #E0243A',
                                        padding: '0 12px', fontSize: '0.8rem', borderRadius: '6px',
                                        display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '600', cursor: 'pointer',
                                        height: '100%', boxSizing: 'border-box', margin: 0
                                    }} 
                                    onClick={(e) => { e.stopPropagation(); toggleDropdown(e, 'export'); }}
                                >
                                    <Download size={16}/> Export <ChevronDown size={14}/>
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
                                        <Download size={16}/> as JPG image
                                    </button>
                                    <button className="dropdown-content-btn" onClick={() => exportImage('image/png')}>
                                        <Download size={16}/> as PNG image
                                    </button>
                                </div>
                            </div>
                        </div>
                    </header>

                    <div className="dashboard" style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                        
                        <aside className="sidebar" style={{ width: '280px', flexShrink: 0, padding: '1.5rem', background: 'var(--surface)', borderRight: '1px solid var(--border-color)', overflowY: 'auto' }}>
                            
                            <div style={{ marginBottom: '2rem' }}>
                                <div style={{ marginBottom: '0.8rem' }}>
                                    <h3 style={{ fontSize: '0.8rem', color: '#6B7280', textTransform: 'uppercase', fontWeight: '700', margin: 0 }}>
                                        UPLOADED IMAGE
                                    </h3>
                                </div>
                                <div 
                                    onClick={() => handleUploadClick('replace-upload')}
                                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                                    onDrop={(e) => handleDropUpload(e, 'replace-upload')}
                                    style={{
                                        padding: '1.2rem 1rem', border: '2px dashed #E5E7EB', 
                                        borderRadius: '12px', background: '#F8F9FA', textAlign: 'center', 
                                        cursor: 'pointer', display: 'flex', flexDirection: 'column', 
                                        alignItems: 'center', gap: '6px', transition: 'border 0.2s'
                                    }}
                                >
                                    <div style={{ color: 'var(--accent)', background: 'var(--accent-light)', padding: '6px 8px', borderRadius: '6px' }}>
                                        <FileImage size={18} />
                                    </div>
                                    <h4 style={{ color: 'var(--accent)', fontSize: '0.85rem', fontWeight: '700', margin: 0 }}>Uploaded</h4>
                                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: '600' }}>Drop to replace</span>
                                    
                                    <input type="file" id="replace-upload-camera" hidden accept="image/*" capture="environment" onChange={handleFileUpload} />
                                    <input type="file" id="replace-upload-gallery" hidden accept="image/jpeg, image/png, image/heic, .jpg, .jpeg, .png, .heic" onChange={handleFileUpload} />
                                </div>
                            </div>

                            <div>
                                <h3 style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '1rem', fontWeight: '700' }}>Custom Resolution</h3>
                                <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: '600' }}>Width (px)</label>
                                        <input type="number" value={resW} onChange={handleResWChange} style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', width: '100%', fontSize: '0.8rem', outline: 'none' }} placeholder="Width" />
                                    </div>
                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: '600' }}>Height (px)</label>
                                        <input type="number" value={resH} onChange={handleResHChange} style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', width: '100%', fontSize: '0.8rem', outline: 'none' }} placeholder="Height" />
                                    </div>
                                </div>
                                <button 
                                    className={`btn ${(!resW || !resH) ? 'btn-outline' : 'btn-primary'}`} 
                                    style={{ width: '100%', fontWeight: '700' }} 
                                    disabled={!resW || !resH} 
                                    onClick={handleApplyResolution}
                                >
                                    Apply
                                </button>
                            </div>
                        </aside>

                        <div className="preview-area" style={{ flex: 1, position: 'relative', background: '#F3F4F6', overflow: 'hidden' }}>
                            <div className="floating-toolbar">
                                
                                <div className="tooltip-container toolbar-item">
                                    <button className="icon-btn" onClick={handleUndo} disabled={past.length === 0}>
                                        <Undo size={20} />
                                    </button>
                                    <div className="tooltip-content side-tooltip">Undo (Ctrl+Z)</div>
                                </div>
                                <div className="tooltip-container toolbar-item">
                                    <button className="icon-btn" onClick={handleRedo} disabled={future.length === 0}>
                                        <Redo size={20} />
                                    </button>
                                    <div className="tooltip-content side-tooltip">Redo (Ctrl+Y)</div>
                                </div>

                                <div className="tooltip-container toolbar-item">
                                    <button className={`icon-btn ${activeTool === 'crop' ? 'active-tool' : ''}`} onClick={() => handleAction('crop')}>
                                        {isCropping ? <Check size={20} /> : <Crop size={20} />}
                                    </button>
                                    <div className="tooltip-content side-tooltip">{isCropping ? "Apply Crop" : "Crop"}</div>
                                </div>
                                
                                {isCropping && (
                                    <div className="tooltip-container toolbar-item">
                                        <button className="icon-btn cancel-tool" onClick={cancelCrop}>
                                            <X size={20} color="#6B7280" />
                                        </button>
                                        <div className="tooltip-content side-tooltip">Cancel (Esc)</div>
                                    </div>
                                )}
                                
                                <div className="tooltip-container toolbar-item">
                                    <button className={`icon-btn ${activeTool === 'rotateL' ? 'active-tool' : ''}`} onClick={() => handleAction('rotateL')} disabled={isCropping}>
                                        <RotateCcw size={20}/>
                                    </button>
                                    <div className="tooltip-content side-tooltip">Rotate Left</div>
                                </div>
                                
                                <div className="tooltip-container toolbar-item">
                                    <button className={`icon-btn ${activeTool === 'rotateR' ? 'active-tool' : ''}`} onClick={() => handleAction('rotateR')} disabled={isCropping}>
                                        <RotateCw size={20}/>
                                    </button>
                                    <div className="tooltip-content side-tooltip">Rotate Right</div>
                                </div>
                                
                                <div className="tooltip-container toolbar-item">
                                    <button className={`icon-btn ${activeTool === 'flipH' ? 'active-tool' : ''}`} onClick={() => handleAction('flipH')} disabled={isCropping}>
                                        <FlipHorizontal size={20}/>
                                    </button>
                                    <div className="tooltip-content side-tooltip">Flip Horizontal</div>
                                </div>
                                
                                <div className="tooltip-container toolbar-item">
                                    <button className={`icon-btn ${activeTool === 'flipV' ? 'active-tool' : ''}`} onClick={() => handleAction('flipV')} disabled={isCropping}>
                                        <FlipVertical size={20}/>
                                    </button>
                                    <div className="tooltip-content side-tooltip">Flip Vertical</div>
                                </div>
                            </div>

                            <div className="zoom-overlay">
                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <ZoomIn size={14}/> {zoomPercent}%
                                </span>
                                <span style={{ borderLeft: '1px solid rgba(255,255,255,0.3)', height: '14px' }}></span>
                                <span>{currentRes.w} &times; {currentRes.h} px</span>
                            </div>

                            <div style={{ position: 'absolute', top: '20px', left: 0, right: 0, bottom: '20px' }}>
                                <img 
                                    ref={imageRef} 
                                    src={imageSrc} 
                                    alt="Workspace" 
                                    style={{ display: 'block', maxWidth: '100%' }} 
                                />
                            </div>
                        </div>
                    </div>
                </section>
            )}
        </div>
    );
}