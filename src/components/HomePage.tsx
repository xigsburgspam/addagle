import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useFirebase } from '../FirebaseContext';
import { useLanguage } from '../LanguageContext';
import { auth, googleProvider, signInWithPopup, db, doc, onSnapshot, collection, query, orderBy, updateDoc } from '../firebase';
import { Ghost, Shield, MessageSquare, Zap, ArrowRight, Globe, Lock, UserCheck, Languages, Info, MessageCircle, Users, Video, Tv2, Map as MapIcon, Check, X, Bell, Copy, Link } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AdminPopup } from './AdminPopup';
import { AccountSection } from './AccountSection';
import { containsBanned } from '../constants';

const BANGLADESH_DISTRICTS = [
  "Dhaka", "Faridpur", "Gazipur", "Gopalganj", "Kishoreganj", "Madaripur", "Manikganj", "Munshiganj", "Narayanganj", "Narsingdi", "Rajbari", "Shariatpur", "Tangail",
  "Bagerhat", "Chuadanga", "Jessore", "Jhenaidah", "Khulna", "Kushtia", "Magura", "Meherpur", "Narail", "Satkhira",
  "Bogra", "Joypurhat", "Naogaon", "Natore", "Chapai Nawabganj", "Pabna", "Rajshahi", "Sirajganj",
  "Dinajpur", "Gaibandha", "Kurigram", "Lalmonirhat", "Nilphamari", "Panchagarh", "Rangpur", "Thakurgaon",
  "Habiganj", "Moulvibazar", "Sunamganj", "Sylhet",
  "Barguna", "Barisal", "Bhola", "Jhalokati", "Patuakhali", "Pirojpur",
  "Bandarban", "Brahmanbaria", "Chandpur", "Chittagong", "Comilla", "Cox's Bazar", "Feni", "Khagrachhari", "Lakshmipur", "Noakhali", "Rangamati",
  "Sherpur", "Jamalpur", "Netrokona", "Mymensingh"
];

