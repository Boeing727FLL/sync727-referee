/** firebase/rtdb.ts — the Realtime Database singleton (analytics/presence/flags). */
import { getDatabase } from "firebase/database";
import { app } from './app';

export const rtdb = getDatabase(app);
