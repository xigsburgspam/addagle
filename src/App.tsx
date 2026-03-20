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
import { auth, db, doc, updateDoc } from './firebase';
import { FootballLobby } from './components/FootballLobby';
import { FootballRoom } from './components/FootballRoom';
import { CustomChatLobby } from './components/CustomChatLobby';
import { CustomChatRoom } from './components/CustomChatRoom';

const AppContent: React.FC = () => {
  const { user, userData, loading } = useFirebase();
  const { t } = useLanguage();
  const [isChatting, setIsChatting] = useState(false);
  const [chatMode, setChatMode] = useState<'video' | 'text'>('video');
  const [showFootballLobby, setShowFootballLobby] = useState(false);
  const [footballMatch,     setFootballMatch]     = useState<any>(null);
  const [footballName,      setFootballName]      = useState('');
  const [showCustomChatLobby, setShowCustomChatLobby] = useState(false);
  const [customChatRoomData, setCustomChatRoomData] = useState<any>(null);

  const [userName, setUserName] = useState('');

  // Periodic temp-block expiry check — every 60 seconds
  React.useEffect(() => {
    if (!user || !userData?.tempBlockedUntil) return;
    const check = () => {
      if (userData?.tempBlockedUntil && Date.now() > userData.tempBlockedUntil) {
        updateDoc(doc(db, 'users', user.uid), { isBlocked: false, tempBlockedUntil: null })
          .catch(() => {});
      }
    };
    check(); // immediate check
    const interval = setInterval(check, 60000);
    return () => clearInterval(interval);
  }, [user?.uid, userData?.tempBlockedUntil]);

  React.useEffect(() => {
    const handleSwitchToDistrict = (e: any) => {
      const { district, name } = e.detail;
      setCustomChatRoomData({ 
        action: 'create', 
        userName: name, 
        roomName: `district-${district}`, 
        maxMembers: 100, 
        mode: 'district', 
        districtName: district 
      });
    };
    window.addEventListener('switch-to-district', handleSwitchToDistrict);
    return () => window.removeEventListener('switch-to-district', handleSwitchToDistrict);
  }, []);

  const startChat = (mode: 'video' | 'text', name: string) => {
    setUserName(name);
    setChatMode(mode);
    setIsChatting(true);
  };

  const watchFootball = (name: string) => {
    setUserName(name);
    setShowFootballLobby(true);
  };

  const openCustomChat = (name: string) => {
    setUserName(name);
    setShowCustomChatLobby(true);
  };

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
          <h1 className="text-3xl font-black text-white uppercase tracking-tighter mb-4">{t.accessRevoked}</h1>
          <p className="text-neutral-400 font-medium mb-8">Your account has been permanently suspended for violating our community guidelines. This action is final.</p>
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
                  <VideoChat mode={chatMode} userName={userName} onExit={() => setIsChatting(false)} />
                ) : (
                  <HomePage 
                    onStart={startChat} 
                    onWatchFootball={watchFootball} 
                    onCustomChat={openCustomChat}
                  />
                )}
                {showFootballLobby && (
                  <FootballLobby
                    onClose={() => setShowFootballLobby(false)}
                    userName={userName}
                    onEnter={(match, name) => {
                      setFootballMatch(match);
                      setFootballName(name);
                      setShowFootballLobby(false);
                    }}
                  />
                )}
                {footballMatch && (
                  <div className="fixed inset-0 z-[150]">
                    <FootballRoom
                      match={footballMatch}
                      userName={footballName}
                      onLeave={() => setFootballMatch(null)}
                    />
                  </div>
                )}
                {showCustomChatLobby && (
                  <CustomChatLobby
                    onClose={() => setShowCustomChatLobby(false)}
                    initialName={userName}
                    onJoinGlobal={(name) => {
                      setCustomChatRoomData({ action: 'global', userName: name });
                      setShowCustomChatLobby(false);
                    }}
                    onCreateRoom={(name, roomName, maxMembers, mode, districtName) => {
                      setCustomChatRoomData({ action: 'create', userName: name, roomName: mode === 'district' ? `district-${districtName}` : roomName, maxMembers, mode, districtName });
                      setShowCustomChatLobby(false);
                    }}
                    onJoinRoom={(name, roomName) => {
                      setCustomChatRoomData({ action: 'join', userName: name, roomName });
                      setShowCustomChatLobby(false);
                    }}
                  />
                )}
                {customChatRoomData && (
                  <div className="fixed inset-0 z-[150]">
                    <CustomChatRoom
                      roomData={customChatRoomData}
                      onLeave={() => setCustomChatRoomData(null)}
                      onSwitchRoom={(newData) => setCustomChatRoomData(newData)}
                    />
                  </div>
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