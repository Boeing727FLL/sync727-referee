import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import PublicRulebookAI from './pages/PublicRulebookAI';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <div className="w-full h-screen h-[100dvh]">
          <Routes>
            <Route path="/" element={<PublicRulebookAI />} />
            <Route path="/app" element={<PublicRulebookAI />} />
            <Route path="*" element={<PublicRulebookAI />} />
          </Routes>
        </div>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;