/**
 * useChatConversation - the chat engine: messages, composer input, reply
 * context and photo attachments; the request lifecycle state machine with
 * its abort controller, wake lock and rate-limit slot; the streamed send
 * with its optimistic echo and guard chain; Stop; and the typewriter
 * wiring. The parent keeps the surrounding page (rulebook loading,
 * entry flow, overlays) and supplies the few cross-cutting helpers.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, MutableRefObject } from 'react';
import { resetThinkCycle } from '../../../lib/thinkCycle';
import { ChatQuotaExhaustedError, consumeChatQuota } from '../../../lib/chatQuota';
import { trackQuestion, logRefereeQA } from '../../../lib/analytics';
import type { LanguageCode } from '../../../hooks/useLanguage';
import type { createRulebookLoadBarrier } from '../rulebook/loadBarrier';
import type { ChatMessage, RefereeDisplayUser, RulebookFile } from '../types';
import { finalizeModelResponse, resolveResponseOutcome } from './finalizeResponse';
import { safeUserFacingError } from './userFacingError';
import { applyStop, beginSend, beginStream, completeStream, finishRender, initialRequestMachine, settle, type RequestMachine } from './requestMachine';
import { decideSendPreflight } from './sendGuards';
import { consumeClientRateLimit, refundClientRateLimit } from './clientRateLimit';
import { selectAttachableImages } from './attachImages';
import { applyStopToMessages, dropInvisibleAnswer, withoutStopNotes } from './stopResponse';
import { useTypewriter } from './useTypewriter';

type Params = {
  t: (key: string) => string;
  language: LanguageCode;
  seasonName: string;
  seasonNameRef: MutableRefObject<string>;
  rulebookLoadBarrierRef: MutableRefObject<ReturnType<typeof createRulebookLoadBarrier<RulebookFile[]>>>;
  rulebookMutationRef: MutableRefObject<Promise<void> | null>;
  typewriterReady: boolean;
  chatStarted: boolean;
  resolveRefereeUid: () => string | null;
  quotaMessage: (key: 'chat.quotaExhausted' | 'chat.quotaUnavailable', resetAtMs?: number | null) => string;
  maybePromptFeedback: () => void;
  isCurrentUserOwner: () => boolean;
  displayUser: RefereeDisplayUser | null;
  showToast: (message: string) => void;
};

export default function useChatConversation({
  t, language, seasonName, seasonNameRef,
  rulebookLoadBarrierRef, rulebookMutationRef,
  typewriterReady, chatStarted,
  resolveRefereeUid, quotaMessage, maybePromptFeedback,
  isCurrentUserOwner, displayUser, showToast,
}: Params) {
  // Every page load starts a clean conversation: chat history is NOT
  // restored after a refresh (owner decision). Anything persisted by older
  // versions is wiped on mount below; sign-out/kick/delete still wipe via
  // localHistory.ts.
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  // WhatsApp-style reply: quoted answer context for a follow-up question.
  const [replyTo, setReplyTo] = useState<{ text: string } | null>(null);
  // Attached user photos (max 3, images only, sent full-resolution).
  // Preview URLs stay alive for the session so sent bubbles keep showing them.
  const [attachedImages, setAttachedImages] = useState<{ file: File; url: string }[]>([]);
  const attachInputRef = useRef<HTMLInputElement | null>(null);
  const [loading, setLoading] = useState(false);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  // One request lifecycle state machine replaces the old sending /
  // requestFinished / stopHandled boolean trio (see requestMachine.ts).
  const requestRef = useRef<RequestMachine>(initialRequestMachine);
  // Request id whose client rate-limit slot was consumed; Stop refunds only that.
  const clientSlotRequestRef = useRef<number | null>(null);
  useEffect(() => () => {
    abortControllerRef.current?.abort();
  }, []);

  const finishRenderedResponse = useCallback(() => {
    requestRef.current = finishRender(requestRef.current);
    abortControllerRef.current = null;
  }, []);
  const typewriter = useTypewriter({
    ready: typewriterReady,
    chatStarted,
    loading,
    onFinished: finishRenderedResponse,
  });
  const typewriterTargetRef = typewriter.targetRef;
  const typewriterCount = typewriter.count;
  const renderingResponse = typewriter.rendering;
  const setRenderingResponse = typewriter.setRendering;
  const isAiBusy = loading || renderingResponse;
  /**
   * Gemini-style Stop: abort the provider stream immediately, freeze the
   * typewriter on everything already received, and keep the partial answer
   * as the final message — copyable, replyable and history-safe. An answer
   * that never started leaves no bubble. Idempotent across rapid clicks and
   * the late resolution of the aborted request.
   */
  const handleStop = () => {
    const stop = applyStop(requestRef.current);
    if (!stop.tookEffect) return;
    const stoppedId = requestRef.current.requestId;
    requestRef.current = stop.next;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    // The UI is released on the spot: the aborted request may take a moment
    // to unwind (network, file fetch), but the chat must not wait for it.
    setLoading(false);
    typewriter.finish();
    if (wakeLockRef.current) { wakeLockRef.current.release().catch(() => {}); wakeLockRef.current = null; }
    if (clientSlotRequestRef.current === stoppedId) {
      clientSlotRequestRef.current = null;
      refundClientRateLimit();
    }
    const note = t('chat.stoppedByUser');
    setMessages(prev => applyStopToMessages(prev, note));
  };

  /**
   * Attach user photos (images only, max 3, full resolution — no downscale).
   * Preview URLs are created here and live for the session (sent bubbles
   * reuse them; nothing is revoked mid-session).
   */
  const handleAttachImages = (e: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = '';
    if (!picked.length) return;
    const selection = selectAttachableImages(picked, {
      count: attachedImages.length,
      bytes: attachedImages.reduce((sum, a) => sum + a.file.size, 0),
    });
    if (selection.rejected.nonImage) showToast(t('chat.imagesOnly'));
    if (selection.rejected.unsupportedType) showToast(t('chat.unsupportedImageType'));
    if (selection.rejected.tooMany) showToast(t('chat.maxImages'));
    if (selection.rejected.tooLarge) showToast(t('chat.imageTooLarge'));
    if (!selection.accepted.length) return;
    setAttachedImages(prev => [...prev, ...selection.accepted.map(file => ({ file, url: URL.createObjectURL(file) }))]);
  };
  const removeAttachedImage = (url: string) => {
    setAttachedImages(prev => prev.filter(a => a.url !== url));
  };

  /**
   * Send the input (or a tapped suggestion) to the referee: input guards,
   * anti-spam rate limits, then a streamed answer appended chunk by chunk.
   * On success the question is counted, logged, and may trigger the feedback
   * popup. Stop via handleStop: the partial answer stays and the client rate-limit slot is refunded.
   */
  /**
   * Hybrid optimistic send: the user's bubble echoes instantly, then the
   * preflight guards (rulebook barrier, blind-answer guard, client rate
   * limit, server daily quota) run. If a guard rejects, the optimistic
   * bubble is removed and the exact draft, reply context and attachments
   * are restored without loss or flicker; the guard's notice appears as a
   * model bubble. A synchronous single-flight ref blocks double submits
   * through stale closures. On success the request streams as before;
   * Stop keeps the partial answer and refunds the client rate-limit slot.
   */
  const handleSend = async (textOverride?: string) => {
    const textToSend = textOverride || input;

    if ((!textToSend.trim() && !attachedImages.length) || isAiBusy) return;
    // State-machine single-flight: only an idle lifecycle accepts a send,
    // so rapid double taps can never slip through a stale render closure.
    const begin = beginSend(requestRef.current);
    if (!begin.started) return;
    requestRef.current = begin.next;
    const sendRequestId = begin.next.requestId;

    const userMessage = textToSend.trim();
    // Snapshot everything the optimistic echo consumes, so a rejected
    // send restores the exact composer state with no loss.
    const replySnapshot = replyTo;
    const photosToSend = attachedImages;

    // WhatsApp-style reply: quoted answer travels as prompt context and as
    // a visible quote on the sent bubble.
    const replyContext = replySnapshot
      ? `(הקשר: המשתמש ממשיך ושואל שאלת המשך על התשובה הקודמת הבאה: "${replySnapshot.text.slice(0, 800)}")\n\n`
      : null;
    const replyQuote = replySnapshot ? replySnapshot.text.slice(0, 220) : undefined;

    // Optimistic echo: bubble first, guards after.
    setAttachedImages([]);
    setInput('');
    setReplyTo(null);
    setMessages(prev => [
      ...prev,
      {
        role: 'user',
        text: userMessage,
        sentAt: Date.now(),
        ...(replyQuote ? { quote: replyQuote } : {}),
        ...(photosToSend.length ? { files: photosToSend.map(a => ({ url: a.url, key: a.file.name })) } : {})
      }
    ]);

    // Busy from the first frame: Stop is available while the guards run.
    setLoading(true);
    /** True once this send was stopped or superseded; every await re-checks it. */
    const isDead = () => requestRef.current.requestId !== sendRequestId || requestRef.current.stopHandled;

    /** Undo the echo and hand the composer its exact prior state back. */
    const rollback = () => {
      setMessages(prev => {
        const idx = prev.reduce((found, m, i) => (m.role === 'user' && m.text === userMessage ? i : found), -1);
        if (idx < 0) return prev;
        return [...prev.slice(0, idx), ...prev.slice(idx + 1)];
      });
      setInput(userMessage);
      setReplyTo(replySnapshot);
      setAttachedImages(photosToSend);
    };

    /** Roll the echo back and leave the guard's notice as a model bubble. */
    const rejectWithNotice = (notice: string) => {
      rollback();
      setMessages(prev => [...prev, { role: 'model', text: notice }]);
    };

    try {
      let requestRulebookFiles: RulebookFile[];
      try {
        if (rulebookMutationRef.current) await rulebookMutationRef.current;
        requestRulebookFiles = await rulebookLoadBarrierRef.current.ready();
      } catch {
        if (isDead()) return;
        rejectWithNotice(t('chat.guardRulebookLoadFailed'));
        return;
      }

      // Guard chain (pure decisions; order test-locked in sendGuards.ts):
      // blind-answer guard -> client rate limit -> server daily quota.
      // The quota unit is consumed only when the cheaper guards passed.
      if (isDead()) return;
      const clientLimit = consumeClientRateLimit();
      if (clientLimit.allowed) clientSlotRequestRef.current = sendRequestId;
      let quotaError: { exhausted: boolean; resetAtMs?: number | null } | null = null;
      const quotaUid = resolveRefereeUid();
      if (quotaUid && requestRulebookFiles.length > 0 && clientLimit.allowed) {
        try {
          // Server-enforced daily budget: consumes one unit from
          // chat_quota/{uid}. Rules enforce strictly-+1 inside a rolling
          // 24h window with a hard cap, so clearing localStorage or
          // switching devices cannot dodge it.
          await consumeChatQuota(quotaUid);
        } catch (error) {
          quotaError = error instanceof ChatQuotaExhaustedError
            ? { exhausted: true, resetAtMs: error.resetAtMs }
            : { exhausted: false };
        }
      }
      const guard = decideSendPreflight(
        { rulebookCount: requestRulebookFiles.length, clientLimit, quotaError },
        {
          noRulebook: t('chat.guardNoRulebook'),
        cooldown: t('chat.guardCooldown'),
        hourlyLimit: t('chat.guardHourlyLimit'),
          genericRateLimited: t('chat.guardRateLimited'),
          quotaExhausted: quotaMessage('chat.quotaExhausted', quotaError?.resetAtMs),
          quotaUnavailable: quotaMessage('chat.quotaUnavailable'),
        });
      if (isDead()) return;
      if (guard.kind === 'reject') {
        rejectWithNotice(guard.notice);
        return;
      }

      requestRef.current = beginStream(requestRef.current);
      setLoading(true);
      resetThinkCycle();
      const controller = new AbortController();
      abortControllerRef.current = controller;
      setRenderingResponse(false);
      try {
        const lock = await navigator.wakeLock.request('screen');
        if (isDead()) lock.release().catch(() => {}); else wakeLockRef.current = lock;
      } catch(e) {}
      if (isDead()) { controller.abort(); return; }

      try {
        const finalPrompt = (replyContext || '') + userMessage + "\n\n(הנחיה לשופט: אם השאלה עוסקת במשימה חדשה או מצב חדש - התעלם מהמשימה שנדונה קודם לכן ואל תערבב בין חוקים או ניקודים של משימות שונות.)";

        const { GeminiService } = await import('../../../services/geminiService');
        const response = await GeminiService.askRulebook(
          finalPrompt,
          withoutStopNotes(messages),
          requestRulebookFiles,
          seasonNameRef.current,
          photosToSend.map(a => ({ url: '' as string, key: a.file.name, actualFile: a.file })),
          (chunkText) => {
            if (controller.signal.aborted) return;
            if (requestRef.current.requestId !== sendRequestId) return;
            setMessages(prev => {
              const newMessages = [...prev];
              const lastMsg = newMessages[newMessages.length - 1];
              if (lastMsg?.role === 'model') {
                newMessages[newMessages.length - 1] = {
                  ...lastMsg,
                  text: lastMsg.text + chunkText
                };
              } else {
                newMessages.push({ role: 'model', text: chunkText });
              }
              return newMessages;
            });
          },
          language,
          controller.signal,
          () => {
            // A retried attempt restarts the streamed answer: drop the
            // partial bubble the failed attempt left behind.
            if (controller.signal.aborted) return;
            if (requestRef.current.requestId !== sendRequestId) return;
            setMessages(prev => (prev[prev.length - 1]?.role === 'model' ? prev.slice(0, -1) : prev));
          }
        );

        if (controller.signal.aborted) {
          // Stop already released the UI; only an abort from elsewhere
          // (unmount) on the still-current request needs handling here.
          if (requestRef.current.requestId === sendRequestId) handleStop();
        } else {
          // Owner questions are invisible to analytics: not counted and not
          // logged to the journal.
          // Count only questions that actually got an answer: stopped or
          // failed requests never reach here, so they are not counted.
          const outcome = resolveResponseOutcome(response, t('chat.commError'));
          if (!isCurrentUserOwner() && outcome.answered) {
            trackQuestion(resolveRefereeUid() || 'anon');
          }
          if (!isCurrentUserOwner()) {
            logRefereeQA({
              question: userMessage,
              answer: outcome.logAnswer,
              season: seasonName,
              language,
              uid: resolveRefereeUid(),
              askerName: displayUser?.name || null,
              model: 'gemini-3.6-flash',
              ok: outcome.answered,
            });
          }
          requestRef.current = completeStream(requestRef.current);
          setRenderingResponse(true);
          setMessages(prev => finalizeModelResponse(prev, response, t('chat.commError')));
          if (outcome.answered) maybePromptFeedback();
        }
      } catch (error: any) {
        if (controller.signal.aborted) {
          if (requestRef.current.requestId === sendRequestId) handleStop();
        } else {
          const errMsg = safeUserFacingError(error, t('chat.connectionLost'));
          // Service errors are journal entries too, so exclude owner requests here as well.
          if (!isCurrentUserOwner()) {
            logRefereeQA({
              question: userMessage,
              answer: errMsg,
              season: seasonName,
              language,
              uid: resolveRefereeUid(),
              askerName: displayUser?.name || null,
              model: 'gemini-3.6-flash',
              ok: false,
            });
          }
          // A partial bubble that never reached a visible answer (still
          // inside private thinking) is dropped, never shown as raw markup.
          setMessages(prev => [...dropInvisibleAnswer(prev), { role: 'model', text: errMsg }]);
        }
      } finally {
        // A stopped request's late tail must never touch a newer send.
        if (requestRef.current.requestId === sendRequestId) {
          if (requestRef.current.phase !== 'rendering') abortControllerRef.current = null;
          requestRef.current = settle(requestRef.current);
          setLoading(false);
          if (wakeLockRef.current) { wakeLockRef.current.release().catch(() => {}); wakeLockRef.current = null; }
        }
      }
    } finally {
      if (requestRef.current.requestId === sendRequestId) {
        requestRef.current = settle(requestRef.current);
        if (requestRef.current.phase === 'idle') setLoading(false);
      }
    }
  };



  return {
    messages, setMessages,
    input, setInput,
    replyTo, setReplyTo,
    attachedImages, setAttachedImages,
    attachInputRef,
    loading,
    isAiBusy,
    renderingResponse,
    typewriterCount,
    typewriterTargetRef,
    requestRef,
    handleSend, handleStop,
    handleAttachImages, removeAttachedImage,
  };
}
