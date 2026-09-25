/** Image draft preview occupies its own flex row so it never overlays chat suggestions. */
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { MOTION } from '../ui/motion';

type Attachment = { file: File; url: string };
type Props = { attachments: Attachment[]; removeAttachment: (url: string) => void; t: (key: string) => string };

export default function ChatAttachmentTray({ attachments, removeAttachment, t }: Props) {
  return <AnimatePresence initial={false}>{attachments.length > 0 && (
    <motion.div initial={false} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={MOTION.morph} className="v12-attach-row">
      <div className="v12-attachments" aria-label={t('chat.attachImage')}><AnimatePresence initial={false}>{attachments.map(item => (
        <motion.div key={item.url} layout initial={false} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.85 }} transition={MOTION.control} className="v12-attachment">
          <div className="v12-attachment-frame"><img src={item.url} alt={item.file.name} /></div>
          <button type="button" onClick={() => removeAttachment(item.url)} aria-label={`${t('chat.removeImage')}: ${item.file.name}`} className="v12-attachment-remove"><X className="w-3.5 h-3.5" /></button>
        </motion.div>
      ))}</AnimatePresence></div>
    </motion.div>
  )}</AnimatePresence>;
}
