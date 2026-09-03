import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import { LanguageProvider } from './hooks/useLanguage';
import PublicRulebookAI from './pages/PublicRulebookAI';
import LoginPage from './pages/LoginPage';
import FeedbackAdminPage from './pages/FeedbackAdminPage';
import PrivacyPage from './pages/PrivacyPage';

function App() {
  return (
    <BrowserRouter>
      <LanguageProvider>
        <AuthProvider>
          <div className="w-full h-screen h-[100dvh]">
            <Routes>
              <Route path="/" element={<PublicRulebookAI />} />
              <Route path="/app" element={<PublicRulebookAI />} />
              <Route path="/login" element={<LoginPage />} />
            <Route path="/feedback-view" element={<FeedbackAdminPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
              <Route path="*" element={<PublicRulebookAI />} />
            </Routes>
          </div>
        </AuthProvider>
      </LanguageProvider>
    </BrowserRouter>
  );
}

export default App;