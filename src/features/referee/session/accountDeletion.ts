/**
 * Account deletion as one staged machine: idle -> confirming ->
 * reauthenticating -> removing-data -> deleting-auth -> (complete -> idle
 * | failed -> confirming with an error).
 *
 * The old model was four booleans/strings (open, deleting, password,
 * error) whose combinations had no names: a failure mid-wipe left the
 * dialog open with "deleting" still true until each failure path cleared
 * it by hand. The stage now carries exactly where a failure happened, and
 * every failure lands in the same legal state: dialog open, not busy,
 * error shown.
 */
type DeletionStage =
  | 'idle'
  | 'confirming'
  | 'reauthenticating'
  | 'removing-data'
  | 'deleting-auth';

export type AccountDeletionState = {
  stage: DeletionStage;
  password: string;
  error: string | null;
};

export const initialAccountDeletion: AccountDeletionState = {
  stage: 'idle',
  password: '',
  error: null,
};

export const openDeletionConfirm = (): AccountDeletionState =>
  ({ stage: 'confirming', password: '', error: null });

/** Cancel is only legal while not busy; mid-wipe closes are rejected. */
export const cancelDeletion = (state: AccountDeletionState): AccountDeletionState =>
  isDeleting(state) ? state : initialAccountDeletion;

export const setDeletionPassword = (state: AccountDeletionState, password: string): AccountDeletionState =>
  ({ ...state, password });

export const clearDeletionError = (state: AccountDeletionState): AccountDeletionState =>
  ({ ...state, error: null });

/** Validation failure stays in 'confirming' with the error shown. */
export const rejectDeletion = (state: AccountDeletionState, error: string): AccountDeletionState =>
  ({ stage: 'confirming', password: state.password, error });

export const beginReauth = (state: AccountDeletionState): AccountDeletionState =>
  ({ stage: 'reauthenticating', password: state.password, error: null });

export const beginRemovingData = (state: AccountDeletionState): AccountDeletionState =>
  ({ ...state, stage: 'removing-data' });

export const beginDeletingAuth = (state: AccountDeletionState): AccountDeletionState =>
  ({ ...state, stage: 'deleting-auth' });

/** Any mid-flow failure: dialog open, not busy, error shown, password kept. */
export const failDeletion = (state: AccountDeletionState, error: string): AccountDeletionState =>
  ({ stage: 'confirming', password: state.password, error });

export const completeDeletion = (): AccountDeletionState => initialAccountDeletion;

export const isDeleting = (state: AccountDeletionState): boolean =>
  state.stage === 'reauthenticating' || state.stage === 'removing-data' || state.stage === 'deleting-auth';

export const isDeletionDialogOpen = (state: AccountDeletionState): boolean =>
  state.stage !== 'idle';
