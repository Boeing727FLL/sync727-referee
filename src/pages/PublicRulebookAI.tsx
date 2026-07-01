import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Bot, User, Loader2, X, FileText, Camera, Radio, Gavel, BookOpen, Zap, Search, Eye, Scale, History, Upload as UploadIcon } from 'lucide-react';
import { doc, onSnapshot, updateDoc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { GeminiService, convertPdfToImages } from '../services/geminiService';
import { s3Client, R2_BUCKET_NAME, getPublicUrl } from '../lib/r2';
import { Upload } from '@aws-sdk/lib-storage';
import { ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAuth } from '../hooks/useAuth';
import ConfirmationModal from '../components/ConfirmationModal';

export default function PublicRulebookAI() {
  const { connectDrive, user, logout } = useAuth();
  
  // Local state to check if user has google access token, since PublicRulebookAI might be used without full login
  // Actually, we can just check localStorage for 'google_access_token' or URL bypass params directly to show/hide the overlay
  const [hasGoogleToken, setHasGoogleToken] = useState<boolean>(() => {
    return !!localStorage.getItem('google_access_token') || 
      window.location.search.includes('verify=true') || 
      window.location.search.includes('bypass=true') || 
      window.location.search.includes('google=true');
  });
  const [loginError, setLoginError] = useState<string | null>(null);
  const [showIntro, setShowIntro] = useState<boolean>(true);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState<boolean>(false);
  const [deviceType, setDeviceType] = useState<'mobile' | 'desktop' | 'tablet'>(() => {
    if (typeof navigator !== 'undefined') {
      const ua = navigator.userAgent;
      if (/Mobi|Android|iPhone|iPad|iPod/i.test(ua)) {
        if (/iPad|tablet/i.test(ua)) {
          return 'tablet';
        }
        return 'mobile';
      }
    }
    return 'desktop';
  });

  useEffect(() => {
    const checkDevice = () => {
      const ua = navigator.userAgent;
      if (/Mobi|Android|iPhone|iPad|iPod/i.test(ua)) {
        if (/iPad|tablet/i.test(ua)) {
          setDeviceType('tablet');
        } else {
          setDeviceType('mobile');
        }
      } else {
        setDeviceType('desktop');
      }
    };
    checkDevice();
    window.addEventListener('resize', checkDevice);
    return () => window.removeEventListener('resize', checkDevice);
  }, []);
  
  useEffect(() => {
    // --- Aggressive Auto-Update/Auto-Refresh Logic ---
    const checkForUpdates = async () => {
      try {
        // Skip in dev mode
        if (process.env.NODE_ENV === 'development') return;

        const response = await fetch(`/version.json?t=${Date.now()}`, {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          }
        });
        
        if (!response.ok) return;
        const data = await response.json();
        const serverVersion = data.version;

        let runningVersion = '';
        try {
          // @ts-ignore
          if (typeof __APP_VERSION__ !== 'undefined') {
            // @ts-ignore
            runningVersion = __APP_VERSION__;
          }
        } catch (e) {}

        if (serverVersion && runningVersion && serverVersion !== runningVersion) {
          console.log(`[VersionCheck] Stale version detected! Server: ${serverVersion} | Running: ${runningVersion}`);
          
          const lastForceReload = sessionStorage.getItem('pwa_force_reload_at');
          const now = Date.now();
          
          if (!lastForceReload || (now - parseInt(lastForceReload) > 30000)) {
            sessionStorage.setItem('pwa_force_reload_at', now.toString());
            
            // Hard clean-up
            if ('caches' in window) {
              const keys = await caches.keys();
              await Promise.all(keys.map(key => caches.delete(key)));
            }

            if ('serviceWorker' in navigator) {
              const regs = await navigator.serviceWorker.getRegistrations();
              for (const reg of regs) {
                await reg.update();
              }
            }

            // Force reload with cache-busting param
            const url = new URL(window.location.href);
            url.searchParams.set('reload', serverVersion);
            window.location.replace(url.toString());
          }
        }
      } catch (err) {
        // Silent
      }
    };

    // Initial check
    setTimeout(checkForUpdates, 5000);
    // Recurring check every 30 seconds
    const updateCheckInterval = setInterval(checkForUpdates, 30000);
    // Check when user returns to tab
    window.addEventListener('focus', checkForUpdates);

    return () => {
      clearInterval(updateCheckInterval);
      window.removeEventListener('focus', checkForUpdates);
    };
  }, []);

  const handleGoogleLogin = async () => {
    setLoginError(null);
    const res = await connectDrive();
    if (res.success || localStorage.getItem('google_access_token')) {
      setHasGoogleToken(true);
      setShowIntro(false);
    } else if (res.error) {
      setLoginError(res.error);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch (err) {}
    localStorage.removeItem('google_access_token');
    setHasGoogleToken(false);
    setShowLogoutConfirm(false);
  };
  const [messages, setMessages] = useState<{ role: 'user' | 'model', text: string, files?: { url: string, key: string, name?: string, base64?: string }[] }[]>([
    { role: 'model', text: 'שלום! אני השופט הווירטואלי. אני מכיר את חוקי עונת Submerged. איך אני יכול לעזור?' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeRulebookFiles, setActiveRulebookFiles] = useState<{ name: string, url: string }[]>([]);
  const [seasonName, setSeasonName] = useState<string>('SUBMERGED');
  const [selectedModel, setSelectedModel] = useState<'gemma'>('gemma');
  const [pendingFiles, setPendingFiles] = useState<{ url: string, key: string, base64?: string, actualFile?: File }[]>([]);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [isLearning, setIsLearning] = useState(true);
  const [adminClickCount, setAdminClickCount] = useState(0);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const originalTitle = document.title;
    let originalFavicon = '';
    const faviconElement = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
    
    if (faviconElement) {
      originalFavicon = faviconElement.href;
      // Change to a bot/gavel SVG icon
      faviconElement.href = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%233b82f6' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='11' width='18' height='10' rx='2'/%3E%3Ccircle cx='12' cy='5' r='2'/%3E%3Cpath d='M12 7v4'/%3E%3Cline x1='8' y1='16' x2='8' y2='16'/%3E%3Cline x1='16' y1='16' x2='16' y2='16'/%3E%3C/svg%3E";
    }
    
    document.title = 'שופט וירטואלי | FIRST Israel';

    return () => {
      document.title = originalTitle;
      if (faviconElement && originalFavicon) {
        faviconElement.href = originalFavicon;
      }
    };
  }, []);

  useEffect(() => {
    if (adminClickCount >= 10) {
      setShowAdmin(true);
      setAdminClickCount(0); // Reset after unlocking
    }
  }, [adminClickCount]);

  const handleTitleClick = () => {
    if (!showAdmin) {
      setAdminClickCount(prev => prev + 1);
    }
  };

  useEffect(() => {
    if (activeRulebookFiles.length > 0) {
      setIsLearning(true);
      // Removed local/proxy indexing - using official Gemini with direct context
      setTimeout(() => setIsLearning(false), 1500);
    }
  }, [activeRulebookFiles]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  useEffect(() => {
    const unsubSettings = onSnapshot(doc(db, 'app_config', 'rulebook'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.current_season && data.current_season !== seasonName) {
          setSeasonName(data.current_season);
          setMessages(prev => {
            const newMessages = [...prev];
            if (newMessages.length > 0 && newMessages[0].role === 'model') {
              newMessages[0].text = `שלום! אני השופט הווירטואלי. אני מכיר את חוקי עונת ${data.current_season}. איך אני יכול לעזור?`;
            }
            return newMessages;
          });
        }
        fetchLatestRulebook();
      } else {
        fetchLatestRulebook();
      }
    });

    return () => unsubSettings();
  }, [seasonName]);

  const handleRobotImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    if (pendingFiles.length + files.length > 10) {
      alert('ניתן להעלות עד 10 קבצים בו זמנית.');
      return;
    }

    setIsProcessingImage(true);

    try {
      const newFiles: { url: string, key: string, base64?: string, actualFile?: File }[] = [];
      
      for (const file of files as File[]) {
        // Convert to base64 for preview and fallback (direct AI vision processing local)
        const base64data = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
        
        // Use local object URL for preview instead of R2 URL
        const localUrl = URL.createObjectURL(file);
        newFiles.push({ 
          url: localUrl, 
          key: `local_${Date.now()}_${file.name}`, // Dummy key for internal tracking
          base64: base64data,
          actualFile: file
        });
      }
      
      setPendingFiles(prev => [...prev, ...newFiles]);
    } catch (error: any) {
      console.error('Local file processing error:', error);
      alert('שגיאה בעיבוד הקבצים: ' + error.message);
    } finally {
      setIsProcessingImage(false);
      if (cameraInputRef.current) cameraInputRef.current.value = '';
    }
  };

  const fetchLatestRulebook = async () => {
    try {
      let files = [];
      try {
        const command = new ListObjectsV2Command({
          Bucket: R2_BUCKET_NAME,
          Prefix: 'fll-rules/',
        });
        const response = await s3Client.send(command);
        files = response.Contents || [];
      } catch (apiErr) {
        console.error("Direct R2 client list failed:", apiErr);
      }

      if (files.length > 0) {
        const relevantFiles = files.filter((f: any) => 
          f.Key && f.Key !== 'fll-rules/'
        ).sort((a: any, b: any) => (new Date(b.LastModified).getTime() || 0) - (new Date(a.LastModified).getTime() || 0));
        
        const filesToLoad = relevantFiles.slice(0, 5);
        
        const loadedFiles: { name: string, url: string }[] = [];

        for (const file of filesToLoad) {
           if (!file.Key) continue;
           const fileName = file.Key.replace('fll-rules/', '');
           const fileUrl = getPublicUrl(file.Key);
           
           loadedFiles.push({
             name: fileName,
             url: fileUrl
           });
        }
        
        setActiveRulebookFiles(loadedFiles);
      } else {
        setIsLearning(false);
      }
    } catch (err) {
      console.error("Failed to fetch rulebook:", err);
      setIsLearning(false);
    }
  };

  const extractSeasonFromFilename = (filename: string): string => {
    const str = filename.toLowerCase();
    
    if (str.includes('submerged') || str.includes('2024')) return 'SUBMERGED';
    if (str.includes('unearthed') || str.includes('unearth') || str.includes('2025')) return 'UNEARTHED';
    if (str.includes('masterpiece') || str.includes('mustrpiece') || str.includes('master') || str.includes('2023')) return 'MASTERPIECE';
    if (str.includes('superpowered') || str.includes('super power') || str.includes('2022')) return 'SUPERPOWERED';
    if (str.includes('cargoconnect') || str.includes('cargo connect') || str.includes('2021')) return 'CARGO_CONNECT';
    if (str.includes('replay') || str.includes('re-play') || str.includes('2020')) return 'REPLAY';
    if (str.includes('cityshaper') || str.includes('city shaper') || str.includes('2019')) return 'CITY_SHAPER';
    if (str.includes('intoorbit') || str.includes('into orbit') || str.includes('2018')) return 'INTO_ORBIT';

    const match = str.match(/fll[_-]?(?:challenge[_-])?([a-z]+)[_-]/);
    if (match && match[1] && match[1] !== 'challenge' && match[1] !== 'robot') {
      return match[1].toUpperCase();
    }
    return 'UNKNOWN';
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadProgress(0);
    try {
      const fileName = `fll-rules/${file.name}`;
      
      const upload = new Upload({
        client: s3Client,
        params: {
          Bucket: R2_BUCKET_NAME,
          Key: fileName,
          Body: file,
          ContentType: file.type || 'text/plain',
        },
      });

      upload.on("httpUploadProgress", (progress) => {
        if (progress.total) {
          const percent = Math.round((progress.loaded / progress.total) * 100);
          setUploadProgress(percent);
        }
      });

      await upload.done();
      
      // Close modal immediately after file is uploaded so user isn't stuck
      setShowUploadModal(false);
      setUploading(false);
      setUploadProgress(0);

      const fileUrl = getPublicUrl(fileName);

      const extractedSeason = extractSeasonFromFilename(fileName);
      const isNewSeason = extractedSeason !== "UNKNOWN" && extractedSeason !== seasonName;
      const seasonToStore = extractedSeason !== "UNKNOWN" ? extractedSeason : seasonName;

      try {
        await updateDoc(doc(db, 'app_config', 'rulebook'), {
          current_season: seasonToStore,
          last_updated: Date.now()
        });
      } catch (e) {
        console.warn("Firestore sync update failed:", e);
      }

      // If a new season is detected, clear the old rulebooks
      if (isNewSeason) {
        console.log(`New season detected: ${seasonToStore}. Clearing old rules for ${seasonName}...`);
        
        try {
          const command = new ListObjectsV2Command({
            Bucket: R2_BUCKET_NAME,
            Prefix: 'fll-rules', // Match all: fll-rules/, fll-rules-images/, fll-rules-text/
          });
          const listResponse = await s3Client.send(command);
          if (listResponse.Contents && listResponse.Contents.length > 0) {
            const objectsToDelete = listResponse.Contents
              .filter((f: any) => f.Key && f.Key !== fileName && !f.Key.startsWith(`fll-rules-images/${file.name}/`) && f.Key !== `fll-rules-text/${file.name}.txt` && f.Key !== 'fll-rules/')
              .map((f: any) => ({ Key: f.Key }));
              
            if (objectsToDelete.length > 0) {
              const deleteCommand = new DeleteObjectsCommand({
                Bucket: R2_BUCKET_NAME,
                Delete: { Objects: objectsToDelete.slice(0, 1000) }
              });
              await s3Client.send(deleteCommand);
              console.log("Old rules cleared successfully.");
            }
          }
        } catch (e) {
          console.error("Failed to clear old rules:", e);
        }
      }

      setMessages(prev => [...prev, { role: 'model', text: `קובץ חוקים חדש (${file.name}) התקבל. זוהתה עונת ${seasonToStore !== "UNKNOWN" ? seasonToStore : "חדשה"}. מתחיל תהליך עיבוד (0%)...`, isProgress: true }]);

      // Process PDF on upload
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        try {
          let imagesExist = false;
          try {
            const listCmd = new ListObjectsV2Command({
               Bucket: R2_BUCKET_NAME,
               Prefix: `fll-rules-images/${file.name}/`,
               MaxKeys: 1
            });
            const listRes = await s3Client.send(listCmd);
            if (listRes.Contents && listRes.Contents.length > 0) {
               imagesExist = true;
            }
          } catch(e) {}

          if (!imagesExist) {
            const pageImages = await convertPdfToImages(file);
            for (let i = 0; i < pageImages.length; i++) {
              const pageImg = pageImages[i];
              const imgKey = `fll-rules-images/${file.name}/page_${i+1}.jpg`;
              const imgUpload = new Upload({
                client: s3Client,
                params: {
                  Bucket: R2_BUCKET_NAME,
                  Key: imgKey,
                  Body: pageImg.data,
                  ContentType: 'image/jpeg',
                },
              });
              await imgUpload.done();
              const pct = Math.round(((i + 1) / pageImages.length) * 100);
              setUploadProgress(pct);
              setMessages(prev => {
                const newMsgs = [...prev];
                if (newMsgs.length > 0 && (newMsgs[newMsgs.length - 1] as any).isProgress) {
                  newMsgs[newMsgs.length - 1] = { ...newMsgs[newMsgs.length - 1], text: `ממיר דפי PDF לתמונות לשימוש שאר המכשירים... (${pct}%)` };
                }
                return newMsgs;
              });
            }
          } else {
             setMessages(prev => {
               const newMsgs = [...prev];
               if (newMsgs.length > 0 && (newMsgs[newMsgs.length - 1] as any).isProgress) {
                 newMsgs[newMsgs.length - 1] = { ...newMsgs[newMsgs.length - 1], text: `תמונות PDF זוהו בענן, מדלג על המרה...` };
               }
               return newMsgs;
             });
          }
        } catch (e) {
          console.error("Failed to process PDF on upload", e);
        }
      }
      
      setIsLearning(true);
      
      setTimeout(async () => {
        await fetchLatestRulebook(); 
        setIsLearning(false);
        setMessages(prev => {
          const newMsgs = [...prev];
          if (newMsgs.length > 0 && (newMsgs[newMsgs.length - 1] as any).isProgress) {
            newMsgs[newMsgs.length - 1] = { ...newMsgs[newMsgs.length - 1], text: 'למדתי את העדכונים מקובץ החוקים! המידע נשמר בענן ומוכן לשימוש מכל מכשיר.' };
            delete (newMsgs[newMsgs.length - 1] as any).isProgress;
          } else {
            newMsgs.push({ role: 'model', text: 'למדתי את העדכונים מקובץ החוקים! המידע נשמר בענן ומוכן לשימוש מכל מכשיר.' });
          }
          return newMsgs;
        });
      }, 2000);

    } catch (error: any) {
      console.error('Upload error:', error);
      alert('שגיאה בהעלאת הקובץ: ' + error.message);
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleSend = async (textOverride?: string) => {
    const textToSend = textOverride || input;
    
    if ((!textToSend.trim() && pendingFiles.length === 0) || loading) return;

    const userMessage = textToSend.trim();
    const filesToSend = [...pendingFiles];
    
    setInput('');
    setPendingFiles([]);
    
    setMessages(prev => [
      ...prev, 
      { 
        role: 'user', 
        text: userMessage || (filesToSend.length > 0 ? '📷 שלח קבצים לבדיקה' : ''),
        files: filesToSend.length > 0 ? filesToSend : undefined
      }
    ]);
    
    setLoading(true);

    try {
      let finalPrompt = userMessage;
      
      if (filesToSend.length > 0 && !userMessage) {
        finalPrompt = "אנא התבונן בקבצים אלו בעיון רב. שים לב לכל הפרטים: אובייקטים, צבעים, דגלים, מיקומים על המגרש, ומה נמצא בתוך מה. זהה במדויק איזו משימה או מצב מגרש מוצגים ונתח אותם בהקשר של חוקי FLL.";
      }
      
      let isFirstChunk = true;
      
      const response = await GeminiService.askRulebook(
        finalPrompt, 
        messages, 
        activeRulebookFiles,
        seasonName, 
        filesToSend,
        'gemma-4-31b-it',
        (chunkText) => {
          setMessages(prev => {
            const newMessages = [...prev];
            if (isFirstChunk) {
              newMessages.push({ role: 'model', text: chunkText });
              isFirstChunk = false;
            } else {
              const lastMsgIndex = newMessages.length - 1;
              if (newMessages[lastMsgIndex].role === 'model') {
                newMessages[lastMsgIndex] = {
                  ...newMessages[lastMsgIndex],
                  text: newMessages[lastMsgIndex].text + chunkText
                };
              }
            }
            return newMessages;
          });
        }
      );
      
      if (isFirstChunk) {
          // If we got here and isFirstChunk is still true, we didn't get any chunks via callback but we might have a full response
          setMessages(prev => [...prev, { role: 'model', text: response || 'שגיאת תקשורת. אנא נסה שוב.' }]);
      }

      // Revoke local object URLs to free memory
      filesToSend.forEach(file => {
        if (file.url.startsWith('blob:')) {
          URL.revokeObjectURL(file.url);
        }
      });
    } catch (error: any) {
      const errMsg = error?.message || 'אבד הקשר. נסה שוב מאוחר יותר.';
      setMessages(prev => [...prev, { role: 'model', text: errMsg }]);
    } finally {
      setLoading(false);
    }
  };

  const quickQuestions = [
    "האם מותר לרובוט להתרחב?",
    "מה הניקוד למשימה 1?",
    "מה העונש על נגיעה ברובוט?",
    "חוקי אזור השיגור"
  ];

  const playWhistleSound = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      const osc1 = audioCtx.createOscillator();
      const osc2 = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(2150, audioCtx.currentTime);
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(2200, audioCtx.currentTime);
      
      const modulator = audioCtx.createOscillator();
      const modulatorGain = audioCtx.createGain();
      modulator.frequency.setValueAtTime(45, audioCtx.currentTime); // Vibrato
      modulatorGain.gain.setValueAtTime(90, audioCtx.currentTime);
      
      modulator.connect(modulatorGain);
      modulatorGain.connect(osc1.frequency);
      modulatorGain.connect(osc2.frequency);
      
      osc1.connect(gainNode);
      osc2.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      
      gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.35, audioCtx.currentTime + 0.04);
      gainNode.gain.setValueAtTime(0.35, audioCtx.currentTime + 0.12);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
      
      modulator.start();
      osc1.start();
      osc2.start();
      
      setTimeout(() => {
        try {
          osc1.stop();
          osc2.stop();
          modulator.stop();
          audioCtx.close();
        } catch (err) {}
      }, 450);
    } catch (e) {
      console.warn("AudioContext whistle failed:", e);
    }
  };

  const handleWhistleBlow = () => {
    playWhistleSound();
    const refereeTips = [
      "📋 **הנחיית שופט ראשי:** רוח ספורטיבית (Gracious Professionalism) קודמת לכל הישג! כבדו את חבריכם ואת קבוצות היריב.",
      "⏱️ **חוקי הזירה:** ברגע שהגעתם לשולחן, יש לכם בדיוק 2:30 דקות להפעיל את כל המשימות שתרגלתם. בהצלחה!",
      "⚙️ **טיפ מקצועי:** זכרו, אם הרובוט יוצא מאזור הבית או משתבש במרכז המגרש - החזרתו לבית באקט ידני תגרור סימון עונש (דיסק משימה פנוי שעובר למשבצת העונשים).",
      "📏 **חוקי המבנה:** כל הציוד שלכם (כולל רובוט, אביזרים חלופיים וחלקי חילוף) חייב להיכנס במלואו לתחום אזור הבית או אזור השיגור קודם תחילת המקצה!",
      "🎯 **הוגנות השיפוט:** החלטתו של השופט הראשי בזירה היא סופית ומחייבת, אך אנו תמיד זמינים להסביר בסבלנות ובחיוך בגמר המקצה."
    ];
    const quote = refereeTips[Math.floor(Math.random() * refereeTips.length)];
    setMessages(prev => [
      ...prev,
      {
        role: 'model',
        text: `😗💨🎵 *שריקה חדה מהזירה!* \n\n${quote}`
      }
    ]);
  };

  const RefereeIcon = () => (
    <Gavel className="w-5 h-5 md:w-6 md:h-6 text-slate-950" />
  );


  return (
    <div className="h-screen h-[100dvh] w-full flex flex-col bg-white overflow-hidden relative font-sans" dir="rtl">
      
      {/* Referee Ribbon */}
      <div className="h-3.5 bg-[repeating-linear-gradient(45deg,#000000,#000000_15px,#ffffff_15px,#ffffff_30px)] border-b border-slate-950 w-full shrink-0 relative">
        <div className="absolute inset-0 bg-yellow-400/20 mix-blend-multiply pointer-events-none" />
      </div>

      {/* Header */}
      <div className="p-3 md:p-4 border-b-2 border-slate-950 bg-amber-50 flex items-center justify-between z-10 shadow-sm">
        <div className="flex items-center gap-2 md:gap-3">
          <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-slate-950 flex items-center justify-center shrink-0 shadow-md p-1 relative overflow-hidden">
            <div className="absolute inset-0 bg-[repeating-linear-gradient(0deg,#000,#000_4px,#fff_4px,#fff_8px)] opacity-20" />
            <div className="w-full h-full bg-yellow-400 rounded-lg flex items-center justify-center z-10 border border-slate-950/20">
              <RefereeIcon />
            </div>
          </div>
          <div className="min-w-0">
            <h1 onClick={handleTitleClick} className="text-sm md:text-xl font-black text-slate-900 flex items-center gap-1 md:gap-2 tracking-tight cursor-default select-none">
              שופט זירה ראשי <span className="text-xs bg-slate-900 text-yellow-400 px-2 py-0.5 rounded-full font-extrabold uppercase animate-pulse border border-yellow-400">Head Referee</span>
            </h1>
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5 md:gap-2 text-[10px] md:text-xs font-bold text-slate-700">
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 border border-slate-950 ${isLearning ? 'bg-yellow-400 animate-bounce' : 'bg-emerald-500'}`} />
                <span className="text-[9px] md:text-[10px] font-black text-slate-950 uppercase tracking-wide bg-yellow-400 px-2 py-0.5 rounded border-2 border-slate-950 shadow-[1px_1px_0px_#000]">
                  צוות שיפוט רשמי
                </span>
                <span className="truncate pr-1 pr-2 font-black text-slate-950 border-r border-slate-300">
                  {isLearning ? 'מעדכן נתונים...' : `עונת ${seasonName} ⏱️`}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Enhanced Boeing 727 Credit - More Prominent */}
          <div className="flex items-center gap-2 md:gap-3 px-2 md:px-4 py-1.5 bg-white/80 rounded-xl border-2 border-slate-950 mr-1 md:mr-3 group hover:bg-white hover:border-red-600 transition-all duration-300 shadow-[2px_2px_0px_#000]">
            <img src="/boeing_727_logo_transparent_pure_red (1).png" alt="Boeing 727" className="h-6 md:h-9 w-auto object-contain group-hover:scale-110 transition-transform" />
            <div className="hidden sm:flex flex-col leading-none">
              <span className="text-[8px] md:text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Developed By</span>
              <span className="text-xs md:text-sm font-black text-slate-950 italic">Boeing <span className="text-red-600">727</span></span>
            </div>
          </div>

          <div className="flex items-center gap-3 ml-2 md:ml-4 pl-2 md:pl-4 border-l border-slate-300">
            {hasGoogleToken ? (
              user ? (
                <div className="flex items-center gap-2 md:gap-3">
                  <div className="flex flex-col items-end">
                    <span className="text-xs font-black text-slate-900 max-w-[120px] truncate">{user.name}</span>
                    <button 
                      onClick={() => setShowLogoutConfirm(true)} 
                      className="text-[10px] text-red-600 font-black hover:text-red-800 hover:underline cursor-pointer transition-colors"
                    >
                      התנתק 🚪
                    </button>
                  </div>
                  <img 
                    src={user.picture || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=random`} 
                    alt={user.name} 
                    className="w-8 h-8 rounded-full border-2 border-slate-950 shadow-[1px_1px_0px_rgba(0,0,0,1)]" 
                  />
                </div>
              ) : (
                <button 
                  onClick={() => setShowLogoutConfirm(true)} 
                  className="text-xs bg-red-50 text-red-600 border-2 border-red-200 hover:bg-red-100 font-black px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                >
                  התנתק 🚪
                </button>
              )
            ) : (
              <button 
                onClick={handleGoogleLogin} 
                className="text-[11px] md:text-xs bg-yellow-400 hover:bg-yellow-300 text-slate-950 border-2 border-slate-950 font-black px-2.5 py-1.5 rounded-lg transition-all shadow-[1px_1px_0px_rgba(0,0,0,1)] active:scale-95 cursor-pointer flex items-center gap-1"
              >
                <span>התחברות 🔑</span>
              </button>
            )}
          </div>
          {showAdmin && (
            <button 
              onClick={() => setShowUploadModal(true)}
              className="p-2 bg-white text-slate-900 border-2 border-slate-950 hover:bg-yellow-400 rounded-lg transition-all shadow-[1px_1px_0px_rgba(0,0,0,1)]"
              title="העלה חוקים"
            >
              <UploadIcon className="w-4 h-4 md:w-5 md:h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Chat Area - Green field canvas background */}
      <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 md:space-y-8 bg-[#f5fbf7] bg-[radial-gradient(#bedec6_1.5px,transparent_1.5px)] bg-[size:32px_32px] border-b border-slate-200 scroll-smooth" ref={scrollRef}>
        
        {/* Arena Warning Watermark Banner */}
        <div className="rounded-2xl border-2 border-dashed border-emerald-400/50 bg-emerald-500/5 p-4 text-center select-none">
          <div className="text-xs font-black text-emerald-800 tracking-wider">שולחן המקצה הציבורי - זירת FLL</div>
          <p className="text-[10px] text-emerald-600 font-bold mt-1">כל השאלות והתשובות מסתמכות על חוקי עונת {seasonName}</p>
        </div>

        {messages.map((msg, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
          >
            {/* Referee or User Avatar Badge */}
            <div className={`w-9 h-9 md:w-11 md:h-11 rounded-xl flex items-center justify-center shrink-0 border-2 border-slate-950 shadow-[1px_1px_0px_#000] relative ${
              msg.role === 'user' 
                ? 'bg-slate-100 text-slate-800' 
                : 'bg-[repeating-linear-gradient(45deg,#000000,#000000_5px,#ffffff_5px,#ffffff_10px)]'
            }`}>
              {msg.role === 'user' ? (
                <User className="w-5 h-5 text-slate-850" />
              ) : (
                <div className="absolute inset-0.5 bg-yellow-400 rounded-[6px] border border-slate-950/20 flex items-center justify-center text-slate-950 text-xs font-black">
                  📢
                </div>
              )}
            </div>

            <div className={`flex flex-col gap-2 max-w-[85%] md:max-w-[75%]`}>
              <div className={`rounded-2xl p-4 md:p-5 shadow-[4px_4px_0px_rgba(0,0,0,1)] border-2 border-slate-950 relative overflow-hidden ${
                msg.role === 'user' 
                  ? 'bg-slate-900 text-white rounded-tr-none' 
                  : 'bg-white text-slate-900 rounded-tl-none before:absolute before:top-0 before:right-0 before:left-0 before:h-2 before:bg-[repeating-linear-gradient(-45deg,#000000,#000000_8px,#ffffff_8px,#ffffff_16px)] pt-6'
              }`}>
                
                {/* Referee Tag */}
                {msg.role !== 'user' && (
                  <div className="flex items-center gap-1 mb-2">
                    <span className="text-[10px] font-black tracking-tight text-slate-905 bg-yellow-400 border border-slate-950 px-2 py-0.5 rounded shadow-[1px_1px_0px_#000] flex items-center gap-1 uppercase">
                      📋 שופט ראשי
                    </span>
                    {msg.text.includes("שריקה") && (
                      <span className="text-[10px] font-black text-white bg-red-600 border border-slate-950 px-2 py-0.5 rounded shadow-[1px_1px_0px_#000]">
                        🚨 כרטיס שופט ראשי
                      </span>
                    )}
                  </div>
                )}

                {msg.files && msg.files.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-4 bg-black/5 p-2 rounded-2xl">
                    {msg.files.map((file, fIdx) => (
                      <div key={fIdx} className="relative w-20 h-20 md:w-32 md:h-32 group">
                    {(file.key.match(/\.(jpg|jpeg|png|gif|webp)/i) || file.url.match(/\.(jpg|jpeg|png|gif|webp)/i) || file.base64?.startsWith('data:image')) ? (
                       <img src={file.url} alt="Attached" className="w-full h-full object-cover rounded-xl shadow-md border-2 border-slate-950" />
                    ) : (
                       <div className="w-full h-full flex items-center justify-center bg-white rounded-xl border-2 border-slate-950 shadow-md">
                             <FileText className="w-8 h-8 text-slate-400" />
                           </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                
                <div className={`text-sm md:text-[17px] leading-relaxed ${msg.role === 'user' ? 'font-medium' : 'font-normal'}`}>
                  {msg.role === 'user' ? (
                    <div className="whitespace-pre-wrap">{msg.text}</div>
                  ) : (
                    <div className="prose prose-slate max-w-none prose-p:leading-relaxed prose-headings:font-black prose-a:text-blue-600 prose-strong:text-slate-900 prose-ul:list-disc prose-ol:list-decimal prose-li:my-1 rtl:text-right">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {msg.text}
                      </ReactMarkdown>
                    </div>
                  )}
                </div>
              </div>
              {msg.role === 'model' && idx > 0 && (
                <div className="flex items-center gap-4 px-2">
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(msg.text);
                      alert("התשובה הועתקה ללוח!");
                    }}
                    className="text-[10px] font-black text-slate-600 hover:text-red-600 transition-colors bg-white px-2 py-0.5 rounded border border-slate-300 shadow-[1px_1px_0px_rgba(0,0,0,1)]"
                  >
                    העתק החלטה
                  </button>
                  <button className="text-[10px] font-black text-slate-600 hover:text-green-600 transition-colors bg-white px-2 py-0.5 rounded border border-slate-300 shadow-[1px_1px_0px_rgba(0,0,0,1)]">
                    נקבע נכון! 👍
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        ))}
        
        {loading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-4">
            <div className="w-9 h-9 md:w-11 md:h-11 rounded-xl bg-[repeating-linear-gradient(45deg,#000000,#000000_5px,#ffffff_5px,#ffffff_10px)] flex items-center justify-center shrink-0 border-2 border-slate-950 shadow-[1px_1px_0px_#000]">
              <div className="w-7 h-7 bg-yellow-400 rounded-md border border-slate-950/25 flex items-center justify-center text-xs text-slate-950 font-black animate-spin">
                ⏱️
              </div>
            </div>
            <div className="bg-white border-2 border-slate-950 p-4 rounded-2xl rounded-tl-none shadow-[3px_3px_0px_rgba(0,0,0,1)] flex items-center gap-3">
              <div className="flex gap-1">
                <motion.div animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 1 }} className="w-2 h-2 bg-red-600 rounded-full border border-slate-950" />
                <motion.div animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} className="w-2 h-2 bg-yellow-400 rounded-full border border-slate-950" />
                <motion.div animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} className="w-2 h-2 bg-slate-950 rounded-full border border-white" />
              </div>
              <span className="text-xs font-black text-slate-900">השופט הראשי מעיין בסעיפי החוק...</span>
            </div>
          </motion.div>
        )}
      </div>

      {/* Quick Actions - Styled as tactical yellow strategy cards */}
      <div className="px-3 md:px-4 py-2 md:py-3 bg-amber-50/50 border-t-2 border-slate-950 overflow-x-auto flex gap-2 no-scrollbar">
        {quickQuestions.map((q, i) => (
          <button
            key={i}
            onClick={() => handleSend(q)}
            disabled={loading || isLearning}
            className="whitespace-nowrap px-4 py-2 bg-yellow-400 hover:bg-yellow-500 text-slate-950 border-2 border-slate-950 rounded-xl text-xs font-black shadow-[2px_2px_0px_rgba(0,0,0,1)] hover:shadow-[1px_1px_rgba(0,0,0,1)] hover:-translate-y-0.5 active:translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ⚠️ {q}
          </button>
        ))}
      </div>

      {/* Input Area */}
      <div className="p-3 md:p-4 bg-white border-t-2 border-slate-950 pb-safe">
        
        {/* Pending Files Preview */}
        <AnimatePresence>
          {pendingFiles.length > 0 && (
            <motion.div 
              initial={{ opacity: 0, y: 10, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, y: 10, height: 0 }}
              className="mb-2 md:mb-3 overflow-hidden"
            >
              <div className="flex flex-wrap items-center gap-2 md:gap-3 bg-slate-100 p-1.5 md:p-2 rounded-xl border-2 border-slate-950 w-fit">
                {pendingFiles.map((file, index) => (
                  <div key={index} className="relative group">
                    {(file.key.match(/\.(jpg|jpeg|png|gif|webp)/i) || file.url.match(/\.(jpg|jpeg|png|gif|webp)/i) || file.base64?.startsWith('data:image')) ? (
                      <img 
                        src={file.url} 
                        alt="Preview" 
                        className="h-12 w-12 md:h-16 md:w-16 object-cover rounded-lg border-2 border-slate-950 shadow-sm"
                      />
                    ) : (file.key.match(/\.(mp4|webm|mov|avi)/i) || file.url.match(/\.(mp4|webm|mov|avi)/i) || file.base64?.startsWith('data:video')) ? (
                      <div className="h-12 w-12 md:h-16 md:w-16 bg-slate-200 rounded-lg border-2 border-slate-950 shadow-sm flex items-center justify-center overflow-hidden">
                        <video src={file.url} className="h-full w-full object-cover" />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/20 text-white">
                          <Radio className="w-4 h-4 animate-pulse" />
                        </div>
                      </div>
                    ) : (
                      <div className="h-12 w-12 md:h-16 md:w-16 flex items-center justify-center bg-slate-200 rounded-lg border-2 border-slate-950 shadow-sm">
                        <FileText className="w-6 h-6 text-slate-500" />
                      </div>
                    )}
                    <button
                      onClick={() => setPendingFiles(prev => prev.filter((_, i) => i !== index))}
                      className="absolute -top-2 -right-2 bg-red-650 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm hover:bg-red-750 z-10 border border-slate-950"
                    >
                      <X className="w-3 h-3 md:w-4 md:h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex gap-2 md:gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder={isLearning ? "השופט חוקר חוקים וסרטים..." : pendingFiles.length > 0 ? "רשום הערה על הקובץ שהעלית..." : "שאל את השופט הראשי על משימה, חוק או תלונה (צרף תמונה להוכחה)..."}
            disabled={loading || isLearning}
            className="flex-1 bg-slate-50 border-2 border-slate-950 rounded-xl px-3 md:px-4 py-2.5 md:py-3 focus:outline-none focus:border-red-600 focus:ring-2 focus:ring-red-650/15 text-sm md:text-base text-slate-800 placeholder-slate-500 font-bold transition-all disabled:opacity-50"
          />
          
          {/* Attachment Button */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*,video/*,application/pdf,text/plain,.txt"
            multiple
            onChange={handleRobotImageUpload}
            className="hidden"
          />
          <div className="flex gap-1 md:gap-2">
            <button
              onClick={() => cameraInputRef.current?.click()}
              disabled={loading || isProcessingImage || isLearning}
              className="bg-yellow-400 hover:bg-yellow-500 text-slate-950 p-2.5 md:p-3 rounded-xl transition-all disabled:opacity-50 flex flex-col items-center justify-center shrink-0 min-w-[50px] md:min-w-[65px] border-2 border-slate-950 shadow-[2px_2px_0px_rgba(0,0,0,1)] active:scale-95 text-xs font-black disabled:cursor-not-allowed"
              title="העלה קובץ, מצלמה או סרטון"
            >
              {isProcessingImage ? (
                <Loader2 className="w-5 h-5 md:w-6 md:h-6 animate-spin" />
              ) : (
                <>
                  <Camera className="w-5 h-5 md:w-6 md:h-6" />
                  <span className="text-[9px] font-black mt-1 uppercase">צלם</span>
                </>
              )}
            </button>

            <button
              onClick={() => handleSend()}
              disabled={loading || isLearning || (!input.trim() && pendingFiles.length === 0)}
              className="bg-red-600 hover:bg-red-700 text-white p-2.5 md:p-3 rounded-xl transition-all disabled:opacity-50 flex items-center justify-center shadow-[2px_2px_0px_rgba(0,0,0,1)] border-2 border-slate-950 active:scale-95 active:translate-x-0.5 active:translate-y-0.5 shrink-0"
            >
              <Send className="w-5 h-5 md:w-6 md:h-6" />
            </button>
          </div>
        </div>
      </div>

      {/* Upload Modal */}
      <AnimatePresence>
        {showUploadModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 space-y-6"
            >
              <div className="text-center">
                <div className="w-16 h-16 bg-blue-600/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <UploadIcon className="w-8 h-8 text-blue-600" />
                </div>
                <h3 className="text-xl font-black text-slate-800">העלאת חוקים חדשים</h3>
                <p className="text-slate-500 text-sm mt-2">
                  העלה קובץ טקסט או PDF עם החוקים החדשים. ה-AI ילמד אותם מיד.
                </p>
              </div>

              <div 
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-200 rounded-2xl p-8 flex flex-col items-center justify-center gap-4 cursor-pointer hover:border-blue-600/50 hover:bg-blue-600/5 transition-all group"
              >
                <FileText className="w-10 h-10 text-slate-300 group-hover:text-blue-600 transition-colors" />
                <span className="text-sm font-bold text-slate-400 group-hover:text-blue-600">לחץ לבחירת קובץ</span>
                <input 
                  ref={fileInputRef}
                  type="file" 
                  accept=".txt,.md,.json,.docx,.pdf,application/pdf"
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </div>

              {uploading && (
                <div className="w-full space-y-2">
                  <div className="flex justify-between text-xs font-bold text-slate-500">
                    <span>מעלה ומעבד...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-blue-600 transition-all duration-300 ease-out"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              <button 
                onClick={() => setShowUploadModal(false)}
                className="w-full py-3 rounded-xl bg-slate-100 text-slate-500 font-bold hover:bg-slate-200 transition-colors"
              >
                ביטול
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showIntro && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 md:p-6 overflow-y-auto"
            dir="rtl"
          >
            <AnimatePresence mode="wait">
              {showIntro ? (
                <motion.div
                  key="intro"
                  initial={{ opacity: 0, scale: 0.95, y: 15 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -15 }}
                  transition={{ duration: 0.3 }}
                  className="bg-slate-900 border-2 border-slate-800 shadow-[0_0_30px_rgba(250,204,21,0.05)] rounded-3xl max-w-lg w-full text-center relative overflow-hidden my-auto"
                >
                  <div className="h-2 bg-yellow-400 w-full" />
                  
                  {/* Premium Credit Header */}
                  <div className="bg-slate-950/80 border-b border-slate-800/50 px-6 py-5 flex items-center justify-center gap-5 group hover:bg-slate-950 transition-all duration-500">
                    <img 
                      src="/boeing_727_logo_transparent_pure_red (1).png" 
                      alt="Boeing 727" 
                      className="h-12 md:h-14 w-auto object-contain drop-shadow-[0_0_20px_rgba(239,68,68,0.3)] group-hover:scale-110 transition-transform duration-500" 
                    />
                    <div className="h-10 w-[2px] bg-gradient-to-b from-transparent via-slate-700 to-transparent" />
                    <div className="flex flex-col items-start leading-none">
                      <div className="flex items-center gap-2">
                        <span className="text-white font-black tracking-tighter text-2xl italic group-hover:text-primary transition-colors duration-500">Boeing <span className="text-primary not-italic">727</span></span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <span className="text-[10px] text-slate-400 font-black uppercase tracking-[0.5em]">The Team</span>
                        <div className="w-1 h-1 bg-primary rounded-full animate-pulse" />
                      </div>
                    </div>
                  </div>

                  <div className="p-6 md:p-8">
                    {/* Digital Assistant Badge */}
                    <span className="inline-block bg-slate-950 text-yellow-400 text-[10px] font-black px-4 py-1.5 rounded-full uppercase tracking-[0.2em] mb-6 border border-yellow-400/30 shadow-[0_0_15px_rgba(250,204,21,0.05)]">
                      Digital Referee Assistant • FIRST Israel
                    </span>
                    
                    <h2 className="text-4xl md:text-5xl font-black text-white mb-3 tracking-tighter italic uppercase">שופט זירה וירטואלי</h2>
                    
                    <p className="text-slate-400 text-sm md:text-base font-medium mb-8 max-w-lg mx-auto leading-relaxed">
                      מערכת בינה מלאכותית מתקדמת שנבנתה במיוחד עבור קהילת <span className="text-yellow-400 font-extrabold">FIRST ישראל</span> על ידי קבוצת <span className="text-white font-bold italic">Boeing <span className="text-primary not-italic">727</span></span>. 
                      הפרויקט נולד מתוך רצון לתרום לקהילה, להנגיש את חוקי המשחק המורכבים בזמן אמת ולאפשר לכל קבוצה להגיע למצוינות מקצועית דרך ניתוח מצבים מדויק, פתרון קונפליקטים וקבלת החלטות מבוססת נתונים.
                    </p>

                    {/* Features Container */}
                    <div className="space-y-4 text-right mb-10">
                      <div className="p-5 bg-slate-950/60 rounded-3xl border border-slate-800/80 flex items-start gap-5 hover:border-yellow-400/40 transition-all duration-300 group hover:bg-slate-900/60 hover:-translate-y-1 shadow-xl">
                        <div className="p-3 bg-yellow-400/10 rounded-2xl text-yellow-400 group-hover:scale-110 group-hover:bg-yellow-400/20 transition-all duration-300 shadow-[0_0_20px_rgba(250,204,21,0.05)]">
                          <Scale className="w-7 h-7" />
                        </div>
                        <div>
                          <h4 className="text-base md:text-lg font-black text-slate-100 group-hover:text-yellow-400 transition-colors">בירור חוקי המשחק</h4>
                          <p className="text-xs md:text-sm text-slate-500 leading-relaxed font-medium mt-1">קבלת תשובות ישירות ומדויקות לגבי מה מותר ומה אסור לעשות במהלך המשחק.</p>
                        </div>
                      </div>

                      <div className="p-5 bg-slate-950/60 rounded-3xl border border-slate-800/80 flex items-start gap-5 hover:border-yellow-400/40 transition-all duration-300 group hover:bg-slate-900/60 hover:-translate-y-1 shadow-xl">
                        <div className="p-3 bg-yellow-400/10 rounded-2xl text-yellow-400 group-hover:scale-110 group-hover:bg-yellow-400/20 transition-all duration-300 shadow-[0_0_20px_rgba(250,204,21,0.05)]">
                          <Zap className="w-7 h-7" />
                        </div>
                        <div>
                          <h4 className="text-base md:text-lg font-black text-slate-100 group-hover:text-yellow-400 transition-colors">גישה מהירה לעדכוני שיפוט</h4>
                          <p className="text-xs md:text-sm text-slate-500 leading-relaxed font-medium mt-1">צפייה מהירה בהבהרות, פסיקות ושינויים שפורסמו לאורך העונה.</p>
                        </div>
                      </div>

                      <div className="p-5 bg-slate-950/60 rounded-3xl border border-slate-800/80 flex items-start gap-5 hover:border-yellow-400/40 transition-all duration-300 group hover:bg-slate-900/60 hover:-translate-y-1 shadow-xl">
                        <div className="p-3 bg-yellow-400/10 rounded-2xl text-yellow-400 group-hover:scale-110 group-hover:bg-yellow-400/20 transition-all duration-300 shadow-[0_0_20px_rgba(250,204,21,0.05)]">
                          <Eye className="w-7 h-7" />
                        </div>
                        <div>
                          <h4 className="text-base md:text-lg font-black text-slate-100 group-hover:text-yellow-400 transition-colors">ניתוח מצבים ויזואלי</h4>
                          <p className="text-xs md:text-sm text-slate-500 leading-relaxed font-medium mt-1">העלאת תמונות של מצבי זירה או משימות לקבלת חוות דעת מנומקת מבוססת חוקים.</p>
                        </div>
                      </div>
                    </div>

                    {/* Action Button */}
                    <div className="flex flex-col gap-4">
                      <button
                        onClick={() => {
                          if (hasGoogleToken || user) {
                            setShowIntro(false);
                          } else {
                            handleGoogleLogin();
                          }
                        }}
                        className="w-full relative overflow-hidden group bg-yellow-400 hover:bg-yellow-300 text-slate-950 font-black py-4 px-6 rounded-2xl transition-all shadow-[0_10px_20px_rgba(250,204,21,0.15)] hover:shadow-[0_15px_30px_rgba(250,204,21,0.25)] hover:-translate-y-1 flex items-center justify-center gap-3 cursor-pointer border-2 border-slate-950/10 active:scale-[0.98]"
                      >
                        <span className="text-base md:text-lg">
                          {hasGoogleToken || user ? 'המשך לאפליקציה' : 'המשך לכניסה'}
                        </span>
                        <span className="text-xl group-hover:translate-x-1 transition-transform">🚀</span>
                      </button>

                      {(!hasGoogleToken && !user) && (
                        <button
                          onClick={() => setShowIntro(false)}
                          className="w-full bg-slate-950 hover:bg-slate-900 text-slate-400 font-bold py-3.5 px-6 rounded-2xl transition-all hover:-translate-y-0.5 flex items-center justify-center gap-2 cursor-pointer border border-slate-800 text-xs tracking-wide"
                        >
                          <span>המשך כאורח 👤</span>
                        </button>
                      )}
                    </div>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="login"
                  initial={{ opacity: 0, scale: 0.95, y: 15 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -15 }}
                  transition={{ duration: 0.3 }}
                  className="bg-slate-900 border border-slate-800 shadow-2xl rounded-3xl p-6 md:p-8 max-w-md w-full text-center relative overflow-hidden my-auto"
                >
                  <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-500 via-yellow-400 to-emerald-500" />
                  
                  <button 
                    onClick={() => setShowIntro(true)}
                    className="absolute top-4 right-4 text-slate-400 hover:text-white px-2 py-1 rounded-lg bg-slate-800/50 hover:bg-slate-800 transition-colors text-xs font-bold"
                    title="חזרה להסבר"
                  >
                    <span>חזרה ↩</span>
                  </button>

                  <div className="w-16 h-16 md:w-20 md:h-20 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner border border-slate-700">
                    <Gavel className="w-8 h-8 md:w-10 md:h-10 text-white" />
                  </div>
                  
                  <h2 className="text-2xl md:text-3xl font-black text-white mb-3 tracking-tight">התחברות מאובטחת</h2>
                  <p className="text-slate-400 font-medium mb-6 text-sm md:text-base leading-relaxed">
                    כדי להשתמש בבינה המלאכותית בצורה מאובטחת וללא תלות במפתחות פנימיים, אנא התחבר עם חשבון ה-Google שלך. ה-AI ירוץ תחת החשבון האישי שלך באופן אוטומטי!
                  </p>
                  
                  <button
                    onClick={handleGoogleLogin}
                    className="w-full relative overflow-hidden group bg-white text-slate-900 font-black py-4 px-6 rounded-2xl transition-all shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:shadow-[0_0_30px_rgba(255,255,255,0.3)] hover:-translate-y-1 cursor-pointer"
                  >
                    <div className="absolute inset-0 bg-slate-100 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <span className="relative flex items-center justify-center gap-3 text-sm md:text-base">
                      <svg className="w-6 h-6" viewBox="0 0 24 24">
                        <path fill="currentColor" d="M21.35,11.1H12.18V13.83H18.69C18.36,17.64 15.19,19.27 12.19,19.27C8.36,19.27 5,16.25 5,12C5,7.9 8.2,4.73 12.2,4.73C15.29,4.73 17.1,6.7 17.1,6.7L19,4.72C19,4.72 16.56,2 12.1,2C6.42,2 2.03,6.8 2.03,12C2.03,17.05 6.16,22 12.25,22C17.6,22 21.5,18.33 21.5,12.91C21.5,11.76 21.35,11.1 21.35,11.1V11.1Z" />
                      </svg>
                      התחברות מאובטחת עם Google
                    </span>
                  </button>
                  
                  {loginError && (
                    <div className="mt-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm font-medium leading-relaxed">
                      {loginError}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmationModal
        isOpen={showLogoutConfirm}
        onClose={() => setShowLogoutConfirm(false)}
        onConfirm={handleLogout}
        title="התנתקות מהמערכת"
        message="האם אתה בטוח שברצונך להתנתק מהמערכת?"
        confirmText="כן, התנתק"
        cancelText="ביטול"
        variant="warning"
      />
    </div>
  );
}
