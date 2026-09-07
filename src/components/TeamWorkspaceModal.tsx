import { useEffect, useState } from 'react';
import { Copy, LogIn, Plus, Users, X } from 'lucide-react';
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

export default function TeamWorkspaceModal({ isOpen, onClose, currentUser, onTeamChange }: Props) {
  const [team, setTeam] = useState<TeamWorkspace | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [questions, setQuestions] = useState<TeamQuestion[]>([]);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
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
    catch { notify('לא הצלחתי ליצור את הקבוצה. נסו שוב.'); }
    finally { setBusy(false); }
  };

  const handleJoin = async () => {
    if (!code.trim()) return;
    setBusy(true);
    try {
      const joined = await joinTeam(code, currentUser);
      if (!joined) notify('לא נמצאה קבוצה עם הקוד הזה.');
      else { openTeam(joined); setCode(''); }
    } catch { notify('לא הצלחתי להצטרף לקבוצה. נסו שוב.'); }
    finally { setBusy(false); }
  };

  const leaveTeam = () => {
    localStorage.removeItem(TEAM_STORAGE_KEY);
    setTeam(null); setMembers([]); setQuestions([]); onTeamChange(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm" dir="rtl">
      <div className="w-full max-w-2xl max-h-[88vh] overflow-hidden rounded-3xl border border-white/10 bg-[#0E1628] text-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0B6BCB]/15 text-[#7FB8EC]"><Users size={20} /></div>
            <div><h2 className="font-black">Team Referee Memory</h2><p className="text-xs text-slate-400">השאלות והפסיקות של הקבוצה במקום אחד</p></div>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white"><X size={18} /></button>
        </header>

        {!team ? (
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <h3 className="mb-1 font-black">יוצרים קבוצה</h3><p className="mb-4 text-xs text-slate-400">שתפו את הקוד עם חברי הקבוצה.</p>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="שם הקבוצה" className="mb-3 w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 text-sm outline-none focus:border-[#0B6BCB]" />
              <button disabled={busy || !name.trim()} onClick={handleCreate} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#FFC400] px-3 py-2.5 font-black text-slate-950 disabled:opacity-40"><Plus size={16} /> צור קבוצה</button>
            </section>
            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <h3 className="mb-1 font-black">מצטרפים לקבוצה</h3><p className="mb-4 text-xs text-slate-400">הכניסו את הקוד שקיבלתם מחבר.</p>
              <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="קוד בן 6 תווים" maxLength={6} className="mb-3 w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 text-center font-black tracking-[0.3em] outline-none focus:border-[#0B6BCB]" />
              <button disabled={busy || code.trim().length < 6} onClick={handleJoin} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0B6BCB] px-3 py-2.5 font-black text-white disabled:opacity-40"><LogIn size={16} /> הצטרף</button>
            </section>
          </div>
        ) : (
          <div className="max-h-[calc(88vh-76px)] overflow-y-auto p-5">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#0B6BCB]/30 bg-[#0B6BCB]/10 p-4">
              <div><p className="text-xs text-slate-400">הקבוצה שלך</p><h3 className="text-xl font-black">{team.name}</h3></div>
              <button onClick={() => { navigator.clipboard?.writeText(team.id); notify('הקוד הועתק'); }} className="flex items-center gap-2 rounded-xl bg-[#FFC400] px-3 py-2 font-black text-slate-950"><Copy size={15} /> {team.id}</button>
            </div>
            <div className="mb-5 flex flex-wrap gap-2">{members.map(member => <span key={member.uid} className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs text-slate-300">{member.name || member.email}</span>)}</div>
            {notice && <p className="mb-3 rounded-xl border border-[#E1251B]/30 bg-[#E1251B]/10 px-3 py-2 text-center text-xs text-red-200">{notice}</p>}
            <h3 className="mb-3 font-black">פסיקות אחרונות</h3>
            <div className="space-y-3">
              {!questions.length && <p className="rounded-2xl border border-dashed border-white/15 p-8 text-center text-sm text-slate-500">עדיין אין שאלות משותפות. השאלה הבאה שתישאל תופיע כאן.</p>}
              {questions.map(item => <article key={item.id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"><div className="mb-2 flex justify-between gap-3 text-xs text-slate-400"><span>{item.authorName}</span><span>{item.season}</span></div><p className="mb-2 font-bold text-slate-100">{item.question}</p><p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{item.answer}</p></article>)}
            </div>
            <button onClick={leaveTeam} className="mt-5 text-xs font-bold text-red-300 hover:text-red-200">עזוב קבוצה במכשיר הזה</button>
          </div>
        )}
      </div>
    </div>
  );
}
