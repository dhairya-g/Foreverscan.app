import React, { useState, useEffect, useRef } from 'react';
import { FileArchive, Download, Trash2, Plus, AlertTriangle, Camera, Image as ImageIcon, ChevronDown, FileText } from 'lucide-react';
import { trackUserAction } from '../utils/analytics'; 
import JSZip from 'jszip'; 
import { jsPDF } from 'jspdf';

export default function Compressor({ showToast, triggerFeedback, transferData, showLoader, hideLoader }) {
  const [items, setItems] = useState([]);
  const [quality, setQuality] = useState(80);
  const [formatAlert, setFormatAlert] = useState(false);
  const [uploadActionTarget, setUploadActionTarget] = useState(null);
  
  const [activeDropdown, setActiveDropdown] = useState(null);
  
  const processedIdsRef = useRef(new Set());

  const isMobile = typeof window !== 'undefined' && /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  useEffect(() => {
    const handleClickOutside = (e) => {
        if (!e.target.closest('.custom-dropdown-container')) setActiveDropdown(null);
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const toggleDropdown = (e, name) => {
    e.stopPropagation();
    setActiveDropdown(prev => prev === name ? null : name);
  };

  // 👇 ADDED FIX: Instant Synchronous Transfer (No setTimeout delays) 👇
  useEffect(() => {
    if (!transferData) return;

    // 1. Normalize transferData into an Array
    let incomingArray = [];
    if (Array.isArray(transferData)) {
        incomingArray = transferData;
    } else if (transferData.batch && Array.isArray(transferData.batch)) {
        incomingArray = transferData.batch;
    } else {
        incomingArray = [transferData];
    }

    let hasNewItems = false;
    const itemsToAdd = [];

    // 2. Extract Data Safely and Synchronously
    incomingArray.forEach((data, index) => {
        if (!data) return;

        // Auto-detect image source
        let imgUrl = typeof data === 'string' ? data : (data.image || data.img || data.src || data.previewUrl || data.dataUrl);
        if (!imgUrl) return;

        // Ensure unique ID
        let itemId = (typeof data === 'object' && data.id) ? data.id : null;
        if (!itemId) itemId = `transfer_${Date.now()}_${Math.random()}`;

        if (!processedIdsRef.current.has(itemId)) {
            processedIdsRef.current.add(itemId);
            hasNewItems = true;

            // Retain original name if available
            let fileName = (typeof data === 'object' && data.name) 
                ? data.name.split('.')[0] 
                : `imported_image_${Math.floor(Math.random() * 1000) + index}`;
            
            let base64Data = imgUrl.split(',')[1] || '';
            let origSize = base64Data ? Math.round(base64Data.length * 0.75) : 0;

            itemsToAdd.push({
                id: itemId,
                name: fileName,
                originalSize: origSize,
                previewUrl: imgUrl,
                compressedUrl: '',
                compSize: 0
            });
        }
    });

    // 3. Inject items instantly
    if (hasNewItems && itemsToAdd.length > 0) {
        setItems(prev => [...prev, ...itemsToAdd]);
        
        // Trigger compression immediately for new items
        itemsToAdd.forEach(item => {
            compressImage(item.previewUrl, quality, item.id);
        });
    }

  }, [transferData]); // ONLY depend on transferData to prevent infinite loops
  // 👆 END FIX 👆

  useEffect(() => {
    if(items.length > 0) {
        items.forEach(item => compressImage(item.previewUrl, quality, item.id));
    }
  }, [quality]);

  const handleFiles = (e) => {
    if(e.preventDefault) e.preventDefault();
    if(e.stopPropagation) e.stopPropagation();
    
    const filesList = e.target?.files || e.dataTransfer?.files;
    if (!filesList || filesList.length === 0) return;

    const validTypes = ['image/jpeg', 'image/png', 'image/heic', 'image/heif'];
    const validExtensions = ['.jpg', '.jpeg', '.png', '.heic'];
    
    let hasInvalid = false;
    let validFiles = Array.from(filesList).filter(file => {
        const isValid = validTypes.includes(file.type) || validExtensions.some(ext => file.name.toLowerCase().endsWith(ext));
        if (!isValid) hasInvalid = true;
        return isValid;
    });

    if (hasInvalid) setFormatAlert(true);

    if (validFiles.length === 0) {
        if (e.target && e.target.value) e.target.value = '';
        return;
    }

    if (showLoader) showLoader("Processing Images...");

    const filePromises = validFiles.map(file => {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (ev) => {
                const nameWithoutExt = file.name.split('.').slice(0, -1).join('.') || 'image';
                resolve({
                    id: Date.now() + Math.random(),
                    name: nameWithoutExt,
                    originalSize: file.size,
                    previewUrl: ev.target.result,
                    compressedUrl: '',
                    compSize: 0
                });
            };
            reader.readAsDataURL(file);
        });
    });

    Promise.all(filePromises).then(newItems => {
        setItems(prev => [...prev, ...newItems]);
        
        newItems.forEach((item, index) => {
            setTimeout(() => {
                compressImage(item.previewUrl, quality, item.id);
            }, index * 100); 
        });

        if (hideLoader) hideLoader();
    });
    
    if (e.target && e.target.value) e.target.value = '';
  };

  const removeItem = (id) => {
      if (showLoader) showLoader("Removing File...");
      setTimeout(() => {
          setItems(prev => prev.filter(i => i.id !== id));
          if (hideLoader) hideLoader();
      }, 400);
  };

  const compressImage = (dataUrl, q, id) => {
    if(!dataUrl) return;
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas'); 
      canvas.width = img.width; 
      canvas.height = img.height;
      const ctx = canvas.getContext('2d'); 
      
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      
      ctx.fillStyle = '#FFFFFF'; 
      ctx.fillRect(0, 0, canvas.width, canvas.height); 
      ctx.drawImage(img, 0, 0);
      
      if(canvas.width > 100) {
          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imgData.data;
          const contrastFactor = (259 * (10 + 255)) / (255 * (259 - 10)); 
          
          for (let i = 0; i < data.length; i += 4) {
              data[i] = contrastFactor * (data[i] - 128) + 128;     
              data[i+1] = contrastFactor * (data[i+1] - 128) + 128; 
              data[i+2] = contrastFactor * (data[i+2] - 128) + 128; 
          }
          ctx.putImageData(imgData, 0, 0);
      }

      // Preserve MimeType during compression if it was a PNG
      const mimeType = dataUrl.startsWith('data:image/png') ? 'image/png' : 'image/jpeg';
      const compressed = canvas.toDataURL(mimeType, q / 100); 
      const sizeBytes = ((compressed.length - 23) * 3 / 4);
      
      setItems(prev => prev.map(item => item.id === id ? { ...item, compressedUrl: compressed, compSize: sizeBytes } : item));
    };
    img.src = dataUrl;
  };

  const handleQualityChange = (e) => { 
      setQuality(parseInt(e.target.value)); 
  };
  
  const downloadAll = async (format) => {
    if (items.length === 0) return;
    setActiveDropdown(null);
    
    let extLabel = format === 'pdf' ? 'PDF' : (format === 'image/jpeg' ? 'JPG' : 'PNG');
    trackUserAction('Batch_Compress', 'Compressor', `Compressed_As_${extLabel}`);
    
    if (showLoader) showLoader(items.length > 1 ? "Creating ZIP file..." : "Downloading...");

    try {
        if (items.length === 1) {
            const item = items[0];
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width; canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);

                if (format === 'pdf') {
                    const pdf = new jsPDF({
                        orientation: canvas.width > canvas.height ? 'l' : 'p',
                        unit: 'px',
                        format: [canvas.width, canvas.height]
                    });
                    const pdfFormat = item.compressedUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
                    pdf.addImage(item.compressedUrl, pdfFormat, 0, 0, canvas.width, canvas.height);
                    pdf.save(`foreverscan_${item.name}_compressed.pdf`);
                } else {
                    const link = document.createElement('a');
                    const ext = format === 'image/jpeg' ? 'jpg' : 'png';
                    link.download = `foreverscan_${item.name}_compressed.${ext}`;
                    link.href = canvas.toDataURL(format, 1.0);
                    link.click();
                }
                
                if (hideLoader) hideLoader();
                if (showToast) showToast("File downloaded successfully!");
                if (triggerFeedback) triggerFeedback();
            };
            img.src = item.compressedUrl;
            
        } else {
            const zip = new JSZip();
            
            if (format === 'pdf') {
                const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
                doc.deletePage(1); 
                
                const processPDFPage = (item) => {
                    return new Promise((resolve) => {
                        const img = new Image();
                        img.onload = () => {
                            const canvas = document.createElement('canvas');
                            canvas.width = img.width; canvas.height = img.height;
                            canvas.getContext('2d').drawImage(img, 0, 0);
                            
                            doc.addPage([canvas.width, canvas.height], canvas.width > canvas.height ? 'l' : 'p');
                            const pdfFormat = item.compressedUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
                            doc.addImage(item.compressedUrl, pdfFormat, 0, 0, canvas.width, canvas.height);
                            resolve();
                        };
                        img.src = item.compressedUrl;
                    });
                };

                for (let i = 0; i < items.length; i++) {
                    await processPDFPage(items[i]);
                }
                
                doc.save('foreverscan_compressed_documents.pdf');

            } else {
                const ext = format === 'image/jpeg' ? 'jpg' : 'png';
                
                const processZipFile = (item, index) => {
                    return new Promise((resolve) => {
                        const img = new Image();
                        img.onload = () => {
                            const canvas = document.createElement('canvas');
                            canvas.width = img.width; canvas.height = img.height;
                            canvas.getContext('2d').drawImage(img, 0, 0);
                            
                            const dataUrl = canvas.toDataURL(format, 1.0);
                            const base64Data = dataUrl.split(',')[1];
                            zip.file(`foreverscan_${item.name}_compressed_${index + 1}.${ext}`, base64Data, { base64: true });
                            resolve();
                        };
                        img.src = item.compressedUrl;
                    });
                };

                for (let i = 0; i < items.length; i++) {
                    await processZipFile(items[i], i);
                }

                const content = await zip.generateAsync({ type: 'blob' });
                const link = document.createElement('a');
                link.href = URL.createObjectURL(content);
                link.download = 'foreverscan_compressed_images.zip';
                link.click();
            }

            if (hideLoader) hideLoader();
            if (showToast) showToast(format === 'pdf' ? "PDF generated successfully!" : "ZIP file downloaded successfully!");
            if (triggerFeedback) triggerFeedback();
        }
    } catch (e) {
        if (hideLoader) hideLoader();
        if (showToast) showToast("Error generating files.");
    }
  };
  
  const reset = () => { 
      if(showLoader) showLoader("Resetting...");
      setTimeout(() => {
          setItems([]); 
          setQuality(80);
          if(hideLoader) hideLoader();
      }, 400);
  };

  const openUploadAction = (target) => {
    if (isMobile) {
      setUploadActionTarget(target);
    } else {
      document.getElementById(`${target}-gallery`).click();
    }
  };

  const totalOrigSize = items.reduce((acc, item) => acc + item.originalSize, 0);
  const totalCompSize = items.reduce((acc, item) => acc + item.compSize, 0);

  return (
    <div id="module-compress" className="module" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', backgroundColor: 'var(--bg-color)' }}>
      
      <style>{`
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

        .custom-dropdown-container:hover .dropdown-content-menu,
        .custom-dropdown-container.active .dropdown-content-menu { 
            display: flex !important; animation: fadeIn 0.15s ease-out; 
        }
        
        .dropdown-content-menu { display: none; }
        
        .dropdown-content-menu::before {
            content: '';
            position: absolute;
            bottom: 100%;
            left: 0;
            right: 0;
            height: 10px;
            background: transparent;
        }

        .dropdown-content-btn {
            padding: 10px 16px; font-size: 0.9rem; font-weight: 600; color: #1F2937;
            background: transparent; border: none; display: flex; align-items: center;
            gap: 10px; width: 100%; cursor: pointer; text-align: left; border-radius: 6px;
            transition: all 0.15s ease;
        }
        .dropdown-content-btn:hover { background-color: #F9FAFB; color: #E0243A; }
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
            We recommend uploading documents in JPG, PNG, or HEIC format only.
            </p>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <button className="btn btn-primary" style={{ padding: '10px 32px', minWidth: '120px' }} onClick={() => setFormatAlert(false)}>
                Okay
              </button>
            </div>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', overflowY: 'auto' }}>
            <div style={{ background: 'var(--surface)', padding: '3rem 2.5rem', borderRadius: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.05)', textAlign: 'center', width: '100%', maxWidth: '600px', border: '1px solid var(--border-color)' }}>
                <h2 style={{fontSize: '1.8rem', color: 'var(--primary)', marginBottom: '8px', fontWeight: '700'}}>File Compressor</h2>
                <p style={{fontSize: '0.95rem', color: 'var(--text-muted)', marginBottom: '2.5rem', lineHeight: '1.5'}}>
                    Select an image to reduce file size instantly while preserving visual clarity.
                </p>
                
                <div className="upload-area" 
                     style={{ padding: '3.5rem 1rem', border: '2px dashed var(--border-color)', borderRadius: '12px', cursor: 'pointer', background: 'var(--bg-color)', transition: 'all 0.2s' }}
                     onClick={() => openUploadAction('compress')}
                     onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                     onDrop={(e) => { e.preventDefault(); e.stopPropagation(); handleFiles(e); }}
                >
                    <FileArchive size={48} color="var(--accent)" style={{ margin: '0 auto 16px auto' }} />
                    <h3 style={{ fontSize: '1.1rem', color: 'var(--primary)', fontWeight: '600', margin: '0' }}>Click or drop an image</h3>
                    
                    <input type="file" id="compress-camera" hidden accept="image/*" capture="environment" onChange={handleFiles} />
                    <input type="file" id="compress-gallery" hidden multiple accept="image/jpeg, image/png, image/heic, .jpg, .jpeg, .png, .heic" onChange={handleFiles} />
                </div>
            </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', maxWidth: '800px', margin: '0 auto', width: '100%', padding: '2rem 1rem' }}>
            <div style={{ flexShrink: 0, marginBottom: '1.5rem' }}>
                <h2 style={{fontSize: '1.6rem', marginBottom: '4px', color: 'var(--primary)', fontWeight: '700'}}>File Compressor</h2>
                <p style={{fontSize: '0.9rem', color: 'var(--text-muted)', margin: 0}}>
                    Reduce multiple image sizes instantly while retaining clarity.
                </p>
            </div>
            
            <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface)', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-color)', marginBottom: '1rem' }}>
                <div>
                    <h4 style={{fontSize: '0.95rem', margin: 0, color: 'var(--primary)'}}>{items.length} Files Selected</h4>
                    <p style={{fontSize: '0.8rem', color: 'var(--text-muted)', margin: '4px 0 0 0'}}>
                        Total Size: {(totalOrigSize / 1024).toFixed(1)} KB → <strong style={{ color: 'var(--accent)' }}>{(totalCompSize / 1024).toFixed(1)} KB</strong>
                    </p>
                </div>
                <button className="btn btn-outline" style={{ padding: '8px 12px', fontSize: '0.8rem', height: 'auto', margin: 0 }} onClick={() => openUploadAction('add-more')}>
                    <Plus size={14} style={{marginRight: '4px'}} /> Add More
                </button>
                <input type="file" id="add-more-camera" hidden accept="image/*" capture="environment" onChange={handleFiles} />
                <input type="file" id="add-more-gallery" hidden multiple accept="image/jpeg, image/png, image/heic, .jpg, .jpeg, .png, .heic" onChange={handleFiles} />
            </div>

            <div className="compress-list" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', paddingRight: '4px', minHeight: '100px', marginBottom: '1rem' }}>
                {items.map(item => (
                    <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#F9FAFB', padding: '10px', borderRadius: '8px', border: '1px solid #E5E7EB' }}>
                        {item.previewUrl ? (
                            <img src={item.previewUrl} style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '4px', border: '1px solid #D1D5DB' }} alt="preview" />
                        ) : (
                            <div style={{ width: '48px', height: '48px', background: '#E5E7EB', borderRadius: '4px' }}></div>
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: '0.85rem', fontWeight: 600, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#1F2937' }}>{item.name}</p>
                            <p style={{ fontSize: '0.75rem', color: '#6B7280', margin: '4px 0 0 0' }}>
                                {(item.originalSize / 1024).toFixed(1)} KB → <strong style={{color: 'var(--accent)'}}>{(item.compSize / 1024).toFixed(1)} KB</strong>
                            </p>
                        </div>
                        <button style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '8px' }} onClick={() => removeItem(item.id)}>
                            <Trash2 size={18} color="#EF4444" />
                        </button>
                    </div>
                ))}
            </div>

            <div style={{ flexShrink: 0, background: 'var(--surface)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', fontSize: '0.85rem', fontWeight: 600 }}>
                <label>Global Compression Quality</label>
                <span style={{ color: 'var(--accent)'}}>{quality}%</span>
              </div>
              <input type="range" min="1" max="100" value={quality} onChange={handleQualityChange} style={{width: '100%', accentColor: 'var(--accent)'}} />
            </div>

            <div style={{ flexShrink: 0, display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <button className="btn btn-outline" style={{ flex: 1, minWidth: '100px', padding: '12px' }} onClick={reset}>Reset All</button>
              
              <div 
                  className={`custom-dropdown-container ${activeDropdown === 'export' ? 'active' : ''}`} 
                  style={{ position: 'relative', display: 'flex', flex: 2, minWidth: '180px' }}
              >
                  <button 
                      className="btn btn-primary" 
                      style={{ 
                          width: '100%', display: 'flex', justifyContent: 'center', 
                          alignItems: 'center', gap: '8px', padding: '12px', fontWeight: '700' 
                      }} 
                      onClick={(e) => { e.stopPropagation(); toggleDropdown(e, 'export'); }}
                  >
                      <Download size={18}/> Compress and download <ChevronDown size={16}/>
                  </button>
                  
                  <div className="dropdown-content-menu right" style={{
                      position: 'absolute', bottom: '100%', right: '0', left: 'auto',
                      flexDirection: 'column', gap: '4px', background: '#FFFFFF',
                      boxShadow: '0 -8px 24px rgba(0,0,0,0.15)', border: '1px solid #E5E7EB',
                      borderRadius: '12px', padding: '8px', marginBottom: '12px', zIndex: 9999, minWidth: '220px'
                  }}>
                      <button className="dropdown-content-btn" onClick={() => downloadAll('pdf')}>
                          <FileText size={18}/> as PDF / zip
                      </button>
                      <button className="dropdown-content-btn" onClick={() => downloadAll('image/jpeg')}>
                          <ImageIcon size={18}/> as JPG Image / zip
                      </button>
                      <button className="dropdown-content-btn" onClick={() => downloadAll('image/png')}>
                          <ImageIcon size={18}/> as PNG Image / zip
                      </button>
                  </div>
              </div>

            </div>
        </div>
      )}
    </div>
  );
}