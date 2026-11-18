// Yahan apna Google Apps Script ka URL paste karein
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxapM-VKnpAkL-lIGJhYG5i1yskVDI07VhCZ9173R18_C24wIIjqwOjijfHMnKEHJqo/exec';

export const trackUserAction = (eventType, moduleName, format = 'N/A') => {
  // 🔥 FIX: Updated Device_Type logic - checks both User-Agent AND Screen Width for max accuracy
  const isMobile = typeof window !== 'undefined' && 
    (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth <= 768) 
    ? 'Mobile' : 'Desktop';
  
  const formData = new URLSearchParams();
  formData.append('Event_Type', eventType);
  formData.append('Module_Name', moduleName);
  formData.append('Format', format);
  formData.append('Device_Type', isMobile);

  try {
    // Fire and forget - isse app ki speed slow nahi hogi (no await)
    fetch(SCRIPT_URL, { 
        method: 'POST', 
        body: formData,
        mode: 'no-cors' // Yeh zaroori hai Google sheet POST ke liye
    }).catch(() => {}); // Catch unhandled promise rejections silently
  } catch (e) {
    // Silently ignore to keep console clean
  }
};

export const fetchTotalActions = async () => {
    try {
        const response = await fetch(SCRIPT_URL);
        
        // 🔥 FIX: Pehle check karo ki response exactly JSON format mein aaya hai ya nahi
        const contentType = response.headers.get("content-type");
        
        if (response.ok && contentType && contentType.includes("application/json")) {
            const data = await response.json();
            return data.total_actions || 0;
        } else {
            // Agar Google ne JSON ke bajaye HTML login/error page bheja hai, 
            // toh bina console mein laal error phenke chup-chap 0 return kardo.
            return 0; 
        }
    } catch (e) {
        // Network error aane par bhi console ganda nahi hoga
        return 0;
    }
};