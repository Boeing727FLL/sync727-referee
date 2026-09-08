import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Copy, Loader2, LogIn, Plus, Users, X } from 'lucide-react';
import {
  TEAM_STORAGE_KEY,
  createTeam,
  getActiveTeamId,
  joinTeam,
  subscribeTeamMembers,
  subscribeTeamQuestions,
  type TeamMember,
  type TeamQuestion,
  type TeamWorkspace,
} from '../services/teamWorkspaceService';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  currentUser: TeamMember;
  onTeamChange: (team: TeamWorkspace | null) => void;
};

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

export default function TeamWorkspaceModal({ isOpen, onClose, currentUser, onTeamChange }: Props) {
  const [team, setTeam] = useState<TeamWorkspace | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [questions, setQuestions] = useState<TeamQuestion[]>([]);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState(false);
  const notify = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(''), 2200); };

  useEffect(() => {
    if (!isOpen) return;
    const activeId = getActiveTeamId();
    if (!activeId) return;
    joinTeam(activeId, currentUser).then(activeTeam => {
      if (activeTeam) setTeam(activeTeam);
    }).catch(() => undefined);
  }, [isOpen, currentUser.uid]);

  useEffect(() => {
    if (!team) return;
    const stopQuestions = subscribeTeamQuestions(team.id, setQuestions);
    const stopMembers = subscribeTeamMembers(team.id, setMembers);
    return () => { stopQuestions(); stopMembers(); };
  }, [team]);

  const openTeam = (nextTeam: TeamWorkspace) => {
    localStorage.setItem(TEAM_STORAGE_KEY, nextTeam.id);
    setTeam(nextTeam);
    onTeamChange(nextTeam);
  };

  const handleCreate = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try { openTeam(await createTeam(name, currentUser)); setName(''); }
    catch (error) { notify(error instanceof Error ? error.message : 'לא הצלחתי ליצור את הקבוצה. נסו שוב.'); }
    finally { setBusy(false); }
  };

  const handleJoin = async () => {
    if (!code.trim()) return;
    setBusy(true);
    try {
      const joined = await joinTeam(code, currentUser);
      if (!joined) notify('לא נמצאה קבוצה עם הקוד הזה.');
      else { openTeam(joined); setCode(''); }
    } catch (error) { notify(error instanceof Error ? error.message : 'לא הצלחתי להצטרף לקבוצה. נסו שוב.'); }
    finally { setBusy(false); }
  };

  const copyCode = () => {
    if (!team) return;
    try { void navigator.clipboard?.writeText(team.id); } catch { /* clipboard unavailable */ }
    setCopied(true);
    notify('הקוד הועתק');
    window.setTimeout(() => setCopied(false), 1600);
  };

  const leaveTeam = () => {
    localStorage.removeItem(TEAM_STORAGE_KEY);
    setTeam(null); setMembers([]); setQuestions([]); onTeamChange(null);
  };

  // No early return: AnimatePresence needs the tree mounted to animate the exit.
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.25, ease: EASE } }}
          exit={{ opacity: 0, transition: { duration: 0.2, ease: EASE } }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
          dir="rtl"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 28 }}
            animate={{ opacity: 1, scale: 1, y: 0, transition: { type: 'spring', stiffness: 340, damping: 30 } }}
            exit={{ opacity: 0, scale: 0.95, y: 16, transition: { duration: 0.22, ease: EASE } }}
            className="w-full max-w-2xl max-h-[88vh] overflow-hidden rounded-3xl border border-white/10 bg-[#0E1628] text-white shadow-2xl"
            role="dialog"
            aria-modal="true"
          >
            <header className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div className="flex items-center gap-3">
                <motion.div
                  animate={{ y: [0, -3, 0] }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0B6BCB]/15 text-[#7FB8EC]"
                >
                  <Users size={20} />
                </motion.div>
                <div>
                  <h2 className="font-black">Team Referee Memory</h2>
                  <p className="text-xs text-slate-400">השאלות והפסיקות של הקבוצה במקום אחד</p>
                </div>
              </div>
              <motion.button
                whileHover={{ rotate: 90 }}
                whileTap={{ scale: 0.9 }}
                transition={{ duration: 0.2 }}
                onClick={onClose}
                aria-label="סגור"
                className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white"
              >
                <X size={18} />
              </motion.button>
            </header>

            <AnimatePresence mode="wait" initial={false}>
              {!team ? (
                <motion.div
                  key="lobby"
                  initial={{ opacity: 0, x: -18 }}
                  animate={{ opacity: 1, x: 0, transition: { duration: 0.28, ease: EASE } }}
                  exit={{ opacity: 0, x: 18, transition: { duration: 0.2, ease: EASE } }}
                  className="grid gap-4 p-5 sm:grid-cols-2"
                >
                  <AnimatePresence>
                    {notice && (
                      <motion.p
                        key="lobby-notice"
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="sm:col-span-2 rounded-xl border border-[#E1251B]/30 bg-[#E1251B]/10 px-3 py-2 text-center text-xs text-red-200"
                      >
                        {notice}
                      </motion.p>
                    )}
                  </AnimatePresence>
                  <motion.section
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0, transition: { duration: 0.35, ease: EASE } }}
                    className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
                  >
                    <h3 className="mb-1 font-black">יוצרים קבוצה</h3>
                    <p className="mb-4 text-xs text-slate-400">שתפו את הקוד עם חברי הקבוצה.</p>
                    <input
                      value={name}
                      onChange={e => setName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') void handleCreate(); }}
                      placeholder="שם הקבוצה"
                      className="mb-3 w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 text-sm outline-none transition-colors focus:border-[#0B6BCB]"
                    />
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      disabled={busy || !name.trim()}
                      onClick={handleCreate}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#FFC400] px-3 py-2.5 font-black text-slate-950 disabled:opacity-40"
                    >
                      {busy ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                      {busy ? 'יוצר קבוצה...' : 'צור קבוצה'}
                    </motion.button>
                  </motion.section>
                  <motion.section
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0, transition: { duration: 0.35, delay: 0.08, ease: EASE } }}
                    className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
                  >
                    <h3 className="mb-1 font-black">מצטרפים לקבוצה</h3>
                    <p className="mb-4 text-xs text-slate-400">הכניסו את הקוד שקיבלתם מחבר.</p>
                    <input
                      value={code}
                      onChange={e => setCode(e.target.value.toUpperCase())}
                      onKeyDown={e => { if (e.key === 'Enter') void handleJoin(); }}
                      placeholder="קוד בן 6 תווים"
                      maxLength={6}
                      className="mb-3 w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 text-center font-black tracking-[0.3em] outline-none transition-colors focus:border-[#0B6BCB]"
                    />
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      disabled={busy || code.trim().length < 6}
                      onClick={handleJoin}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0B6BCB] px-3 py-2.5 font-black text-white disabled:opacity-40"
                    >
                      {busy ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}
                      {busy ? 'מצטרף...' : 'הצטרף'}
                    </motion.button>
                  </motion.section>
                </motion.div>
              ) : (
                <motion.div
                  key="team"
                  initial={{ opacity: 0, x: 18 }}
                  animate={{ opacity: 1, x: 0, transition: { duration: 0.28, ease: EASE } }}
                  exit={{ opacity: 0, x: -18, transition: { duration: 0.2, ease: EASE } }}
                  className="max-h-[calc(88vh-76px)] overflow-y-auto p-5"
                >
                  <motion.div
                    initial={{ opacity: 0, scale: 0.94, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0, transition: { type: 'spring', stiffness: 320, damping: 26 } }}
                    className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#0B6BCB]/30 bg-[#0B6BCB]/10 p-4"
                  >
                    <div>
                      <p className="text-xs text-slate-400">הקבוצה שלך</p>
                      <h3 className="text-xl font-black">{team.name}</h3>
                      <p className="mt-1 text-xs text-slate-400">
                        {members.length} חברים · {questions.length} פסיקות
                      </p>
                    </div>
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      onClick={copyCode}
                      className="flex items-center gap-2 rounded-xl bg-[#FFC400] px-3 py-2 font-black text-slate-950"
                    >
                      <AnimatePresence mode="wait" initial={false}>
                        <motion.span
                          key={copied ? 'copied' : 'code'}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -6 }}
                          transition={{ duration: 0.16 }}
                          className="flex items-center gap-2"
                        >
                          {copied ? <Check size={15} /> : <Copy size={15} />}
                          {copied ? 'הועתק!' : team.id}
                        </motion.span>
                      </AnimatePresence>
                    </motion.button>
                  </motion.div>
                  <motion.div
                    initial="hidden"
                    animate="show"
                    variants={{ show: { transition: { staggerChildren: 0.045, delayChildren: 0.1 } } }}
                    className="mb-5 flex flex-wrap gap-2"
                  >
                    {members.map(member => (
                      <motion.span
                        key={member.uid}
                        variants={{
                          hidden: { opacity: 0, y: 8, scale: 0.9 },
                          show: { opacity: 1, y: 0, scale: 1 },
                        }}
                        className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs text-slate-300"
                      >
                        {member.name || member.email}
                      </motion.span>
                    ))}
                  </motion.div>
                  <AnimatePresence>
                    {notice && (
                      <motion.p
                        key="team-notice"
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="mb-3 rounded-xl border border-[#E1251B]/30 bg-[#E1251B]/10 px-3 py-2 text-center text-xs text-red-200"
                      >
                        {notice}
                      </motion.p>
                    )}
                  </AnimatePresence>
                  <h3 className="mb-3 font-black">פסיקות אחרונות</h3>
                  <motion.div layout className="space-y-3">
                    <AnimatePresence initial={false} mode="popLayout">
                      {questions.length === 0 ? (
                        <motion.p
                          key="empty"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="rounded-2xl border border-dashed border-white/15 p-8 text-center text-sm text-slate-500"
                        >
                          עדיין אין שאלות משותפות. השאלה הבאה שתישאל תופיע כאן.
                        </motion.p>
                      ) : (
                        questions.map(item => (
                          <motion.article
                            key={item.id}
                            layout
                            initial={{ opacity: 0, y: 18, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.35, ease: EASE } }}
                            exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.18 } }}
                            className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"
                          >
                            <div className="mb-2 flex justify-between gap-3 text-xs text-slate-400">
                              <span>{item.authorName}</span>
                              <span>{item.season}</span>
                            </div>
                            <p className="mb-2 font-bold text-slate-100">{item.question}</p>
                            <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{item.answer}</p>
                          </motion.article>
                        ))
                      )}
                    </AnimatePresence>
                  </motion.div>
                  <button onClick={leaveTeam} className="mt-5 text-xs font-bold text-red-300 hover:text-red-200">
                    עזוב קבוצה במכשיר הזה
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
