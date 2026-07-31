import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Gavel, Eye, EyeOff, CheckCircle2, AlertCircle, Loader2, ArrowRight } from 'lucide-react';
import { confirmPasswordReset, verifyPasswordResetCode } from 'firebase/auth';
import { auth } from '../lib/firebase';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [oobCode, setOobCode] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const code = searchParams.get('oobCode');
    const mode = searchParams.get('mode');
    if (mode === 'resetPassword' && code) {
      setOobCode(code);
      verifyPasswordResetCode(auth, code)
        .then((emailAddr) => {
          setEmail(emailAddr);
          setLoading(false);
        })
        .catch(() => {
          setError('קישור האיפוס פג תוקף או שאינו תקין.');
          setLoading(false);
        });
    } else {
      setError('קישור איפוס הסיסמה אינו תקין.');
      setLoading(false);
    }
  }, [searchParams]);

  const handleReset = async () => {
    setError('');
    if (!newPassword || newPassword.length < 6) {
      setError('הסיסמה חייבת להכיל לפחות 6 תווים.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('הסיסמאות אינן תואמות.');
      return;
    }
    if (!oobCode) return;

    setSaving(true);
    try {
      await confirmPasswordReset(auth, oobCode, newPassword);
      setSuccess(true);
    } catch (err: any) {
      setError('אירעה שגיאה. נסה שוב.');
    } finally {
      setSaving(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4" dir="rtl">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md bg-slate-900 rounded-3xl border-2 border-slate-700 shadow-[0_0_40px_rgba(34,197,94,0.1)] p-8 text-center"
        >
          <CheckCircle2 className="w-16 h-16 text-green-400 mx-auto mb-4" />
          <h1 className="text-2xl font-black text-white mb-2">הסיסמה אופשרה!</h1>
          <p className="text-slate-400 mb-6">עכשיו תוכל להתחבר עם הסיסמה החדשה.</p>
          <button
            onClick={() => navigate('/login')}
            className="w-full py-3 bg-yellow-400 hover:bg-yellow-300 text-slate-950 font-black rounded-xl transition-all border-2 border-slate-950 shadow-[2px_2px_0px_rgba(0,0,0,1)] active:scale-95 cursor-pointer flex items-center justify-center gap-2"
          >
            <span>חזרה להתחברות</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </motion.div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4" dir="rtl">
        <div className="text-center">
          <Loader2 className="w-10 h-10 text-yellow-400 animate-spin mx-auto mb-3" />
          <p className="text-slate-400 font-bold">בודק קישור...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4" dir="rtl">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="bg-slate-900 rounded-3xl border-2 border-slate-700 shadow-[0_0_40px_rgba(250,204,21,0.05)] overflow-hidden">
          {/* Header */}
          <div className="h-3.5 bg-[repeating-linear-gradient(45deg,#000000,#000000_15px,#ffffff_15px,#ffffff_30px)] border-b border-slate-700" />

          <div className="p-8">
            {/* Logo */}
            <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-5 shadow-inner border border-slate-700">
              <Gavel className="w-8 h-8 text-yellow-400" />
            </div>

            <h1 className="text-2xl font-black text-white text-center mb-1">איפוס סיסמה</h1>
            <p className="text-slate-400 text-sm text-center mb-6">
              עבור <span className="text-white font-bold">{email}</span>
            </p>

            {error && (
              <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-xl p-3 mb-4">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <span className="text-red-400 text-sm font-bold">{error}</span>
              </div>
            )}

            {/* Password fields */}
            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-xs font-black text-slate-400 mb-1.5 uppercase tracking-wide">סיסמה חדשה</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full bg-slate-800 border-2 border-slate-600 rounded-xl px-4 py-3 text-white font-bold focus:outline-none focus:border-yellow-400 transition-colors placeholder-slate-500"
                    placeholder="הכנס סיסמה חדשה"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-slate-400 mb-1.5 uppercase tracking-wide">אישור סיסמה</label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleReset()}
                  className="w-full bg-slate-800 border-2 border-slate-600 rounded-xl px-4 py-3 text-white font-bold focus:outline-none focus:border-yellow-400 transition-colors placeholder-slate-500"
                  placeholder="הכנס שוב את הסיסמה"
                />
              </div>
            </div>

            <button
              onClick={handleReset}
              disabled={saving || !newPassword || !confirmPassword}
              className="w-full py-3 bg-yellow-400 hover:bg-yellow-300 text-slate-950 font-black rounded-xl transition-all border-2 border-slate-950 shadow-[2px_2px_0px_rgba(0,0,0,1)] active:scale-95 cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <span>שמור סיסמה חדשה</span>
                  <CheckCircle2 className="w-4 h-4" />
                </>
              )}
            </button>

            <button
              onClick={() => navigate('/login')}
              className="w-full mt-3 py-2 text-slate-400 hover:text-white text-sm font-bold transition-colors cursor-pointer"
            >
              חזרה להתחברות
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
