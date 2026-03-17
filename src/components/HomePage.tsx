import React from 'react';
import { useFirebase } from '../FirebaseContext';
import { auth, googleProvider, signInWithPopup } from '../firebase';
import { Video, Shield, MessageSquare, Zap, ArrowRight, Globe, Lock, UserCheck } from 'lucide-react';
import { motion } from 'motion/react';

export const HomePage: React.FC<{ onStart: () => void }> = ({ onStart }) => {
  const { user, userData, loading } = useFirebase();

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
            
            <h1 className="text-7xl lg:text-[120px] font-black tracking-tighter leading-[0.85] mb-10 uppercase italic">
              Meet <br />
              <span className="text-emerald-500">Strangers</span> <br />
              <span className="relative">
                Securely.
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: '100%' }}
                  transition={{ delay: 1, duration: 1 }}
                  className="absolute -bottom-2 left-0 h-2 bg-emerald-500/20 rounded-full" 
                />
              </span>
            </h1>
            
            <p className="text-xl text-neutral-400 max-w-md mb-12 leading-relaxed font-medium">
              ADDAgle is a premium, moderated video environment built for meaningful random encounters. No bots. No spam. Just real people.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 sm:gap-6">
              {user ? (
                userData?.isBlocked ? (
                  <div className="bg-red-500/10 border border-red-500/20 text-red-500 p-6 rounded-3xl text-center font-bold w-full">
                    Access Revoked: Terms Violation
                  </div>
                ) : (
                  <button 
                    onClick={onStart}
                    className="group relative bg-white text-black px-8 sm:px-10 py-4 sm:py-5 rounded-2xl font-black text-lg sm:text-xl flex items-center justify-center gap-3 hover:bg-emerald-500 hover:text-white transition-all duration-500 shadow-2xl shadow-white/5 w-full sm:w-auto"
                  >
                    Start Encounter
                    <ArrowRight className="w-5 h-5 sm:w-6 sm:h-6 group-hover:translate-x-2 transition-transform duration-500" />
                  </button>
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
                  Join with Google
                </button>
              )}
            </div>

            <div className="mt-16 flex items-center gap-8 text-neutral-600">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4" />
                <span className="text-[10px] font-bold uppercase tracking-widest">Global Node</span>
              </div>
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4" />
                <span className="text-[10px] font-bold uppercase tracking-widest">End-to-End</span>
              </div>
              <div className="flex items-center gap-2">
                <UserCheck className="w-4 h-4" />
                <span className="text-[10px] font-bold uppercase tracking-widest">Verified Only</span>
              </div>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, scale: 0.8, rotate: -5 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
            className="relative lg:block hidden"
          >
            <div className="relative aspect-[4/5] rounded-[60px] overflow-hidden border border-neutral-800 bg-neutral-900/40 backdrop-blur-3xl p-12 shadow-[0_0_100px_rgba(16,185,129,0.05)] flex flex-col items-center justify-center text-center">
              <div className="w-24 h-24 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-8">
                <Video className="w-12 h-12 text-emerald-500" />
              </div>
              <h2 className="text-4xl font-black uppercase tracking-tighter italic mb-4">Protocol Ready</h2>
              <p className="text-neutral-500 font-medium max-w-xs">Secure end-to-end video handshake initialized and waiting for connection.</p>
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
            <h2 className="text-4xl font-black tracking-tighter uppercase italic mb-4">The Protocol</h2>
            <p className="text-neutral-500 font-medium">Engineered for safety, built for speed.</p>
          </div>
          
          <div className="grid md:grid-cols-12 gap-6">
            <div className="md:col-span-8 p-12 rounded-[40px] bg-neutral-900/30 border border-neutral-800 hover:border-emerald-500/30 transition-all duration-500 group">
              <Shield className="w-12 h-12 text-emerald-500 mb-8 group-hover:scale-110 transition-transform" />
              <h3 className="text-3xl font-black mb-4 uppercase tracking-tighter italic">Active Moderation</h3>
              <p className="text-neutral-400 text-lg leading-relaxed max-w-xl">
                Our proprietary moderation engine and human admin team work in tandem to ensure every encounter is safe. We enforce a strict zero-tolerance policy for inappropriate content.
              </p>
            </div>
            
            <div className="md:col-span-4 p-12 rounded-[40px] bg-emerald-500 text-black group overflow-hidden relative">
              <Zap className="w-12 h-12 mb-8 group-hover:scale-110 transition-transform" />
              <h3 className="text-3xl font-black mb-4 uppercase tracking-tighter italic">Instant Match</h3>
              <p className="text-black/70 text-lg leading-relaxed font-bold">
                Low-latency WebRTC protocol ensures you're connected to a new stranger in under 200ms.
              </p>
              <div className="absolute -bottom-10 -right-10 opacity-10">
                <Zap className="w-40 h-40" />
              </div>
            </div>

            <div className="md:col-span-4 p-12 rounded-[40px] bg-neutral-900/30 border border-neutral-800 hover:border-emerald-500/30 transition-all duration-500 group">
              <MessageSquare className="w-12 h-12 text-emerald-500 mb-8 group-hover:scale-110 transition-transform" />
              <h3 className="text-2xl font-black mb-4 uppercase tracking-tighter italic">Zero History</h3>
              <p className="text-neutral-400 leading-relaxed">
                All chats are ephemeral. Once the session ends, the data is purged from memory. We don't store your conversations.
              </p>
            </div>

            <div className="md:col-span-8 p-12 rounded-[40px] bg-neutral-900/30 border border-neutral-800 hover:border-emerald-500/30 transition-all duration-500 group">
              <Video className="w-12 h-12 text-emerald-500 mb-8 group-hover:scale-110 transition-transform" />
              <h3 className="text-3xl font-black mb-4 uppercase tracking-tighter italic">Visual Verification</h3>
              <p className="text-neutral-400 text-lg leading-relaxed max-w-xl">
                We require active camera feeds to prevent bots and ensure high-quality human interactions. If you turn off your camera, the protocol automatically terminates the session.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 py-20 border-t border-neutral-900 bg-neutral-950">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center">
              <Video className="w-6 h-6 text-white" />
            </div>
            <span className="text-2xl font-black tracking-tighter italic uppercase">ADDAgle</span>
          </div>
          <p className="text-neutral-600 text-xs font-bold uppercase tracking-[0.3em]">
            © 2026 ADDAgle Protocol. Secure Encounters.
          </p>
          <div className="flex gap-8">
            <a href="#" className="text-neutral-600 hover:text-white transition-colors text-xs font-bold uppercase tracking-widest">Terms</a>
            <a href="#" className="text-neutral-600 hover:text-white transition-colors text-xs font-bold uppercase tracking-widest">Privacy</a>
          </div>
        </div>
      </footer>
    </div>
  );
};
