import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { VideoChat } from './components/VideoChat';
import { AdminPanel } from './components/AdminPanel';
import { HomePage } from './components/HomePage';
import { FirebaseProvider, useFirebase } from './FirebaseContext';
import { ErrorBoundary } from './components/ErrorBoundary';

const AppContent: React.FC = () => {
  const { user, userData, loading } = useFirebase();
  const [isChatting, setIsChatting] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
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
              isChatting && user && !userData?.isBlocked ? (
                <VideoChat onExit={() => setIsChatting(false)} />
              ) : (
                <HomePage onStart={() => setIsChatting(true)} />
              )
            } 
          />
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
      <AppContent />
    </FirebaseProvider>
  );
}
