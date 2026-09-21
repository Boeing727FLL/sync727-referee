/**
 * Login page view machine: exactly one of sign-in, sign-up, or password
 * reset is on screen. The old isSignUp/showReset boolean pair allowed the
 * illegal combination (sign-up + reset at once) when the mode toggle was
 * pressed with the reset view open.
 */
export type LoginView = 'signin' | 'signup' | 'reset';

export const initialLoginView: LoginView = 'signin';

export const showResetView = (): LoginView => 'reset';
export const exitResetView = (): LoginView => 'signin';
export const toggleSignMode = (view: LoginView): LoginView =>
  view === 'signup' ? 'signin' : 'signup';

export const isSignUpView = (view: LoginView): boolean => view === 'signup';
export const isResetView = (view: LoginView): boolean => view === 'reset';
