export const MagicFilter = {
    apply(sourceImgObj, filterMode, callback) {
      const canvas = document.createElement('canvas');
      const w = sourceImgObj.width;
      const h = sourceImgObj.height;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(sourceImgObj, 0, 0);
  
      if (filterMode === 'simple_bw') {
        const imgData = ctx.getImageData(0, 0, w, h);
        const data = imgData.data;
        for (let i = 0; i < data.length; i += 4) {
          let gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          data[i] = data[i + 1] = data[i + 2] = gray;
        }
        ctx.putImageData(imgData, 0, 0);
        callback(canvas.toDataURL('image/jpeg', 0.95));
        return;
      }
  
      const bgCanvas = document.createElement('canvas');
      bgCanvas.width = w;
      bgCanvas.height = h;
      const bgCtx = bgCanvas.getContext('2d', { willReadFrequently: true });
      bgCtx.drawImage(canvas, 0, 0);
      bgCtx.filter = 'blur(45px)';
      bgCtx.drawImage(canvas, 0, 0);
      const bgData = bgCtx.getImageData(0, 0, w, h).data;
  
      const origData = ctx.getImageData(0, 0, w, h).data;
      const outData = new Uint8ClampedArray(origData.length);
  
      for (let i = 0; i < origData.length; i += 4) {
        if (origData[i + 3] === 0) continue;
        let r = (origData[i] / Math.max(bgData[i], 1)) * 240;
        let g = (origData[i + 1] / Math.max(bgData[i + 1], 1)) * 240;
        let b = (origData[i + 2] / Math.max(bgData[i + 2], 1)) * 240;
  
        let lum = 0.299 * r + 0.587 * g + 0.114 * b;
        let isSkinOrPhoto = (r > g && g > b && (r - b) > 12 && lum > 50 && lum < 210);
  
        if (isSkinOrPhoto && filterMode !== 'magic_bw') {
          r = Math.min(255, Math.max(0, (origData[i] - 128) * 1.1 + 128));
          g = Math.min(255, Math.max(0, (origData[i + 1] - 128) * 1.1 + 128));
          b = Math.min(255, Math.max(0, (origData[i + 2] - 128) * 1.1 + 128));
        } else {
          if (filterMode === 'magic_bw') {
            let finalGray = 0.299 * r + 0.587 * g + 0.114 * b;
            if (finalGray > 170) finalGray = 255;
            else finalGray = Math.max(0, finalGray * 0.6);
            r = g = b = finalGray;
          } else {
            if (lum > 195) { r = 255; g = 255; b = 255; }
            else if (lum < 115) {
              let darkFactor = Math.pow((115 - lum) / 115, 0.4);
              let newL = lum * (1 - darkFactor * 0.99);
              r = newL; g = newL; b = newL;
            } else {
              r = lum * 0.92; g = lum * 0.92; b = lum * 0.92;
            }
          }
        }
  
        outData[i] = Math.max(0, Math.min(255, r));
        outData[i + 1] = Math.max(0, Math.min(255, g));
        outData[i + 2] = Math.max(0, Math.min(255, b));
        outData[i + 3] = origData[i + 3];
      }
  
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = w;
      tempCanvas.height = h;
      const tCtx = tempCanvas.getContext('2d');
      tCtx.putImageData(new ImageData(outData, w, h), 0, 0);
  
      const sharpCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
      const sData = sharpCtx.getImageData(0, 0, w, h).data;
      const finalData = new Uint8ClampedArray(sData);
      const w4 = w * 4;
      const amount = 0.7;
      const center = 1 + 4 * amount;
      const side = -amount;
  
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const i = y * w4 + x * 4;
          for (let c = 0; c < 3; c++) {
            let val = sData[i + c] * center
              + sData[i - w4 + c] * side
              + sData[i + w4 + c] * side
              + sData[i - 4 + c] * side
              + sData[i + 4 + c] * side;
            finalData[i + c] = Math.max(0, Math.min(255, val));
          }
        }
      }
  
      ctx.putImageData(new ImageData(finalData, w, h), 0, 0);
      callback(canvas.toDataURL('image/jpeg', 0.95));
    }
  };