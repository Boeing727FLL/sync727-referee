import { useNavigate } from 'react-router-dom';
import { ArrowRight, ShieldCheck } from 'lucide-react';

export default function PrivacyPage() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-6 md:p-10" dir="rtl">
      <div className="max-w-2xl mx-auto">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-1.5 text-sm font-bold text-slate-400 hover:text-white mb-6 cursor-pointer"
        >
          <ArrowRight className="w-4 h-4" />
          חזרה לאפליקציה
        </button>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-11 h-11 rounded-2xl bg-blue-600/15 border border-blue-500/25 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-blue-300" />
          </div>
          <h1 className="text-2xl font-black text-white">מדיניות פרטיות</h1>
        </div>
        <div className="space-y-4 text-sm leading-relaxed">
          <p>
            שופט הזירה הווירטואלי שומר את המידע הדרוש להפעלת השירות בלבד.
            בעת הרשמה נשמרים כתובת האימייל והשם שהזנתם.
            שאלות ותשובות נשמרות ביומן פנימי כדי שהשופטים הראשיים יוכלו לבדוק איכות,
            ומשובים נשמרים כדי לשפר את השירות.
          </p>
          <p>
            רשומות יומן ישנות מ90 יום נמחקות מעת לעת.
            איננו מוכרים מידע ואיננו משתפים אותו עם גורמים חיצוניים.
          </p>
          <p>
            בכל עת ניתן למחוק את החשבון מתוך האפליקציה, כפתור מחיקת חשבון ליד פרטי המשתמש.
            המחיקה מסירה את החשבון ואת מסמך המשתמש לצמיתות.
          </p>
          <p>
            לשאלות בנושא פרטיות ניתן לפנות לכתובת boeing727.il@gmail.com.
          </p>
        </div>
      </div>
    </div>
  );
}
