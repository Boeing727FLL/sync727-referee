/**
 * useRulebookUpload - the owner upload flow: the upload modal's open state,
 * the typed season-wipe double confirmation, and the R2 upload itself
 * (PDF -> storage -> rendered page images -> season detection -> list
 * refresh). Progress is reported straight into the chat as model messages.
 * The parent supplies the season, message/rulebook setters and the
 * mutation barrier pieces it owns.
 */
import { useRef, useState } from 'react';
import type { ChangeEvent, Dispatch, MutableRefObject, SetStateAction } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../../lib/firebase/firestore';
import { ensureSeasonIdentity } from '../season/identity';
import { extractSeasonFromFilename } from './season';
import type { ChatMessage } from '../types';

type Params = {
  seasonName: string;
  t: (key: string) => string;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setRulebookLoading: Dispatch<SetStateAction<boolean>>;
  rulebookMutationRef: MutableRefObject<Promise<void> | null>;
  refreshLatestRulebook: () => Promise<unknown>;
};

export default function useRulebookUpload({ seasonName, t, setMessages, setRulebookLoading, rulebookMutationRef, refreshLatestRulebook }: Params) {
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const openUploadModal = () => {
    setUploadError(null);
    setShowUploadModal(true);
  };

  const [wipePending, setWipePending] = useState<{ file: File; fileName: string; season: string; oldCount: number } | null>(null);
  const [wipeTyped, setWipeTyped] = useState('');

  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!file) return;

    // New season uploads wipe all old rule files, so they need a typed
    // double confirmation BEFORE anything is uploaded or deleted.
    const detected = extractSeasonFromFilename(`fll-rules/${file.name}`);
    if (detected !== 'UNKNOWN' && detected !== seasonName) {
      let oldCount = 0;
      try {
        const { s3Client, R2_BUCKET_NAME, ListObjectsV2Command } = await import('../../../lib/r2');
        const resp = await s3Client.send(new ListObjectsV2Command({
          Bucket: R2_BUCKET_NAME,
          Prefix: 'fll-rules',
        }));
        oldCount = (resp.Contents || []).filter((f) =>
          f.Key && f.Key !== `fll-rules/${file.name}` && f.Key !== 'fll-rules/').length;
      } catch {
        oldCount = 0;
      }
      setWipePending({ file, fileName: file.name, season: detected, oldCount });
      setWipeTyped('');
      return;
    }
    await performUpload(file);
  };

  const confirmSeasonWipe = async () => {
    if (!wipePending) return;
    if (wipeTyped.trim().toUpperCase() !== wipePending.season.toUpperCase()) return;
    const file = wipePending.file;
    setWipePending(null);
    setWipeTyped('');
    await performUpload(file);
  };

  /**
   * Upload a rulebook PDF to R2, render its pages to images for the judge,
   * clear replaced versions, detect a season change, and refresh the list.
   */
  const uploadingRef = useRef(false);

  const performUpload = async (file: File) => {
    // Synchronous single-flight: rapid double taps on the season-wipe
    // confirm could otherwise start two uploads of the same file.
    if (uploadingRef.current) return;
    uploadingRef.current = true;
    setUploading(true);
    setUploadProgress(0);
    setRulebookLoading(true);
    let resolveMutation!: () => void;
    let rejectMutation!: (reason?: unknown) => void;
    const mutation = new Promise<void>((resolve, reject) => {
      resolveMutation = resolve;
      rejectMutation = reject;
    });
    rulebookMutationRef.current = mutation;
    void mutation.catch(() => {});
    try {
      const [{ Upload }, { s3Client, R2_BUCKET_NAME, ListObjectsV2Command, DeleteObjectsCommand, PutObjectCommand }, { convertPdfToImages, fileToBase64 }] = await Promise.all([
        import('@aws-sdk/lib-storage'),
        import('../../../lib/r2'),
        import('./pdfRendering'),
      ]);
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
        if (progress.total && progress.loaded != null) {
          const percent = Math.round((progress.loaded / progress.total) * 100);
          setUploadProgress(percent);
        }
      });

      await upload.done();

      // Same-season updates file (e.g. BioGlow_updates.pdf): replace any previous version of this exact file,
      // including its generated page images and text, so only the latest upload survives.
      const prevVersionPrefixes = [
        `fll-rules-images/${file.name}/`,
        `fll-rules-text/${file.name}.txt`,
        `fll-rules/${file.name}`,
      ];
      for (const prefix of prevVersionPrefixes) {
        try {
          const listResp = await s3Client.send(new ListObjectsV2Command({
            Bucket: R2_BUCKET_NAME,
            Prefix: prefix,
          }));
          // Never delete the file that was just uploaded in this same flow.
          // The prefix `fll-rules/<name>` also matches the new object itself,
          // and without this filter every upload ended with its own PDF deleted.
          const staleObjects = (listResp.Contents || [])
            .map((o) => ({ Key: o.Key }))
            .filter((o) => o.Key && o.Key !== fileName);
          if (staleObjects.length > 0) {
            await s3Client.send(new DeleteObjectsCommand({
              Bucket: R2_BUCKET_NAME,
              Delete: { Objects: staleObjects.slice(0, 1000) },
            }));
          }
        } catch (e) {
          console.warn(`Failed to remove previous version of ${file.name} (${prefix}):`, e);
        }
      }
      
      setShowUploadModal(false);

      const extractedSeason = extractSeasonFromFilename(fileName);
      const isNewSeason = extractedSeason !== "UNKNOWN" && extractedSeason !== seasonName;

      if (extractedSeason !== "UNKNOWN") {
        try {
          await updateDoc(doc(db, 'app_config', 'rulebook'), {
            current_season: extractedSeason,
            last_updated: Date.now()
          });
        } catch (e) {
          console.warn("Firestore sync update failed:", e);
        }
      }

      if (isNewSeason) {
        console.log(`New season detected: ${extractedSeason}. Clearing old rules for ${seasonName}...`);
        
        try {
          const command = new ListObjectsV2Command({
            Bucket: R2_BUCKET_NAME,
            Prefix: 'fll-rules',
          });
          const listResponse = await s3Client.send(command);
          if (listResponse.Contents && listResponse.Contents.length > 0) {
            const objectsToDelete = listResponse.Contents
              .filter((f) => f.Key && f.Key !== fileName && !f.Key.startsWith(`fll-rules-images/${file.name}/`) && f.Key !== `fll-rules-text/${file.name}.txt` && f.Key !== 'fll-rules/')
              .map((f) => ({ Key: f.Key }));
              
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

      const seasonLabel = extractedSeason !== "UNKNOWN" ? extractedSeason : "חדש";
      setMessages(prev => [...prev, { role: 'model', text: `קובץ חוקים חדש (${file.name}) התקבל. עונת ${seasonLabel}. מעבד תמונות...`, isProgress: true }]);

      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        try {
          const images = await convertPdfToImages(new Blob([await file.arrayBuffer()], { type: 'application/pdf' }));
          if (isNewSeason && images.length > 0) {
            // The season's cover is the strongest branding evidence: generate
            // and persist its badge identity once, right after upload.
            void ensureSeasonIdentity(extractedSeason, { imageBase64: await fileToBase64(images[0].data), mimeType: 'image/jpeg' }).catch(() => {});
          }
          let okCount = 0;
          for (let i = 0; i < images.length; i++) {
            const imgKey = `fll-rules-images/${file.name}/page_${i + 1}.jpg`;
            try {
              await s3Client.send(new PutObjectCommand({
                Bucket: R2_BUCKET_NAME,
                Key: imgKey,
                Body: new Uint8Array(await images[i].data.arrayBuffer()),
                ContentType: 'image/jpeg',
              }));
              okCount++;
            } catch (putErr) {
              console.error(`Failed to upload page image ${imgKey}:`, putErr);
            }
            const pct = images.length > 0 ? Math.round(((i + 1) / images.length) * 100) : 100;
            setMessages(prev => {
              const newMsgs = [...prev];
              const last = newMsgs[newMsgs.length - 1];
              if (last?.role === 'model' && last.isProgress) {
                newMsgs[newMsgs.length - 1] = { ...last, text: `קובץ חוקים חדש (${file.name}) התקבל. עונת ${seasonLabel}. מעבד תמונות... ${pct}% (${i + 1}/${images.length})` };
              }
              return newMsgs;
            });
          }
          if (images.length === 0) {
            setMessages(prev => {
              const newMsgs = [...prev];
              const last = newMsgs[newMsgs.length - 1];
              if (last?.role === 'model' && last.isProgress) {
                newMsgs[newMsgs.length - 1] = { ...last, text: `קובץ החוקים (${file.name}) הועלה, אבל המרת העמודים לתמונות נכשלה. נסו להעלות שוב.` };
              }
              return newMsgs;
            });
          } else if (okCount < images.length) {
            setMessages(prev => [...prev, { role: 'model', text: `שימו לב: הועלו ${okCount} מתוך ${images.length} עמודים. כדאי להעלות שוב כדי להשלים.` }]);
          }
        } catch (imgErr) {
          console.error("Failed to convert/upload PDF pages:", imgErr);
        }
      }

      setRulebookLoading(true);
      await refreshLatestRulebook();
      setRulebookLoading(false);
      setUploading(false);
      uploadingRef.current = false;
      setUploadProgress(0);
      resolveMutation();
      if (rulebookMutationRef.current === mutation) rulebookMutationRef.current = null;
      setMessages(prev => {
        const newMsgs = [...prev];
        if (newMsgs.length > 0 && newMsgs[newMsgs.length - 1].isProgress) {
          newMsgs[newMsgs.length - 1] = { ...newMsgs[newMsgs.length - 1], text: 'למדתי את העדכונים מקובץ החוקים! המידע נשמר בענן ומוכן לשימוש מכל מכשיר.' };
          delete newMsgs[newMsgs.length - 1].isProgress;
        } else {
          newMsgs.push({ role: 'model', text: 'למדתי את העדכונים מקובץ החוקים! המידע נשמר בענן ומוכן לשימוש מכל מכשיר.' });
        }
        return newMsgs;
      });

    } catch (error) {
      console.error('Upload error:', error);
      // The dialog stays open with a clean inline error - no blocking
      // alert, no raw technical message.
      setUploadError(t('owner.uploadFail'));
      setUploading(false);
      uploadingRef.current = false;
      setUploadProgress(0);
      setRulebookLoading(false);
      rejectMutation(error);
      if (rulebookMutationRef.current === mutation) rulebookMutationRef.current = null;
    }
  };



  return {
    showUploadModal, setShowUploadModal,
    uploading, uploadProgress, uploadError,
    openUploadModal,
    handleFileUpload, confirmSeasonWipe,
    wipePending, setWipePending, wipeTyped, setWipeTyped,
    fileInputRef,
  };
}