const DisplayNamePrompt: React.FC<{ onConfirm: (name: string, save: boolean) => void; onClose: () => void }> = ({ onConfirm, onClose }) => {
  const [name, setName] = useState('');
  const [save, setSave] = useState(false);
  const [error, setError] = useState('');

  const handleConfirm = () => {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError('Name must be at least 2 characters');
      return;
    }
    if (containsBanned(trimmed)) {
      setError('That name contains prohibited words.');
      return;
    }
    onConfirm(trimmed, save);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md"
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-[32px] p-8 shadow-2xl"
      >
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-2xl font-black uppercase tracking-tighter">Enter Your Name</h3>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full transition-colors">
            <X className="w-6 h-6 text-neutral-500" />
          </button>
        </div>

        <div className="space-y-6">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-neutral-500 mb-2 ml-1">Display Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => { 
                if (e.target.value.length <= 12) {
                  setName(e.target.value); 
                  setError(''); 
                }
              }}
              placeholder="How should we call you? (Max 12 chars)"
              className="w-full bg-black border border-neutral-800 rounded-2xl px-6 py-4 text-white placeholder:text-neutral-700 focus:outline-none focus:border-emerald-500/50 transition-all font-bold"
              autoFocus
            />
            {error && <p className="text-red-400 text-[10px] font-bold uppercase tracking-widest mt-2 ml-1">{error}</p>}
          </div>

          <button
            onClick={() => setSave(!save)}
            className="flex items-center gap-3 group cursor-pointer"
          >
            <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${save ? 'bg-emerald-500 border-emerald-500' : 'border-neutral-800 group-hover:border-neutral-700'}`}>
              {save && <Check className="w-4 h-4 text-black" />}
            </div>
            <span className="text-sm font-bold text-neutral-400 group-hover:text-neutral-300">Save this name for all chats</span>
          </button>

          <button
            disabled={!name.trim()}
            onClick={handleConfirm}
            className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:hover:bg-emerald-500 text-black font-black py-4 rounded-2xl transition-all uppercase tracking-widest"
          >
            Confirm & Join
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};


export const HomePage: React.FC<{
  onStart: (mode: 'video' | 'text', name: string) => void;
  onWatchFootball: (name: string) => void;
  onCustomChat: (name: string) => void;
}> = ({ onStart, onWatchFootball, onCustomChat }) => {
  const { user, userData, loading, updateDisplayName } = useFirebase();
  const { language, setLanguage, t } = useLanguage();
  const [isAdminPopupOpen, setIsAdminPopupOpen] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [showAnnouncements, setShowAnnouncements] = useState(false);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [showNamePrompt, setShowNamePrompt] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ type: 'video' | 'text' | 'football' | 'custom' } | null>(null);
  const [stats, setStats] = useState({
    onlineUsers: 0,
    videoChatting: 0,
    textChatting: 0,
    customChatting: 0,
    footballChatting: 0,
    totalVideoChats: 0,
    totalTextChats: 0,
    totalAccounts: 0,
    districtUsers: {} as Record<string, number>,
  });

  // Load announcements and compute unread count
  useEffect(() => {
    const q = query(collection(db, 'announcements'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setAnnouncements(all);
      if (userData) {
        const seen = userData.seenAnnouncements || [];
        setUnreadCount(all.filter((a: any) => !seen.includes(a.id)).length);
      }
    }, () => {});
    return () => unsub();
  }, [userData?.seenAnnouncements]);

  // Live counters from /api/stats
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/stats');
        if (res.ok) {
          const data = await res.json();
          setStats(prev => ({
            ...prev,
            onlineUsers: data.onlineUsers || 0,
            videoChatting: data.videoChatting || 0,
            textChatting: data.textChatting || 0,
            customChatting: data.customChatting || 0,
            footballChatting: data.footballChatting || 0,
            districtUsers: data.districtUsers || {},
          }));
        }


        if (user?.uid) {
        }
      } catch (e) {
        console.error('Failed to fetch stats:', e);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, []);

  // Persistent counters from Firestore
  useEffect(() => {
    const statsRef = doc(db, 'stats', 'global');
    const unsub = onSnapshot(statsRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setStats(prev => ({
          ...prev,
          totalVideoChats: data.totalVideoChats || 0,
          totalTextChats: data.totalTextChats || 0,
          totalAccounts: data.totalAccounts || 0,
        }));
      }
    }, (e) => {
      console.error('Firestore stats listen failed:', e);
    });
    return () => unsub();
  }, []);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      console.error('Login failed:', e);
    }
  };

  const markAnnouncementsSeen = async () => {
    if (!user || announcements.length === 0) return;
    const allIds = announcements.map((a: any) => a.id);
    try {
      await updateDoc(doc(db, 'users', user.uid), { seenAnnouncements: allIds });
      setUnreadCount(0);
    } catch(e) { console.error(e); }
  };

  const copyInviteLink = () => {
    const code = userData?.inviteCode || user?.uid?.slice(0, 8).toUpperCase();
    const link = `${window.location.origin}?ref=${code}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopiedInvite(true);
      setTimeout(() => setCopiedInvite(false), 2000);
    });
  };

  const handleAction = async (type: 'video' | 'text' | 'football' | 'custom') => {
    if (type === 'video' && userData?.role !== 'admin') {
      const userTokens = userData?.tokens ?? 100;
      if (userTokens < 7) {
        alert(`Not enough tokens! You need 7 tokens per video call. You have ${userTokens} tokens.`);
        return;
      }
    }
    if (type === 'custom' && userData?.role !== 'admin') {
      const userTokens = userData?.tokens ?? 100;
      if (userTokens < 4) {
        alert(`Not enough tokens! You need 4 tokens to join a custom chat room. You have ${userTokens} tokens.`);
        return;
      }
    }
    if (userData?.hasSavedName && userData?.savedDisplayName) {
      executeAction(type, userData.savedDisplayName);
    } else {
      setPendingAction({ type });
      setShowNamePrompt(true);
    }
  };

  const executeAction = (type: 'video' | 'text' | 'football' | 'custom', name: string) => {
    if (type === 'video' || type === 'text') onStart(type, name);
    else if (type === 'football') onWatchFootball(name);
    else if (type === 'custom') onCustomChat(name);
  };

  const handleNameConfirm = async (name: string, save: boolean) => {
    if (save) {
      await updateDisplayName(name, true);
    }
    setShowNamePrompt(false);
    if (pendingAction) {
      executeAction(pendingAction.type, name);
      setPendingAction(null);
    }
  };

  if (loading) return null;

  return (
    <div className="min-h-screen bg-neutral-950 text-white selection:bg-emerald-500/30 overflow-x-hidden">
      {/* Background Grid Pattern */}
      <div className="fixed inset-0 z-0 opacity-[0.03] pointer-events-none"
           style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 p-6 flex justify-between items-center bg-gradient-to-b from-neutral-950 to-transparent">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center">
            <Ghost className="w-6 h-6 text-white" />
          </div>
          <span className="text-2xl font-black tracking-widest uppercase font-brand bg-gradient-to-r from-emerald-500 to-emerald-400 bg-clip-text text-transparent">{t.appName}</span>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={() => setIsAdminPopupOpen(true)}
            className="px-4 py-3 bg-neutral-900/50 backdrop-blur-xl border border-neutral-800 rounded-xl text-neutral-500 hover:text-emerald-500 hover:border-emerald-500/30 transition-all flex items-center gap-2"
          >
            <span className="text-[10px] font-black uppercase tracking-widest">{t.adminInfo}</span>
          </button>

          <div className="flex items-center gap-2 bg-neutral-900/50 backdrop-blur-xl border border-neutral-800 p-1 rounded-xl">
            <button
              onClick={() => setLanguage('en')}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${language === 'en' ? 'bg-emerald-500 text-black' : 'text-neutral-500 hover:text-white'}`}
            >
              EN
            </button>
            <button
              onClick={() => setLanguage('bn')}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${language === 'bn' ? 'bg-emerald-500 text-black' : 'text-neutral-500 hover:text-white'}`}
            >
              BN
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="relative z-10 max-w-5xl mx-auto px-6 pt-32 pb-40">
        <div className="flex flex-col items-center text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col items-center w-full"
          >
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase tracking-[0.2em] mb-10">
              <Zap className="w-3 h-3" />
              Next-Gen Video Protocol
            </div>

            <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-[100px] font-black tracking-tighter leading-[0.85] mb-10 uppercase bg-gradient-to-br from-white via-white to-neutral-600 bg-clip-text text-transparent">
              {t.tagline.split(' ').map((word, i) => (
                <React.Fragment key={i}>
                  {word === 'Strangers' || word === 'অপরিচিতদের'
                    ? <span className="text-emerald-500 bg-gradient-to-r from-emerald-400 to-emerald-600 bg-clip-text text-transparent">{word}</span>
                    : word}
                  {i === 1 && <br />}
                  {' '}
                </React.Fragment>
              ))}
            </h1>

            <p className="text-xl text-neutral-400 max-w-2xl mx-auto mb-12 leading-relaxed font-medium">
              {t.description}
            </p>

            <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 justify-center w-full">
              {user ? (
                userData?.isBlocked ? (
                  <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-6 rounded-3xl text-center font-bold w-full">
                    {t.accessRevoked}
                  </div>
                ) : (
                  <>{(() => {
                      const userTokens = userData?.tokens ?? 100;
                      const noTokens = userData?.role !== 'admin' && userTokens < 7;
                      return (
                    <button
                      onClick={() => handleAction('video')}
                      disabled={noTokens}
                      title={noTokens ? `Not enough tokens (need 7, have ${userTokens})` : ''}
                      className="group relative bg-gradient-to-r from-emerald-500 to-emerald-600 text-black px-8 sm:px-10 py-4 sm:py-5 rounded-2xl font-black text-lg sm:text-xl flex items-center justify-center gap-3 hover:from-emerald-400 hover:to-emerald-500 transition-all duration-500 shadow-2xl shadow-emerald-500/20 w-full sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed disabled:from-neutral-700 disabled:to-neutral-800 disabled:text-neutral-400 disabled:shadow-none"
                    >
                      <div className="flex flex-col items-center">
                        <div className="flex items-center gap-3">
                          {noTokens ? `Not Enough Tokens (${userTokens}/7)` : t.startEncounter}
                          {!noTokens && <ArrowRight className="w-5 h-5 sm:w-6 sm:h-6 group-hover:translate-x-2 transition-transform duration-500" />}
                        </div>
                      </div>
                    </button>
                      );
                    })()}

                    <button
                      onClick={() => handleAction('text')}
                      className="group relative bg-neutral-900 border border-neutral-800 text-white px-8 sm:px-10 py-4 sm:py-5 rounded-2xl font-black text-lg sm:text-xl flex items-center justify-center gap-3 hover:border-emerald-500/50 hover:bg-gradient-to-r hover:from-neutral-900 hover:to-neutral-800 transition-all duration-500 w-full sm:w-auto"
                    >
                      {t.startTextChat}
                      <MessageSquare className="w-5 h-5 sm:w-6 sm:h-6 group-hover:scale-110 transition-transform duration-500" />
                    </button>

                    <button
                      onClick={() => handleAction('football')}
                      className="group relative overflow-hidden bg-gradient-to-r from-green-600 to-emerald-700 text-white px-8 sm:px-10 py-4 sm:py-5 rounded-2xl font-black text-lg sm:text-xl flex items-center justify-center gap-3 hover:from-green-500 hover:to-emerald-600 transition-all duration-500 shadow-2xl shadow-green-900/40 w-full sm:w-auto"
                    >
                      <span className="absolute top-1 right-2 text-[8px] font-black text-green-300/70 uppercase tracking-widest animate-pulse">● LIVE</span>
                      <Tv2 className="w-5 h-5 sm:w-6 sm:h-6 group-hover:scale-110 transition-transform duration-500" />
                      Watch Football
                    </button>

                    <button
                      onClick={() => handleAction('custom')}
                      className="group relative bg-indigo-600 border border-indigo-500 text-white px-8 sm:px-10 py-4 sm:py-5 rounded-2xl font-black text-lg sm:text-xl flex items-center justify-center gap-3 hover:bg-indigo-500 transition-all duration-500 shadow-2xl shadow-indigo-500/20 w-full sm:w-auto"
                    >
                      <Users className="w-5 h-5 sm:w-6 sm:h-6 group-hover:scale-110 transition-transform duration-500" />
                      Custom Chat Room
                    </button>
                  </>
                )
              ) : (
                <button
                  onClick={handleLogin}
                  className="group bg-neutral-900 border border-neutral-800 text-white px-8 sm:px-10 py-4 sm:py-5 rounded-2xl font-black text-lg sm:text-xl flex items-center justify-center gap-4 hover:bg-neutral-800 transition-all duration-500 w-full sm:w-auto"
                >
                  <svg className="w-6 h-6 sm:w-8 sm:h-8 group-hover:scale-110 transition-transform" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
                    <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  {t.joinWithGoogle}
                </button>
              )}
            </div>

            {user && !userData?.isBlocked && (
              <div className="mt-6 flex flex-col items-center gap-3">
                {userData?.hasSavedName && (
                  <p className="text-neutral-500 text-[10px] font-bold uppercase tracking-widest">
                    Signed in as <span className="text-emerald-500">{userData.savedDisplayName}</span>
                  </p>
                )}
                <div className="flex items-center gap-2">
                  {/* Notification Bell */}
                  <button
                    onClick={() => { setShowAnnouncements(true); markAnnouncementsSeen(); }}
                    className="relative flex items-center justify-center w-9 h-9 bg-neutral-900 hover:bg-neutral-800 border border-white/5 rounded-xl text-neutral-400 hover:text-emerald-500 transition-all"
                  >
                    <Bell className="w-4 h-4" />
                    {unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center">
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </span>
                    )}
                  </button>
                  {/* Account Button */}
                  <button
                    onClick={() => setShowAccount(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-neutral-900 hover:bg-neutral-800 border border-white/5 rounded-xl text-neutral-400 hover:text-emerald-500 transition-all group"
                  >
                    <UserCheck className="w-3 h-3" />
                    <span className="text-[10px] font-black uppercase tracking-widest">Account</span>
                  </button>
                </div>
              </div>
            )}

            {/* Stats Bar */}
            <div className="mt-12 flex flex-wrap justify-center gap-3 w-full">
              <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-neutral-900/50 border border-white/5 backdrop-blur-sm">
                <Users className="w-3 h-3 text-emerald-500" />
                <span className="text-[9px] font-black uppercase tracking-widest text-neutral-500">Online:</span>
                <span className="text-xs font-black text-emerald-500 tabular-nums">{stats.onlineUsers}</span>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-neutral-900/50 border border-white/5 backdrop-blur-sm">
                <Video className="w-3 h-3 text-emerald-500" />
                <span className="text-[9px] font-black uppercase tracking-widest text-neutral-500">Video:</span>
                <span className="text-xs font-black text-emerald-500 tabular-nums">{stats.videoChatting}</span>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-neutral-900/50 border border-white/5 backdrop-blur-sm">
                <MessageCircle className="w-3 h-3 text-emerald-500" />
                <span className="text-[9px] font-black uppercase tracking-widest text-neutral-500">Text:</span>
                <span className="text-xs font-black text-emerald-500 tabular-nums">{stats.textChatting}</span>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-neutral-900/50 border border-white/5 backdrop-blur-sm">
                <Shield className="w-3 h-3 text-neutral-600" />
                <span className="text-[9px] font-black uppercase tracking-widest text-neutral-600">Total Video:</span>
                <span className="text-xs font-black text-neutral-400 tabular-nums">{stats.totalVideoChats.toLocaleString()}</span>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-neutral-900/50 border border-white/5 backdrop-blur-sm">
                <MessageSquare className="w-3 h-3 text-neutral-600" />
                <span className="text-[9px] font-black uppercase tracking-widest text-neutral-600">Total Text:</span>
                <span className="text-xs font-black text-neutral-400 tabular-nums">{stats.totalTextChats.toLocaleString()}</span>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-neutral-900/50 border border-white/5 backdrop-blur-sm">
                <UserCheck className="w-3 h-3 text-neutral-600" />
                <span className="text-[9px] font-black uppercase tracking-widest text-neutral-600">Accounts:</span>
                <span className="text-xs font-black text-neutral-400 tabular-nums">{stats.totalAccounts.toLocaleString()}</span>
              </div>
            </div>

          </motion.div>
        </div>
      </main>

      {/* Features Bento Grid */}
      <section className="relative z-10 border-t border-neutral-900 bg-neutral-950 py-32">
        <div className="max-w-7xl mx-auto px-6">
          <div className="mb-20">
            <h2 className="text-4xl font-black tracking-tighter uppercase mb-4">{t.protocol}</h2>
            <p className="text-neutral-500 font-medium">{t.protocolDesc}</p>
          </div>

          <div className="grid md:grid-cols-12 gap-6">
            <div className="md:col-span-8 p-12 rounded-[40px] bg-gradient-to-br from-neutral-900/50 to-neutral-900/20 border border-neutral-800 hover:border-emerald-500/30 transition-all duration-500 group">
              <Shield className="w-12 h-12 text-emerald-500 mb-8 group-hover:scale-110 transition-transform" />
              <h3 className="text-3xl font-black mb-4 uppercase tracking-tighter bg-gradient-to-r from-white to-neutral-400 bg-clip-text text-transparent">{t.activeModeration}</h3>
              <p className="text-neutral-400 text-lg leading-relaxed max-w-xl">{t.activeModerationDesc}</p>
            </div>

            <div className="md:col-span-4 p-12 rounded-[40px] bg-gradient-to-br from-emerald-500 to-emerald-600 text-black group overflow-hidden relative">
              <Zap className="w-12 h-12 mb-8 group-hover:scale-110 transition-transform" />
              <h3 className="text-3xl font-black mb-4 uppercase tracking-tighter">{t.instantMatch}</h3>
              <p className="text-black/70 text-lg leading-relaxed font-bold">{t.instantMatchDesc}</p>
              <div className="absolute -bottom-10 -right-10 opacity-10">
                <Zap className="w-40 h-40" />
              </div>
            </div>

            <div className="md:col-span-4 p-12 rounded-[40px] bg-gradient-to-br from-neutral-900/50 to-neutral-900/20 border border-neutral-800 hover:border-emerald-500/30 transition-all duration-500 group">
              <MessageSquare className="w-12 h-12 text-emerald-500 mb-8 group-hover:scale-110 transition-transform" />
              <h3 className="text-2xl font-black mb-4 uppercase tracking-tighter bg-gradient-to-r from-white to-neutral-400 bg-clip-text text-transparent">{t.zeroHistory}</h3>
              <p className="text-neutral-400 leading-relaxed">{t.zeroHistoryDesc}</p>
            </div>

            <div className="md:col-span-8 p-12 rounded-[40px] bg-gradient-to-br from-neutral-900/50 to-neutral-900/20 border border-neutral-800 hover:border-emerald-500/30 transition-all duration-500 group">
              <Ghost className="w-12 h-12 text-emerald-500 mb-8 group-hover:scale-110 transition-transform" />
              <h3 className="text-3xl font-black mb-4 uppercase tracking-tighter bg-gradient-to-r from-white to-neutral-400 bg-clip-text text-transparent">{t.visualVerification}</h3>
              <p className="text-neutral-400 text-lg leading-relaxed max-w-xl">{t.visualVerificationDesc}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 py-8 border-t border-neutral-900 bg-neutral-950">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center">
              <Ghost className="w-6 h-6 text-white" />
            </div>
            <span className="text-2xl font-black tracking-widest uppercase font-brand bg-gradient-to-r from-emerald-500 to-emerald-400 bg-clip-text text-transparent">{t.appName}</span>
          </div>
          <p className="text-neutral-600 text-xs font-bold uppercase tracking-[0.3em]">{t.copyright}</p>
          <div className="flex gap-8">
            <Link to="/terms" className="text-neutral-600 hover:text-white transition-colors text-xs font-bold uppercase tracking-widest">{t.terms}</Link>
            <Link to="/privacy" className="text-neutral-600 hover:text-white transition-colors text-xs font-bold uppercase tracking-widest">{t.privacy}</Link>
          </div>
        </div>
      </footer>

      {/* Admin Popup */}
      <AnimatePresence>
        {isAdminPopupOpen && (
          <AdminPopup isOpen={isAdminPopupOpen} onClose={() => setIsAdminPopupOpen(false)} />
        )}
        {showAccount && (
          <AccountSection onClose={() => setShowAccount(false)} />
        )}

        {/* Announcements Popup */}
        {showAnnouncements && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(6px)' }}
            onClick={() => setShowAnnouncements(false)}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl"
              style={{ background: '#0f0f0f', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <div className="px-6 pt-6 pb-4 flex items-center justify-between" style={{ background: 'linear-gradient(135deg,#052e16,#0f172a)' }}>
                <div className="flex items-center gap-3">
                  <Bell className="w-5 h-5 text-emerald-400" />
                  <h2 className="text-lg font-black text-white uppercase tracking-widest">Announcements</h2>
                </div>
                <button onClick={() => setShowAnnouncements(false)} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.08)' }}>
                  <X className="w-4 h-4 text-white" />
                </button>
              </div>
              <div className="max-h-[60vh] overflow-y-auto px-6 py-4 space-y-3">
                {announcements.length === 0 ? (
                  <div className="py-12 text-center">
                    <Bell className="w-10 h-10 text-neutral-700 mx-auto mb-3" />
                    <p className="text-neutral-500 text-sm font-bold uppercase tracking-widest">No announcements yet</p>
                  </div>
                ) : announcements.map((ann: any) => (
                  <div key={ann.id} className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <p className="text-white font-black text-sm mb-1">{ann.title}</p>
                    <p className="text-neutral-400 text-sm leading-relaxed whitespace-pre-wrap">{ann.body}</p>
                    <p className="text-neutral-600 text-[10px] font-mono mt-2">
                      {ann.createdAt?.toDate?.()?.toLocaleDateString() || ''}
                    </p>
                  </div>
                ))}

                {/* Referral / Invite Link */}
                {user && (
                  <div className="rounded-2xl p-4 mt-2" style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)' }}>
                    <div className="flex items-center gap-2 mb-2">
                      <Link className="w-4 h-4 text-emerald-400" />
                      <p className="text-emerald-400 font-black text-sm uppercase tracking-widest">Your Invite Link</p>
                    </div>
                    <p className="text-neutral-400 text-xs mb-3 leading-relaxed">
                      Share your invite link. When someone creates an account using your link, <span className="text-emerald-400 font-bold">both of you get 25 bonus tokens!</span>
                    </p>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-neutral-900 rounded-xl px-3 py-2 text-xs font-mono text-neutral-300 truncate border border-neutral-800">
                        {`${window.location.origin}?ref=${userData?.inviteCode || user.uid.slice(0,8).toUpperCase()}`}
                      </div>
                      <button
                        onClick={copyInviteLink}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all"
                        style={{ background: copiedInvite ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.07)', color: copiedInvite ? '#10b981' : '#9ca3af' }}
                      >
                        {copiedInvite ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        {copiedInvite ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
        {showNamePrompt && (
          <DisplayNamePrompt
            onConfirm={handleNameConfirm}
            onClose={() => {
              setShowNamePrompt(false);
              setPendingAction(null);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
};