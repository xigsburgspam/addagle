import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { Send, Maximize2, Minimize2, ArrowLeft, Users } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const BANNED_WORDS = [
  'sex','fuck','suck','kiss','bongo','boltu','hasina','chudina','chudi',
  'xudi','xudina','chodna','xodna','modi','bongoboltu'
];

function containsBanned(t: string) {
  const l = t.toLowerCase();
  return BANNED_WORDS.some(w => l.includes(w));
}

const CHAT_LIMIT = 200;

interface Match {
  id: string;
  teamA: string;
  teamB: string;
  league: string;
  streamUrl: string;
}

interface ChatEntry {
  id: string;
  type: 'msg' | 'system';
  name?: string;
  text: string;
  ts: number;
}

interface Props {
  match: Match;
  userName: string;
  onLeave: () => void;
}

export const FootballRoom: React.FC<Props> = ({ match, userName, onLeave }) => {
  const [socket,      setSocket]      = useState<Socket | null>(null);
  const [entries,     setEntries]     = useState<ChatEntry[]>([]);
  const [inputText,   setInputText]   = useState('');
  const [inputError,  setInputError]  = useState('');
  const [fullscreen,  setFullscreen]  = useState(false);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const typingTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const scrollRef    = useRef<HTMLDivElement>(null);
  const inputRef     = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef    = useRef<HTMLIFrameElement>(null);
  const typingTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTypingFor = (name: string) => {
    if (typingTimers.current[name]) clearTimeout(typingTimers.current[name]);
    delete typingTimers.current[name];
    setTypingUsers(p => p.filter(n => n !== name));
  };

  const addEntry = (entry: ChatEntry) => {
    setEntries(p => [...p, entry]);
  };

  useEffect(() => {
    const sock = io();
    setSocket(sock);

    sock.once('connect', () => {
      sock.emit('football-join', { matchId: match.id, name: userName });
    });

    sock.on('football-chat', ({ name, text, ts }: { name: string; text: string; ts: number }) => {
      addEntry({ id: Math.random().toString(36).slice(2), type: 'msg', name, text, ts });
      clearTypingFor(name);
    });

    sock.on('football-system', ({ text }: { text: string }) => {
      addEntry({ id: Math.random().toString(36).slice(2), type: 'system', text, ts: Date.now() });
    });

    sock.on('football-typing-start', ({ name }: { name: string }) => {
      if (name === userName) return;
      clearTypingFor(name);
      setTypingUsers(p => p.includes(name) ? p : [...p, name]);
      typingTimers.current[name] = setTimeout(() => clearTypingFor(name), 3000);
    });

    sock.on('football-typing-stop', ({ name }: { name: string }) => {
      clearTypingFor(name);
    });

    return () => { sock.disconnect(); };
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries, typingUsers]);

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);
    setInputError('');
    if (!socket) return;
    socket.emit('football-typing-start', { matchId: match.id });
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      socket?.emit('football-typing-stop', { matchId: match.id });
    }, 2000);
  };

  const send = useCallback(() => {
    const trimmed = inputText.trim();
    if (!trimmed || !socket) return;
    if (trimmed.length > CHAT_LIMIT) { setInputError(`Max ${CHAT_LIMIT} characters.`); return; }
    if (containsBanned(trimmed)) { setInputError('Message contains prohibited words.'); return; }

    socket.emit('football-message', { matchId: match.id, text: trimmed });
    addEntry({ id: Math.random().toString(36).slice(2), type: 'msg', name: userName, text: trimmed, ts: Date.now() });
    setInputText('');
    if (typingTimer.current) clearTimeout(typingTimer.current);
    socket.emit('football-typing-stop', { matchId: match.id });
  }, [inputText, socket, match.id, userName]);

  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) {
      try {
        await containerRef.current?.requestFullscreen();
        setFullscreen(true);
        try { await (screen.orientation as any).lock('landscape'); } catch {}
      } catch {}
    } else {
      await document.exitFullscreen();
      setFullscreen(false);
      try { (screen.orientation as any).unlock(); } catch {}
    }
  };

  useEffect(() => {
    const onFSChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFSChange);
    return () => document.removeEventListener('fullscreenchange', onFSChange);
  }, []);

  const charsLeft = CHAT_LIMIT - inputText.length;

  return (
    <div ref={containerRef} className="flex flex-col h-[100dvh] w-full bg-[#0d0e11] text-white overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.07] shrink-0"
           style={{ background: '#13151a' }}>
        <div className="flex items-center gap-3">
          <button onClick={onLeave}
            className="w-8 h-8 rounded-full bg-white/6 hover:bg-white/12 flex items-center justify-center transition-colors cursor-pointer">
            <ArrowLeft className="w-4 h-4 text-neutral-400" />
          </button>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              <span className="text-[9px] font-bold text-red-400 uppercase tracking-widest">LIVE</span>
              <span className="text-[9px] text-neutral-600 mx-1">·</span>
              <span className="text-[9px] text-neutral-500 uppercase tracking-widest">{match.league}</span>
            </div>
            <p className="text-sm font-black text-white">
              {match.teamA} <span className="text-neutral-500">vs</span> {match.teamB}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.05] border border-white/[0.07]">
            <Users className="w-3 h-3 text-neutral-500" />
            <span className="text-[10px] font-semibold text-neutral-400">{userName}</span>
          </div>
          <button onClick={toggleFullscreen}
            className="w-8 h-8 rounded-full bg-white/6 hover:bg-white/12 flex items-center justify-center transition-colors cursor-pointer">
            {fullscreen ? <Minimize2 className="w-4 h-4 text-neutral-400" /> : <Maximize2 className="w-4 h-4 text-neutral-400" />}
          </button>
        </div>
      </div>

      {/* Stream — top 45% */}
      <div className="shrink-0 w-full bg-black" style={{ height: '45%' }}>
        <iframe
          ref={iframeRef}
          src={match.streamUrl}
          className="w-full h-full border-0"
          allowFullScreen
          allow="autoplay; fullscreen; encrypted-media"
          title="Match Stream"
        />
      </div>

      <div className="h-px bg-white/[0.07] shrink-0" />

      {/* Chat — bottom */}
      <div className="flex-1 flex flex-col overflow-hidden min-h-0">

        <div ref={scrollRef}
             className="flex-1 overflow-y-auto px-3 py-3 space-y-1"
             style={{ WebkitOverflowScrolling: 'touch' }}>
          {entries.map(entry => (
            <motion.div
              key={entry.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.12 }}
            >
              {entry.type === 'system' ? (
                <p className="text-center text-[10px] text-neutral-600 py-0.5">{entry.text}</p>
              ) : (
                <div className="flex items-baseline gap-2">
                  <span className={`text-[11px] font-bold shrink-0 ${entry.name === userName ? 'text-emerald-400' : 'text-sky-400'}`}>
                    {entry.name}
                  </span>
                  <span className="text-[13px] text-neutral-200 leading-snug break-words min-w-0">
                    {entry.text}
                  </span>
                  <span className="text-[9px] text-neutral-700 shrink-0 ml-auto">
                    {new Date(entry.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              )}
            </motion.div>
          ))}
          {typingUsers.length > 0 && (
            <p className="text-[10px] text-neutral-600 italic">
              {typingUsers.join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing…
            </p>
          )}
        </div>

        {/* Input */}
        <div className="shrink-0 px-3 pb-3 pt-2 border-t border-white/[0.06]"
             style={{ background: '#13151a' }}>
          {inputError && <p className="text-[10px] text-red-400 mb-1.5">{inputError}</p>}
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-[18px]"
                 style={{ background: '#23262e', border: '1px solid rgba(255,255,255,0.07)' }}>
              <input
                ref={inputRef}
                type="text"
                value={inputText}
                onChange={handleInput}
                onKeyDown={e => { if (e.key === 'Enter') send(); }}
                maxLength={CHAT_LIMIT + 5}
                placeholder="Say something…"
                className="flex-1 bg-transparent text-[13px] text-white focus:outline-none placeholder:text-neutral-600"
              />
              {inputText.length > CHAT_LIMIT - 30 && (
                <span className={`text-[9px] font-mono shrink-0 ${charsLeft < 10 ? 'text-red-400' : 'text-yellow-500/60'}`}>
                  {charsLeft}
                </span>
              )}
            </div>
            <motion.button
              onMouseDown={e => e.preventDefault()}
              onClick={send}
              disabled={!inputText.trim()}
              whileTap={{ scale: 0.88 }}
              className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-all cursor-pointer
                ${inputText.trim()
                  ? 'bg-emerald-500 hover:bg-emerald-400 shadow-lg shadow-emerald-900/50'
                  : 'bg-white/[0.06] border border-white/[0.08] opacity-40 cursor-not-allowed'}`}
            >
              <Send className="w-4 h-4 text-white" strokeWidth={2.5} />
            </motion.button>
          </div>
        </div>
      </div>
    </div>
  );
};