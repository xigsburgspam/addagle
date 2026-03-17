import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useFirebase } from '../FirebaseContext';
import { useLanguage } from '../LanguageContext';
import { auth, googleProvider, signInWithPopup } from '../firebase';
import { Ghost, Shield, MessageSquare, Zap, ArrowRight, Globe, Lock, UserCheck, Languages, Info, Users, Video, MessageCircle } from 'lucide-react';
import { motion } from 'motion/react';
import { AdminPopup } from './AdminPopup';

export const HomePage: React.FC<{ onStart: (mode: 'video' | 'text') => void }> = ({ onStart }) => {
  const { user, userData, loading } = useFirebase();
  const { language, setLanguage, t } = useLanguage();
  const [isAdminPopupOpen, setIsAdminPopupOpen] = useState(false);
  const [stats, setStats] = useState({
    onlineUsers: 0,
    videoChatting: 0,
    textChatting: 0,
    totalVideoChats: 0,
    totalTextChats: 0
  });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/stats');
        if (res.ok) {
          const data = await res.json();
          setStats(data);
        }
      } catch (e) {
        console.error('Failed to fetch stats:', e);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      console.error('Login failed:', e);
    }
  };

  if (loading) return null;

  return (
    <div className="min-h-screen bg-neutral-950 text-white selection:bg-emerald-500/30 overflow-x-hidden">
      {/* Background Grid Pattern */}
      <div className="fixed inset-0 z-0 opacity-[0.03] pointer-events-none" 
           style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
      
      {/* Header with Language Switcher */}
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
            className="px-4 py-3 bg-neutral-900/50 backdrop-blur-xl border border-neutral-800 rounded-xl text-neutral-500 hover:text-emerald-500 hover:border-emerald-500/30 transition-all group flex items-center gap-2"
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
      <main className="relative z-10 max-w-7xl mx-auto px-6 pt-32 pb-40">
        <div className="grid lg:grid-cols-2 gap-20 items-center">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase tracking-[0.2em] mb-10">
              <Zap className="w-3 h-3" />
              Next-Gen Video Protocol
            </div>
            
            <h1 className="text-7xl lg:text-[120px] font-black tracking-tighter leading-[0.85] mb-10 uppercase italic bg-gradient-to-br from-white via-white to-neutral-600 bg-clip-text text-transparent">
              {t.tagline.split(' ').map((word, i) => (
                <React.Fragment key={i}>
                  {word === 'Strangers' || word === 'অপরিচিতদের' ? <span className="text-emerald-500 bg-gradient-to-r from-emerald-400 to-emerald-600 bg-clip-text text-transparent">{word}</span> : word}
                  {i === 1 && <br />}
                  {' '}
                </React.Fragment>
              ))}
            </h1>
            
            <p className="text-xl text-neutral-400 max-w-md mb-12 leading-relaxed font-medium">
              {t.description}
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 sm:gap-6">
              {user ? (
                userData?.isBlocked ? (
                  <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-6 rounded-3xl text-center font-bold w-full">
                    {t.accessRevoked}
                  </div>
                ) : (
                  <>
                    <button 
                      onClick={() => onStart('video')}
                      className="group relative bg-gradient-to-r from-emerald-500 to-emerald-600 text-black px-8 sm:px-10 py-4 sm:py-5 rounded-2xl font-black text-lg sm:text-xl flex items-center justify-center gap-3 hover:from-emerald-400 hover:to-emerald-500 transition-all duration-500 shadow-2xl shadow-emerald-500/20 w-full sm:w-auto"
                    >
                      {t.startEncounter}
                      <ArrowRight className="w-5 h-5 sm:w-6 sm:h-6 group-hover:translate-x-2 transition-transform duration-500" />
                    </button>
                    <button 
                      onClick={() => onStart('text')}
                      className="group relative bg-neutral-900 border border-neutral-800 text-white px-8 sm:px-10 py-4 sm:py-5 rounded-2xl font-black text-lg sm:text-xl flex items-center justify-center gap-3 hover:border-emerald-500/50 hover:bg-gradient-to-r hover:from-neutral-900 hover:to-neutral-800 transition-all duration-500 w-full sm:w-auto"
                    >
                      {t.startTextChat}
                      <MessageSquare className="w-5 h-5 sm:w-6 sm:h-6 group-hover:scale-110 transition-transform duration-500" />
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

            <div className="mt-16 grid grid-cols-2 md:grid-cols-5 gap-4 md:gap-8">
              <div className="flex flex-col gap-1 p-4 rounded-2xl bg-neutral-900/50 border border-neutral-800 hover:border-emerald-500/30 transition-all">
                <div className="flex items-center gap-2 text-emerald-500">
                  <Users className="w-4 h-4" />
                  <span className="text-[10px] font-black uppercase tracking-widest">{t.onlineUsers}</span>
                </div>
                <span className="text-2xl font-black tabular-nums bg-gradient-to-r from-emerald-400 to-emerald-600 bg-clip-text text-transparent">{stats.onlineUsers}</span>
              </div>
              <div className="flex flex-col gap-1 p-4 rounded-2xl bg-neutral-900/50 border border-neutral-800 hover:border-emerald-500/30 transition-all">
                <div className="flex items-center gap-2 text-emerald-500">
                  <Video className="w-4 h-4" />
                  <span className="text-[10px] font-black uppercase tracking-widest">{t.videoChatting}</span>
                </div>
                <span className="text-2xl font-black tabular-nums bg-gradient-to-r from-emerald-400 to-emerald-600 bg-clip-text text-transparent">{stats.videoChatting}</span>
              </div>
              <div className="flex flex-col gap-1 p-4 rounded-2xl bg-neutral-900/50 border border-neutral-800 hover:border-emerald-500/30 transition-all">
                <div className="flex items-center gap-2 text-emerald-500">
                  <MessageCircle className="w-4 h-4" />
                  <span className="text-[10px] font-black uppercase tracking-widest">{t.textChatting}</span>
                </div>
                <span className="text-2xl font-black tabular-nums bg-gradient-to-r from-emerald-400 to-emerald-600 bg-clip-text text-transparent">{stats.textChatting}</span>
              </div>
              <div className="flex flex-col gap-1 p-4 rounded-2xl bg-neutral-900/50 border border-neutral-800 hover:border-neutral-700 transition-all">
                <div className="flex items-center gap-2 text-neutral-600">
                  <Zap className="w-4 h-4" />
                  <span className="text-[10px] font-black uppercase tracking-widest">{t.totalVideoChats}</span>
                </div>
                <span className="text-2xl font-black tabular-nums text-neutral-600">{stats.totalVideoChats}</span>
              </div>
              <div className="flex flex-col gap-1 p-4 rounded-2xl bg-neutral-900/50 border border-neutral-800 hover:border-neutral-700 transition-all">
                <div className="flex items-center gap-2 text-neutral-600">
                  <MessageSquare className="w-4 h-4" />
                  <span className="text-[10px] font-black uppercase tracking-widest">{t.totalChats}</span>
                </div>
                <span className="text-2xl font-black tabular-nums text-neutral-600">{stats.totalTextChats}</span>
              </div>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, scale: 0.8, rotate: -5 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
            className="relative lg:block hidden"
          >
            <div className="relative aspect-[4/5] flex flex-col items-center justify-center text-center">
              <div className="relative">
                <motion.div 
                  animate={{ rotate: 360 }}
                  transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                  className="w-64 h-64 rounded-full border border-emerald-500/10 border-dashed"
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-32 h-32 rounded-full bg-emerald-500/5 flex items-center justify-center backdrop-blur-3xl border border-emerald-500/10">
                    <Ghost className="w-12 h-12 text-emerald-500 animate-pulse" />
                  </div>
                </div>
              </div>
            </div>
            
            {/* Floating Elements */}
            <motion.div 
              animate={{ y: [0, -20, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              className="absolute -top-10 -right-10 p-6 bg-neutral-900 border border-neutral-800 rounded-3xl shadow-2xl backdrop-blur-xl"
            >
              <Shield className="w-8 h-8 text-emerald-500" />
            </motion.div>
            
            <motion.div 
              animate={{ y: [0, 20, 0] }}
              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
              className="absolute -bottom-10 -left-10 p-6 bg-neutral-900 border border-neutral-800 rounded-3xl shadow-2xl backdrop-blur-xl"
            >
              <MessageSquare className="w-8 h-8 text-emerald-500" />
            </motion.div>
          </motion.div>
        </div>
      </main>

      {/* Features Bento Grid */}
      <section className="relative z-10 border-t border-neutral-900 bg-neutral-950 py-32">
        <div className="max-w-7xl mx-auto px-6">
          <div className="mb-20">
            <h2 className="text-4xl font-black tracking-tighter uppercase italic mb-4">{t.protocol}</h2>
            <p className="text-neutral-500 font-medium">{t.protocolDesc}</p>
          </div>
          
          <div className="grid md:grid-cols-12 gap-6">
            <div className="md:col-span-8 p-12 rounded-[40px] bg-gradient-to-br from-neutral-900/50 to-neutral-900/20 border border-neutral-800 hover:border-emerald-500/30 transition-all duration-500 group">
              <Shield className="w-12 h-12 text-emerald-500 mb-8 group-hover:scale-110 transition-transform" />
              <h3 className="text-3xl font-black mb-4 uppercase tracking-tighter italic bg-gradient-to-r from-white to-neutral-400 bg-clip-text text-transparent">{t.activeModeration}</h3>
              <p className="text-neutral-400 text-lg leading-relaxed max-w-xl">
                {t.activeModerationDesc}
              </p>
            </div>
            
            <div className="md:col-span-4 p-12 rounded-[40px] bg-gradient-to-br from-emerald-500 to-emerald-600 text-black group overflow-hidden relative">
              <Zap className="w-12 h-12 mb-8 group-hover:scale-110 transition-transform" />
              <h3 className="text-3xl font-black mb-4 uppercase tracking-tighter italic">{t.instantMatch}</h3>
              <p className="text-black/70 text-lg leading-relaxed font-bold">
                {t.instantMatchDesc}
              </p>
              <div className="absolute -bottom-10 -right-10 opacity-10">
                <Zap className="w-40 h-40" />
              </div>
            </div>

            <div className="md:col-span-4 p-12 rounded-[40px] bg-gradient-to-br from-neutral-900/50 to-neutral-900/20 border border-neutral-800 hover:border-emerald-500/30 transition-all duration-500 group">
              <MessageSquare className="w-12 h-12 text-emerald-500 mb-8 group-hover:scale-110 transition-transform" />
              <h3 className="text-2xl font-black mb-4 uppercase tracking-tighter italic bg-gradient-to-r from-white to-neutral-400 bg-clip-text text-transparent">{t.zeroHistory}</h3>
              <p className="text-neutral-400 leading-relaxed">
                {t.zeroHistoryDesc}
              </p>
            </div>

            <div className="md:col-span-8 p-12 rounded-[40px] bg-gradient-to-br from-neutral-900/50 to-neutral-900/20 border border-neutral-800 hover:border-emerald-500/30 transition-all duration-500 group">
              <Ghost className="w-12 h-12 text-emerald-500 mb-8 group-hover:scale-110 transition-transform" />
              <h3 className="text-3xl font-black mb-4 uppercase tracking-tighter italic bg-gradient-to-r from-white to-neutral-400 bg-clip-text text-transparent">{t.visualVerification}</h3>
              <p className="text-neutral-400 text-lg leading-relaxed max-w-xl">
                {t.visualVerificationDesc}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 py-20 border-t border-neutral-900 bg-neutral-950">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center">
              <Ghost className="w-6 h-6 text-white" />
            </div>
            <span className="text-2xl font-black tracking-widest uppercase font-brand bg-gradient-to-r from-emerald-500 to-emerald-400 bg-clip-text text-transparent">{t.appName}</span>
          </div>
          <p className="text-neutral-600 text-xs font-bold uppercase tracking-[0.3em]">
            {t.copyright}
          </p>
          <div className="flex gap-8">
            <Link to="/terms" className="text-neutral-600 hover:text-white transition-colors text-xs font-bold uppercase tracking-widest">{t.terms}</Link>
            <Link to="/privacy" className="text-neutral-600 hover:text-white transition-colors text-xs font-bold uppercase tracking-widest">{t.privacy}</Link>
          </div>
        </div>
      </footer>

      <AdminPopup isOpen={isAdminPopupOpen} onClose={() => setIsAdminPopupOpen(false)} />
    </div>
  );
};

