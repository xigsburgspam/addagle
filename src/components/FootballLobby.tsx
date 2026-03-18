import React, { useState, useEffect } from 'react';
import { X, Tv2, Trophy, Loader2, ArrowRight, User, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { io } from 'socket.io-client';
import { collection, query, where, onSnapshot, db } from '../firebase';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';

const BANNED_WORDS = [
  'sex','fuck','suck','kiss','bongo','boltu','hasina','chudina','chudi',
  'xudi','xudina','chodna','xodna','modi','bongoboltu'
];

function containsBanned(text: string) {
  const lower = text.toLowerCase();
  return BANNED_WORDS.some(w => lower.includes(w));
}

interface Match {
  id: string;
  teamA: string;
  teamB: string;
  league: string;
  streamUrl: string;
  live: boolean;
  createdAt?: string;
}

interface Props {
  onClose: () => void;
  onEnter: (match: Match, name: string) => void;
}

export const FootballLobby: React.FC<Props> = ({ onClose, onEnter }) => {
  const [matches,   setMatches]   = useState<Match[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [selected,  setSelected]  = useState<Match | null>(null);
  const [name,      setName]      = useState('');
  const [checking,  setChecking]  = useState(false);
  const [nameError, setNameError] = useState('');
  const [step,      setStep]      = useState<'list' | 'name'>('list');

  useEffect(() => {
    const qMatches = query(collection(db, 'football_matches'), where('live', '==', true));
    const unsubscribe = onSnapshot(qMatches, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Match));
      data.sort((a, b) => (b.createdAt?.localeCompare(a.createdAt || '') || 0));
      setMatches(data);
      setLoading(false);
    }, (error) => {
      setLoading(false);
      handleFirestoreError(error, OperationType.LIST, 'football_matches');
    });

    return () => unsubscribe();
  }, []);

  const handleEnter = (match: Match) => {
    setSelected(match);
    setStep('name');
    setName('');
    setNameError('');
  };

  const handleNameSubmit = async () => {
    const trimmed = name.trim();
    if (!trimmed) { setNameError('Please enter a name.'); return; }
    if (trimmed.length < 2)  { setNameError('Name must be at least 2 characters.'); return; }
    if (trimmed.length > 20) { setNameError('Name must be 20 characters or less.'); return; }
    if (!/^[a-zA-Z0-9_\u0980-\u09FF ]+$/.test(trimmed)) {
      setNameError('Only letters, numbers, spaces and underscores allowed.'); return;
    }
    if (containsBanned(trimmed)) { setNameError('That name contains prohibited words.'); return; }

    setChecking(true);
    setNameError('');

    const sock = io();
    sock.once('connect', () => {
      sock.emit('football-check-name', { matchId: selected!.id, name: trimmed });
    });
    sock.once('football-name-result', ({ available }: { available: boolean }) => {
      sock.disconnect();
      setChecking(false);
      if (!available) {
        setNameError('That name is already taken in this room. Choose another.');
      } else {
        onEnter(selected!, trimmed);
      }
    });
    setTimeout(() => {
      sock.disconnect();
      setChecking(false);
      setNameError('Connection timeout, try again.');
    }, 5000);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.92, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.92, y: 20 }}
        className="w-full max-w-lg bg-[#13151a] border border-white/[0.08] rounded-3xl overflow-hidden shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/[0.07]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
              <Tv2 className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-base font-black text-white uppercase tracking-wider">
                {step === 'list' ? 'Live Matches' : 'Choose Your Name'}
              </h2>
              <p className="text-[10px] text-neutral-500 uppercase tracking-widest">
                {step === 'list' ? 'Watch & Chat Live' : selected?.teamA + ' vs ' + selected?.teamB}
              </p>
            </div>
          </div>
          <button
            onClick={step === 'name' ? () => setStep('list') : onClose}
            className="w-8 h-8 rounded-full bg-white/6 hover:bg-white/12 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4 text-neutral-400" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 max-h-[70vh] overflow-y-auto">
          <AnimatePresence mode="wait">
            {step === 'list' ? (
              <motion.div key="list" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }}>
                {loading ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3">
                    <Loader2 className="w-7 h-7 text-emerald-500 animate-spin" />
                    <p className="text-[11px] text-neutral-500 uppercase tracking-widest">Loading matches…</p>
                  </div>
                ) : matches.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3 opacity-40">
                    <Trophy className="w-10 h-10 text-neutral-600" />
                    <p className="text-[11px] text-neutral-500 uppercase tracking-widest">No live matches right now</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {matches.map(match => (
                      <div key={match.id}
                        className="flex items-center justify-between p-4 rounded-2xl
                                   bg-white/[0.04] border border-white/[0.07]
                                   hover:border-emerald-500/30 hover:bg-white/[0.07]
                                   transition-all">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shrink-0" />
                            <span className="text-[9px] font-bold text-red-400 uppercase tracking-widest">LIVE</span>
                            <span className="text-[9px] text-neutral-600 uppercase tracking-widest">· {match.league}</span>
                          </div>
                          <p className="text-sm font-black text-white truncate">
                            {match.teamA} <span className="text-neutral-500">vs</span> {match.teamB}
                          </p>
                        </div>
                        <button
                          onClick={() => handleEnter(match)}
                          className="ml-4 flex items-center gap-2 px-4 py-2 rounded-xl
                                     bg-emerald-500 hover:bg-emerald-400 text-black
                                     font-black text-xs uppercase tracking-wider
                                     transition-all active:scale-95 cursor-pointer shrink-0"
                        >
                          Enter
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div key="name" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }}>
                <div className="flex flex-col gap-4 py-2">
                  <p className="text-[12px] text-neutral-400 leading-relaxed">
                    Pick a display name for this match room. It must be unique — no one else can use the same name at the same time.
                  </p>
                  <div className="relative">
                    <div className="absolute left-3.5 top-1/2 -translate-y-1/2">
                      <User className="w-4 h-4 text-neutral-500" />
                    </div>
                    <input
                      type="text"
                      value={name}
                      onChange={e => { setName(e.target.value); setNameError(''); }}
                      onKeyDown={e => { if (e.key === 'Enter') handleNameSubmit(); }}
                      maxLength={20}
                      placeholder="Your display name…"
                      className="w-full pl-10 pr-4 py-3 rounded-xl text-sm text-white
                                 bg-white/[0.06] border border-white/[0.09]
                                 focus:border-emerald-500/50 focus:outline-none
                                 placeholder:text-neutral-600 transition-colors"
                      autoFocus
                    />
                  </div>
                  {nameError && (
                    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                      className="flex items-center gap-2 text-red-400 text-[11px]">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      {nameError}
                    </motion.div>
                  )}
                  <p className="text-[10px] text-neutral-600">
                    Prohibited: offensive, political, or explicit words are not allowed.
                  </p>
                  <button
                    onClick={handleNameSubmit}
                    disabled={checking || !name.trim()}
                    className="w-full py-3.5 rounded-xl font-black text-sm uppercase tracking-wider
                               bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40
                               text-black transition-all active:scale-[0.98] cursor-pointer
                               flex items-center justify-center gap-2"
                  >
                    {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    {checking ? 'Checking…' : 'Enter Room'}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
};