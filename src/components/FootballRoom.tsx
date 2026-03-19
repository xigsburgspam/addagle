import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { Send, Maximize2, Minimize2, ArrowLeft, Users } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Hls from 'hls.js';

import { getDistrict } from '../utils/location';

import { BANNED_WORDS, containsBanned } from '../constants';

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
  const [memberCount, setMemberCount] = useState(0);
  const [inputText,   setInputText]   = useState('');
  const [inputError,  setInputError]  = useState('');
  const [fullscreen,  setFullscreen]  = useState(false);
  const [streamInPopup, setStreamInPopup] = useState(false);
  const [useProxy, setUseProxy] = useState(false);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const typingTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const scrollRef    = useRef<HTMLDivElement>(null);
  const inputRef     = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef    = useRef<HTMLIFrameElement>(null);
  const videoRef     = useRef<HTMLVideoElement>(null);
  const typingTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isM3u8 = match.streamUrl.toLowerCase().includes('.m3u8');
  const isYouTube = match.streamUrl.includes('youtube.com') || match.streamUrl.includes('youtu.be');

  const getYouTubeId = (url: string) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  const youtubeId = isYouTube ? getYouTubeId(match.streamUrl) : null;

  useEffect(() => {
    if (!isM3u8 || streamInPopup || !videoRef.current) return;

    let hls: Hls | null = null;
    const video = videoRef.current;

    if (Hls.isSupported()) {
      hls = new Hls({
        maxBufferLength: 30,
        maxMaxBufferLength: 600,
      });
      hls.loadSource(match.streamUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(e => console.log('Auto-play prevented', e));
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Native Safari support
      video.src = match.streamUrl;
      video.addEventListener('loadedmetadata', () => {
        video.play().catch(e => console.log('Auto-play prevented', e));
      });
    }

    return () => {
      if (hls) {
        hls.destroy();
      }
    };
  }, [match.streamUrl, isM3u8, streamInPopup]);

  const clearTypingFor = (name: string) => {
    if (typingTimers.current[name]) clearTimeout(typingTimers.current[name]);
    delete typingTimers.current[name];
    setTypingUsers(p => p.filter(n => n !== name));
  };

  const addEntry = (entry: ChatEntry) => {
    setEntries(p => [...p, entry]);
  };

  useEffect(() => {
    const sock = io({ forceNew: true });
    setSocket(sock);

    const onConnect = () => {
      sock.emit('football-join', { matchId: match.id, name: userName });
      getDistrict().then(district => {
        sock.emit('set-district', { district });
      }).catch(() => {});
    };

    if (sock.connected) {
      onConnect();
    } else {
      sock.once('connect', onConnect);
    }

    sock.on('football-chat', ({ name, text, ts }: { name: string; text: string; ts: number }) => {
      if (name === userName) return; // Don't add own message twice
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

    sock.on('football-member-count', ({ count }: { count: number }) => {
      setMemberCount(count);
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
            <div className="flex items-center gap-1.5 mt-0.5">
              <Users className="w-2.5 h-2.5 text-emerald-500" />
              <span className="text-[10px] font-bold text-emerald-500">{memberCount} {memberCount === 1 ? 'member' : 'members'} present</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.05] border border-white/[0.07] hidden sm:flex">
            <Users className="w-3 h-3 text-neutral-500" />
            <span className="text-[10px] font-semibold text-neutral-400">{userName}</span>
          </div>
          <button
            onClick={() => {
              window.open(match.streamUrl, 'FootballStream', 'width=800,height=600,menubar=no,toolbar=no,location=no,status=no');
              setStreamInPopup(true);
            }}
            className="px-3 py-1.5 rounded-full bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold uppercase tracking-widest transition-colors"
          >
            Pop Out
          </button>
          <button onClick={toggleFullscreen}
            className="w-8 h-8 rounded-full bg-white/6 hover:bg-white/12 flex items-center justify-center transition-colors cursor-pointer">
            {fullscreen ? <Minimize2 className="w-4 h-4 text-neutral-400" /> : <Maximize2 className="w-4 h-4 text-neutral-400" />}
          </button>
        </div>
      </div>

      {/* Stream — top 45% */}
      {!streamInPopup ? (
        <div className="shrink-0 w-full bg-black relative group" style={{ height: '45%' }}>
          {isM3u8 ? (
            <video
              ref={videoRef}
              className="w-full h-full object-contain bg-black"
              controls
              playsInline
              autoPlay
            />
          ) : isYouTube && youtubeId ? (
            <iframe
              src={`https://www.youtube.com/embed/${youtubeId}?autoplay=1&controls=0&modestbranding=1&rel=0&showinfo=0`}
              className="w-full h-full border-0"
              allowFullScreen
              allow="autoplay; fullscreen; encrypted-media"
              title="Match Stream"
            />
          ) : (
            <iframe
              ref={iframeRef}
              src={useProxy ? `/api/proxy-stream?url=${encodeURIComponent(match.streamUrl)}` : match.streamUrl}
              className="w-full h-full border-0"
              allowFullScreen
              allow="autoplay; fullscreen; encrypted-media"
              title="Match Stream"
            />
          )}
          
          {/* Overlay for anti-iframe fallback */}
          {!isM3u8 && !isYouTube && (
            <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              <div className="bg-neutral-900/90 backdrop-blur-md p-4 rounded-2xl border border-white/10 text-center max-w-xs pointer-events-auto shadow-2xl">
                <p className="text-xs text-neutral-300 mb-3 leading-relaxed">
                  If the video is blank or refusing to connect (anti-iframe protection), you can try the proxy player or open it in a separate popup window.
                </p>
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => setUseProxy(!useProxy)}
                    className="w-full py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-[11px] font-black uppercase tracking-widest transition-colors"
                  >
                    {useProxy ? 'Use Standard Player' : 'Try Proxy Player (Bypass)'}
                  </button>
                  <button
                    onClick={() => {
                      window.open(match.streamUrl, 'FootballStream', 'width=800,height=600,menubar=no,toolbar=no,location=no,status=no');
                      setStreamInPopup(true);
                    }}
                    className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-[11px] font-black uppercase tracking-widest transition-colors"
                  >
                    Open Stream in Popup
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="shrink-0 w-full bg-neutral-900 flex flex-col items-center justify-center p-4 border-b border-white/[0.07]">
          <p className="text-xs text-neutral-400 mb-3">Stream is playing in a popup window.</p>
          <button
            onClick={() => setStreamInPopup(false)}
            className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-[11px] font-black uppercase tracking-widest transition-colors"
          >
            Bring Stream Back
          </button>
        </div>
      )}

      <div className="h-px bg-white/[0.07] shrink-0" />

      {/* Chat — bottom */}
      <div className="flex-1 flex flex-col overflow-hidden min-h-0 relative bg-[#111214]">
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
                <div className={`max-w-[85%] ${entry.name === userName ? 'items-end' : 'items-start'} flex flex-col`}>
                  {entry.name !== userName && (
                    <span className="text-[10px] font-bold text-neutral-500 ml-1 mb-0.5">{entry.name}</span>
                  )}
                  <div className={`px-3.5 py-2 rounded-2xl text-[13.5px] leading-relaxed relative shadow-md ${
                    entry.name === userName
                      ? 'bg-[#2b5c3f] text-white rounded-tr-sm shadow-emerald-950/50'
                      : 'bg-[#1e2026] text-[#e8eaf0] rounded-tl-sm border border-white/[0.06] shadow-black/40'
                  }`}>
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
        <div className="shrink-0 px-3 pb-3 pt-2 border-t border-white/[0.06] bg-[#161719]">
          {inputError && <p className="text-[10px] text-red-400 font-bold uppercase tracking-widest mb-2 ml-1">{inputError}</p>}
          <div className="flex items-end gap-2">
            <div className="flex-1 flex items-end gap-2 px-3 py-2 rounded-[22px] bg-[#23262e] border border-white/[0.07] transition-all duration-200">
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
              className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200 cursor-pointer
                ${inputText.trim()
                  ? 'bg-emerald-500 shadow-lg shadow-emerald-900/60 hover:bg-emerald-400'
                  : 'bg-[#23262e] border border-white/8 opacity-40 cursor-not-allowed'}`}
            >
              <Send className="w-4 h-4 text-white" strokeWidth={2.5} />
            </motion.button>
          </div>
        </div>
      </div>
    </div>
  );
};