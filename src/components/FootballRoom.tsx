import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { Send, ArrowLeft, Users, ExternalLink, Tv2, Maximize2, Minimize2 } from 'lucide-react';
import { motion } from 'motion/react';

import { getDistrict } from '../utils/location';
import { containsBanned } from '../constants';

const CHAT_LIMIT = 200;

interface Match {
  id: string;
  teamA: string;
  teamB: string;
  league: string;
  streamUrl: string;
  streamMode?: 'popup' | 'iframe';
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
  const [memberCount, setMemberCount] = useState(0);
  const [inputText,   setInputText]   = useState('');
  const [inputError,  setInputError]  = useState('');
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const streamAreaRef = useRef<HTMLDivElement>(null);
  const typingTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const scrollRef    = useRef<HTMLDivElement>(null);
  const inputRef     = useRef<HTMLInputElement>(null);
  const typingTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTypingFor = (name: string) => {
    if (typingTimers.current[name]) clearTimeout(typingTimers.current[name]);
    delete typingTimers.current[name];
    setTypingUsers(p => p.filter(n => n !== name));
  };

  const addEntry = (entry: ChatEntry) => setEntries(p => [...p, entry]);

  useEffect(() => {
    const sock = io({ forceNew: true });
    setSocket(sock);

    const onConnect = () => {
      sock.emit('football-join', { matchId: match.id, name: userName });
      getDistrict().then(district => sock.emit('set-district', { district })).catch(() => {});
    };

    if (sock.connected) onConnect();
    else sock.once('connect', onConnect);

    sock.on('football-chat', ({ name, text, ts }: { name: string; text: string; ts: number }) => {
      if (name === userName) return;
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

    sock.on('football-typing-stop', ({ name }: { name: string }) => clearTypingFor(name));

    sock.on('football-member-count', ({ count }: { count: number }) => setMemberCount(count));

    return () => { sock.disconnect(); };
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [entries, typingUsers]);

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);
    setInputError('');
    if (!socket) return;
    socket.emit('football-typing-start', { matchId: match.id });
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => socket?.emit('football-typing-stop', { matchId: match.id }), 2000);
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
    const el = streamAreaRef.current;
    if (!el) return;
    try {
      if (!document.fullscreenElement) {
        await el.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch {}
  };

  React.useEffect(() => {
    const onFSChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFSChange);
    return () => document.removeEventListener('fullscreenchange', onFSChange);
  }, []);

  const openStream = () => {
    window.open(match.streamUrl, '_blank', 'noopener,noreferrer');
  };

  const charsLeft = CHAT_LIMIT - inputText.length;

  return (
    <div className="flex flex-col h-[100dvh] w-full bg-[#0d0e11] text-white overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.07] shrink-0"
           style={{ background: '#13151a' }}>
        <div className="flex items-center gap-3">
          <button onClick={onLeave}
            className="w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center transition-colors cursor-pointer">
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
            <div className="flex items-center gap-1.5 mt-0.5">
              <Users className="w-2.5 h-2.5 text-emerald-500" />
              <span className="text-[10px] font-bold text-emerald-500">
                {memberCount} {memberCount === 1 ? 'member' : 'members'} present
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.05] border border-white/[0.07] hidden sm:flex">
          <Users className="w-3 h-3 text-neutral-500" />
          <span className="text-[10px] font-semibold text-neutral-400">{userName}</span>
        </div>
      </div>

      {/* Stream area */}
      {match.streamMode === 'iframe' ? (
        <div ref={streamAreaRef} className="shrink-0 w-full relative bg-black" style={{ height: '45vh' }}>
          <iframe
            ref={iframeRef}
            src={match.streamUrl}
            className="w-full h-full border-0"
            frameBorder="0"
            allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
            allowFullScreen
            {...{ webkitallowfullscreen: "true", mozallowfullscreen: "true", oallowfullscreen: "true", msallowfullscreen: "true", allowautoplay: "true", "allow-scripts": "" } as any}
            title="Match Stream"
          />
          {/* Fullscreen button overlay */}
          <button
            onClick={toggleFullscreen}
            className="absolute bottom-3 right-3 z-10 w-9 h-9 rounded-xl flex items-center justify-center transition-all"
            style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', border: '1px solid rgba(255,255,255,0.1)' }}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4 text-white" /> : <Maximize2 className="w-4 h-4 text-white" />}
          </button>
        </div>
      ) : (
        <div className="shrink-0 w-full flex flex-col items-center justify-center gap-5 py-10 px-6"
             style={{ background: 'linear-gradient(180deg,#13151a 0%,#0d0e11 100%)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/15 border border-red-500/25">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              <span className="text-[9px] font-black text-red-400 uppercase tracking-widest">Live · {match.league}</span>
            </div>
            <p className="text-2xl sm:text-3xl font-black text-white text-center">
              {match.teamA} <span className="text-neutral-600 font-normal mx-1">vs</span> {match.teamB}
            </p>
          </div>
          <motion.button
            onClick={openStream}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.97 }}
            className="flex items-center gap-3 px-8 py-4 rounded-2xl font-black text-base uppercase tracking-widest shadow-2xl transition-all"
            style={{ background: 'linear-gradient(135deg,#10b981,#059669)', color: '#000', boxShadow: '0 0 40px rgba(16,185,129,0.3)' }}
          >
            <Tv2 className="w-5 h-5" />
            Watch Stream
            <ExternalLink className="w-4 h-4 opacity-70" />
          </motion.button>
          <p className="text-[10px] text-neutral-600 font-bold uppercase tracking-widest">Opens in a new tab</p>
        </div>
      )}

      <div className="h-px bg-white/[0.07] shrink-0" />

      {/* Chat */}
      <div className="flex-1 flex flex-col overflow-hidden min-h-0 bg-[#111214]">
        <div ref={scrollRef}
             className="flex-1 overflow-y-auto px-3 py-3 space-y-1"
             style={{ WebkitOverflowScrolling: 'touch' }}>
          {entries.map(entry => (
            <motion.div
              key={entry.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.12 }}
              className={`flex flex-col ${entry.type === 'system' ? 'items-center my-2' : entry.name === userName ? 'items-end' : 'items-start'}`}
            >
              {entry.type === 'system' ? (
                <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest bg-white/[0.03] px-3 py-1 rounded-full">
                  {entry.text}
                </span>
              ) : (
                <div className={`max-w-[85%] flex flex-col ${entry.name === userName ? 'items-end' : 'items-start'}`}>
                  {entry.name !== userName && (
                    <span className="text-[10px] font-bold text-neutral-500 ml-1 mb-0.5">{entry.name}</span>
                  )}
                  <div className={`px-3.5 py-2 rounded-2xl text-[13.5px] leading-relaxed shadow-md ${
                    entry.name === userName
                      ? 'bg-[#2b5c3f] text-white rounded-tr-sm'
                      : 'bg-[#1e2026] text-[#e8eaf0] rounded-tl-sm border border-white/[0.06]'
                  }`} style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                    {entry.text}
                    <div className={`flex items-center gap-1 mt-1 ${entry.name === userName ? 'justify-end' : 'justify-start'}`}>
                      <span className="text-[9px] text-white/20">
                        {new Date(entry.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          ))}

          {typingUsers.length > 0 && (
            <div className="flex justify-start mt-2">
              <div className="px-3 py-2 rounded-2xl rounded-tl-sm bg-[#1e2026] border border-white/[0.06]">
                <div className="flex gap-1 items-end h-2">
                  {[0, 1, 2].map(i => (
                    <motion.span key={i}
                      animate={{ y: [0, -3, 0] }}
                      transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
                      className="block w-1 h-1 rounded-full bg-neutral-500"
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="shrink-0 px-3 pb-3 pt-2 border-t border-white/[0.06]" style={{ background: '#161719' }}>
          {inputError && (
            <p className="text-[10px] text-red-400 font-bold uppercase tracking-widest mb-2 ml-1">{inputError}</p>
          )}
          <div className="flex items-end gap-2">
            <div className="flex-1 flex items-end gap-2 px-3 py-2 rounded-[22px] bg-[#23262e] border border-white/[0.07]">
              <input
                ref={inputRef}
                type="text"
                value={inputText}
                onChange={handleInput}
                onKeyDown={e => { if (e.key === 'Enter') send(); }}
                maxLength={CHAT_LIMIT + 5}
                placeholder="Say something…"
                className="flex-1 bg-transparent text-[13.5px] text-white focus:outline-none placeholder:text-neutral-600"
              />
              {inputText.length > CHAT_LIMIT - 30 && (
                <span className={`text-[9px] font-mono self-end mb-0.5 shrink-0 ${charsLeft < 10 ? 'text-red-400' : 'text-yellow-500/60'}`}>
                  {charsLeft}
                </span>
              )}
            </div>
            <motion.button
              onMouseDown={e => e.preventDefault()}
              onClick={send}
              disabled={!inputText.trim()}
              whileTap={{ scale: 0.88 }}
              className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200 cursor-pointer ${
                inputText.trim()
                  ? 'bg-emerald-500 shadow-lg shadow-emerald-900/60 hover:bg-emerald-400'
                  : 'bg-[#23262e] border border-white/[0.08] opacity-40 cursor-not-allowed'
              }`}
            >
              <Send className="w-4 h-4 text-white" strokeWidth={2.5} />
            </motion.button>
          </div>
        </div>
      </div>
    </div>
  );
};
