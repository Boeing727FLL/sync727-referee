/**
 * useJudgeCorrections - the corrections editor's document flow: owner gate
 * on every open, load the single Firestore doc into one-row-per-line
 * state, join and stamp on save, then bust the service cache so the very
 * next question obeys the new text. Line edits delegate to the pure model;
 * search matches keep their original indices so delete/edit target right.
 */
import { useState, useEffect, useMemo, useRef } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../../lib/firebase/firestore';
import { useLanguage } from '../../../hooks/useLanguage';
import { invalidateCorrectionsCache } from '../../../services/geminiService';
import { isCurrentUserOwner } from '../../../lib/owner';
import { addCorrection, correctionCount, deleteCorrection, editCorrection, parseCorrections, serializeCorrections, visibleCorrections } from './model';

/** How long the green "saved" tick stays on the save button. */
const SAVED_TICK_MS = 2000;

/** Firestore location of the single corrections document. */
const correctionsDocRef = () => doc(db, 'app_config', 'corrections');

export default function useJudgeCorrections(isOpen: boolean) {
  const { t } = useLanguage();
  // -- gate + document state ----------------------------------------------------
  const [unlocked, setUnlocked] = useState(false);
  const [lines, setLines] = useState<string[]>([]);
  const [initialText, setInitialText] = useState('');

  // -- async flags -----------------------------------------------------------------
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // The "saved" tick timer is tracked and cancelled on unmount.
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
  }, []);

  // -- view state (search + new-line draft) -------------------------------------------
  const [search, setSearch] = useState('');
  const [newLine, setNewLine] = useState('');

  // Fresh gate + wiped draft on every opening.
  useEffect(() => {
    if (!isOpen) {
      setUnlocked(false);
      setLines([]);
      setInitialText('');
      setSearch('');
      setNewLine('');
      setSaved(false);
      setUpdatedAt(null);
      setActionError(null);
      return;
    }
    // Access is decided by the signed-in account, no code anymore.
    setUnlocked(isCurrentUserOwner());
  }, [isOpen]);

  /** Load the doc into one-editable-line-per-row state. */
  const load = async () => {
    setLoading(true);
    try {
      const snap = await getDoc(correctionsDocRef());
      const t = snap.exists() ? String(snap.data().text || '') : '';
      const u = snap.exists() ? Number(snap.data().updatedAt || 0) : 0;
      setLines(parseCorrections(t));
      setInitialText(t);
      setUpdatedAt(u || null);
      setActionError(null);
    } catch (e) {
      console.warn('corrections load failed:', e);
      setActionError(t('owner.loadFail'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (unlocked && isOpen) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocked]);

  /**
   * Join lines back into the doc, stamp it, and bust the service cache so
   * the next question already obeys the new text.
   */
  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const now = Date.now();
      const t = serializeCorrections(lines);
      await setDoc(correctionsDocRef(), { text: t, updatedAt: now });
      invalidateCorrectionsCache();
      setInitialText(t);
      setUpdatedAt(now);
      setSaved(true);
      setActionError(null);
      savedTimerRef.current = setTimeout(() => setSaved(false), SAVED_TICK_MS);
    } catch (e) {
      console.warn('corrections save failed:', e);
      // The draft stays on screen; say the save did not land.
      setActionError(t('owner.saveFail'));
    } finally {
      setSaving(false);
    }
  };

  const nonEmptyCount = useMemo(() => correctionCount(lines), [lines]);

  /** Search matches keep their ORIGINAL indices (delete/edit target them). */
  const visibleLines = useMemo(() => visibleCorrections(lines, search), [lines, search]);
  const deleteLine = (index: number) => setLines(previous => deleteCorrection(previous, index));
  const editLine = (index: number, value: string) => setLines(previous => editCorrection(previous, index, value));
  const addLine = () => {
    const next = addCorrection(lines, newLine);
    if (next !== lines) { setLines(next); setNewLine(''); }
  };

  /** Unsaved-changes flag drives the save button state and the footer hint. */
  const dirty = serializeCorrections(lines) !== initialText;

  return {
    unlocked, lines, setLines, loading, saving, saved, updatedAt, actionError,
    search, setSearch, newLine, setNewLine,
    load, handleSave, nonEmptyCount, visibleLines,
    deleteLine, editLine, addLine, dirty,
  };
}
