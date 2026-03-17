import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { VideoChat } from './components/VideoChat';
import { AdminPanel } from './components/AdminPanel';
import { HomePage } from './components/HomePage';
import { FirebaseProvider, useFirebase } from './FirebaseContext';
import { LanguageProvider, useLanguage } from './LanguageContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { CookieConsent } from './components/CookieConsent';
import { TermsPrivacy } from './components/TermsPrivacy';
import { ShieldAlert } from 'lucide-react';
import { auth } from './firebase';

const AppContent: React.FC = () => {
  const { user, userData, loading } = useFirebase();
  const { t } = useLanguage();
  const [isChatting, setIsChatting] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (userData?.isBlocked) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-neutral-900 border border-red-500/20 p-8 rounded-[40px] text-center shadow-2xl">
          <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <ShieldAlert className="w-10 h-10 text-red-500" />
          </div>
          <h1 className="text-3xl font-black text-white uppercase tracking-tighter italic mb-4">{t.accessRevoked}</h1>
          <p className="text-neutral-400 font-medium mb-8">Your account has been permanently suspended for violating our community guidelines. This action is final.</p>
          <button 
            onClick={() => auth.signOut()}
            className="w-full py-4 bg-neutral-800 hover:bg-neutral-700 text-white rounded-2xl font-black uppercase tracking-widest text-xs transition-all"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <Router>
        <Routes>
          <Route 
            path="/" 
            element={
              <>
                {isChatting && user && !userData?.isBlocked ? (
                  <VideoChat onExit={() => setIsChatting(false)} />
                ) : (
                  <HomePage onStart={() => setIsChatting(true)} />
                )}
                <CookieConsent />
              </>
            } 
          />
          <Route path="/terms" element={<TermsPrivacy type="terms" />} />
          <Route path="/privacy" element={<TermsPrivacy type="privacy" />} />
          <Route path="/xigadmin" element={<AdminPanel />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </ErrorBoundary>
  );
};

export default function App() {
  return (
    <FirebaseProvider>
      <LanguageProvider>
        <AppContent />
      </LanguageProvider>
    </FirebaseProvider>
  );
}
