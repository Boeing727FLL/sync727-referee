import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  limit,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../lib/firebase';

export type TeamMember = { uid: string; name: string; email: string; joinedAt?: unknown };
export type TeamQuestion = {
  id: string;
  question: string;
  answer: string;
  season: string;
  language: string;
  authorUid: string;
  authorName: string;
  createdAt?: unknown;
};
export type TeamWorkspace = { id: string; name: string; createdBy: string };

const teamRef = (teamId: string) => doc(db, 'teams', teamId);
const membersRef = (teamId: string) => collection(db, 'teams', teamId, 'members');
const questionsRef = (teamId: string) => collection(db, 'teams', teamId, 'questions');
export const TEAM_STORAGE_KEY = 'referee_team_workspace';

export function getActiveTeamId(): string {
  return localStorage.getItem(TEAM_STORAGE_KEY) || '';
}

function makeTeamCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, byte => (byte % 36).toString(36)).join('').toUpperCase();
}

export async function createTeam(name: string, user: TeamMember): Promise<TeamWorkspace> {
  const id = makeTeamCode();
  await setDoc(teamRef(id), { name: name.trim(), createdBy: user.uid, createdAt: serverTimestamp() });
  await setDoc(doc(membersRef(id), user.uid), { ...user, joinedAt: serverTimestamp() });
  return { id, name: name.trim(), createdBy: user.uid };
}

export async function joinTeam(id: string, user: TeamMember): Promise<TeamWorkspace | null> {
  const snapshot = await getDoc(teamRef(id.trim().toUpperCase()));
  if (!snapshot.exists()) return null;
  const teamId = snapshot.id;
  await setDoc(doc(membersRef(teamId), user.uid), { ...user, joinedAt: serverTimestamp() }, { merge: true });
  return { id: teamId, ...(snapshot.data() as Omit<TeamWorkspace, 'id'>) };
}

export function subscribeTeamQuestions(teamId: string, onChange: (questions: TeamQuestion[]) => void): Unsubscribe {
  return onSnapshot(query(questionsRef(teamId), orderBy('createdAt', 'desc'), limit(100)), snapshot => {
    onChange(snapshot.docs.map(item => ({ id: item.id, ...item.data() } as TeamQuestion)));
  });
}

export function subscribeTeamMembers(teamId: string, onChange: (members: TeamMember[]) => void): Unsubscribe {
  return onSnapshot(query(membersRef(teamId), orderBy('joinedAt', 'asc')), snapshot => {
    onChange(snapshot.docs.map(item => item.data() as TeamMember));
  });
}

export async function saveTeamQuestion(
  teamId: string,
  question: Omit<TeamQuestion, 'id' | 'createdAt'>,
): Promise<void> {
  await addDoc(questionsRef(teamId), { ...question, createdAt: serverTimestamp() });
}
