import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { ArrowLeft, Send, Users, ShieldAlert, Clock, AlertCircle, Reply, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useFirebase } from '../FirebaseContext';
import { db, doc, updateDoc, runTransaction, collection, addDoc, Timestamp } from '../firebase';
import { getDistrict } from '../utils/location';
import { containsBanned } from '../constants';

interface CustomChatRoomProps {
  roomData: {
    action: 'global' | 'create' | 'join';
    userName: string;
    roomName?: string;
    maxMembers?: number;
    mode?: 'friends' | 'district';
    districtName?: string;
  };
  onLeave: () => void;
}

interface ChatEntry {
  id: string;
  type: 'msg' | 'system';
  name?: string;
  text: string;
  ts: number;
  replyTo?: { name: string; text: string };
}

const VIOLATION_OPTIONS = [
  'Spamming',
  'Harassment',
  'Hate Speech',
  'Inappropriate Content',
  'Impersonation',
  'Other'
];

export const CustomChatRoom: React.FC<CustomChatRoomProps> = ({ roomData, onLeave }) => {
  const { user } = useFirebase();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [inputText, setInputText] = useState('');
  const [inputError, setInputError] = useState('');
  const [roomState, setRoomState] = useState<any>(null);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [reportUser, setReportUser] = useState('');
  const [reportReason, setReportReason] = useState('');
  const [reportStatus, setReportStatus] = useState('');
  const [replyTo, setReplyTo] = useState<{ name: string; text: string } | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  const addEntry = (entry: ChatEntry) => {
    setEntries(p => [...p, entry]);
  };

  useEffect(() => {
    const sock = io({ forceNew: true });
    setSocket(sock);

    // Deduct 4 tokens using a transaction (reads live Firestore value, never stale)
    const deductTokens = async () => {
      if (!user) return;
      try {
        const userRef = doc(db, 'users', user.uid);
        await runTransaction(db, async (tx) => {
          const snap = await tx.get(userRef);
          const current = snap.exists() ? (snap.data().tokens ?? 100) : 100;
          if (current < 4) {
            throw new Error('INSUFFICIENT_TOKENS');
          }
          tx.update(userRef, { tokens: current - 4 });
        });
      } catch (e: any) {
        if (e?.message === 'INSUFFICIENT_TOKENS') {
          alert('Not enough tokens! You need 4 tokens to join a custom chat room.');
          onLeave();
        } else {
          console.error('Token deduction failed', e);
        }
      }
    };
    deductTokens();

    const onConnect = () => {
      if (roomData.action === 'global') {
        sock.emit('custom-join-global', { name: roomData.userName, uid: user?.uid, email: user?.email });
      } else if (roomData.mode === 'district') {
        sock.emit('custom-join-district', {
          district: roomData.districtName,
          name: roomData.userName,
          uid: user?.uid,
          email: user?.email
        });
      } else if (roomData.action === 'create') {
        sock.emit('custom-create', {
          roomName: roomData.roomName,
          maxMembers: roomData.maxMembers,
          mode: roomData.mode,
          district: roomData.districtName,
          name: roomData.userName,
          uid: user?.uid,
          email: user?.email
        });
      } else if (roomData.action === 'join') {
        sock.emit('custom-join', {
          roomName: roomData.roomName,
          name: roomData.userName,
          uid: user?.uid,
          email: user?.email
        });
      }
      getDistrict().then(district => {
        sock.emit('set-district', { district });
      }).catch(() => {});
    };

    if (sock.connected) onConnect();
    else sock.once('connect', onConnect);

    sock.on('custom-room-update', (data) => {
      setRoomState(data);
    });

    sock.on('custom-chat', ({ id, name, text, ts, replyTo }) => {
      addEntry({ id: id || Math.random().toString(36).slice(2), type: 'msg', name, text, ts, replyTo });
    });

    sock.on('custom-system', (text) => {
      addEntry({ id: Math.random().toString(36).slice(2), type: 'system', text, ts: Date.now() });
    });

    sock.on('custom-error', (msg) => {
      alert(msg);
      onLeave();
    });

    sock.on('custom-expired', () => {
      alert('Room has expired.');
      onLeave();
    });

    return () => {
      sock.emit('custom-leave');
      sock.disconnect();
    };
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries]);

  useEffect(() => {
    if (!roomState?.expiresAt) {
      setTimeLeft(null);
      return;
    }
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.floor((roomState.expiresAt - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining === 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [roomState?.expiresAt]);

  const send = useCallback(() => {
    const trimmed = inputText.trim();
    if (!trimmed || !socket) return;
    if (trimmed.length > 200) { setInputError('Max 200 characters.'); return; }
    if (containsBanned(trimmed)) {
      setInputText('');
      return;
    }
    
    const messageId = Math.random().toString(36).slice(2);
    socket.emit('custom-chat', { id: messageId, text: trimmed, replyTo });
    addEntry({ id: messageId, type: 'msg', name: roomData.userName, text: trimmed, ts: Date.now(), replyTo });
    setInputText('');
    setInputError('');
    setReplyTo(null);
  }, [inputText, socket, roomData.userName, replyTo]);

  const handleReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportUser || !reportReason || !socket || !user) return;

    // Find the reported user's uid from roomState
    const reportedUserObj = roomState?.users?.find((u: any) => u.name === reportUser);
    const reportedUid = reportedUserObj?.uid || null;
    const reportedEmail = reportedUserObj?.email || null;

    // Write to Firestore so it appears in the admin panel
    try {
      await addDoc(collection(db, 'reports'), {
        reporterId: user.uid,
        reporterEmail: user.email,
        reporterName: roomData.userName,
        violatorUid: reportedUid,
        violatorEmail: reportedEmail,
        violatorName: reportUser,
        reason: reportReason,
        timestamp: Timestamp.now(),
        roomId: `custom:${roomData.roomName || 'global'}`,
        source: 'custom-chat',
      });
    } catch (e) {
      console.error('Failed to save report to Firestore:', e);
    }

    // Also notify the server
    socket.emit('custom-report', { violatorName: reportUser, reason: reportReason });

    setReportStatus('Report submitted.');
    setTimeout(() => {
      setShowReport(false);
      setReportStatus('');
      setReportUser('');
      setReportReason('');
    }, 2000);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const isWaiting = roomState && !roomState.isGlobal && roomState.users.length < 2;

  return (
    <div className="flex flex-col h-[100dvh] w-full bg-[#111214] text-white overflow-hidden relative">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06] shrink-0 bg-[#161719]">
        <div className="flex items-center gap-3">
          <button onClick={onLeave} className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors cursor-pointer">
            <ArrowLeft className="w-4 h-4 text-neutral-400" />
          </button>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest">
                {roomState?.isGlobal ? 'GLOBAL CHAT' : roomState?.mode === 'district' ? 'DISTRICT CHAT' : 'CUSTOM ROOM'}
              </span>
            </div>
            <p className="text-sm font-black text-white">{roomState?.id || 'Connecting...'}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {timeLeft !== null && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20">
              <Clock className="w-3 h-3 text-amber-500" />
              <span className="text-[10px] font-bold text-amber-400 font-mono">{formatTime(timeLeft)}</span>
            </div>
          )}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.05] border border-white/[0.07]">
            <Users className="w-3 h-3 text-neutral-500" />
            <span className="text-[10px] font-semibold text-neutral-400">{roomState?.users?.length || 0} {roomState?.maxMembers ? `/ ${roomState.maxMembers}` : ''}</span>
          </div>
          <button onClick={() => setShowReport(true)} className="w-8 h-8 rounded-full bg-red-500/10 hover:bg-red-500/20 flex items-center justify-center transition-colors cursor-pointer">
            <ShieldAlert className="w-4 h-4 text-red-500" />
          </button>
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col overflow-hidden min-h-0 relative">
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-1" style={{ WebkitOverflowScrolling: 'touch' }}>
          {entries.map(entry => (
            <motion.div
              key={entry.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex flex-col ${entry.type === 'system' ? 'items-center my-2' : entry.name === roomData.userName ? 'items-end' : 'items-start'}`}
            >
              {entry.type === 'system' ? (
                <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest bg-white/[0.03] px-3 py-1 rounded-full">
                  {entry.text}
                </span>
              ) : (
                <div className={`max-w-[85%] ${entry.name === roomData.userName ? 'items-end' : 'items-start'} flex flex-col group`}>
                  {entry.name !== roomData.userName && (
                    <span className="text-[10px] font-bold text-neutral-500 ml-1 mb-0.5">{entry.name}</span>
                  )}
                  
                  {entry.replyTo && (
                    <div className={`mb-1 px-3 py-1.5 rounded-xl text-[11px] text-neutral-400 italic max-w-full truncate border-l-[3px] border-emerald-500 ${entry.name === roomData.userName ? 'bg-black/20' : 'bg-black/25'}`}>
                      <span className="font-bold text-emerald-500 not-italic mr-1">{entry.replyTo.name}:</span>
                      {entry.replyTo.text}
                    </div>
                  )}

                  <div className="relative flex items-center gap-2 group">
                    {entry.name === roomData.userName && (
                      <div className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 flex items-center gap-1 transition-opacity">
                        <button onClick={() => setReplyTo({ name: entry.name!, text: entry.text })} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
                          <Reply className="w-3 h-3 text-neutral-400" />
                        </button>
                      </div>
                    )}

                    <div className={`px-3.5 py-2 rounded-2xl text-[13.5px] leading-relaxed relative shadow-md ${
                      entry.name === roomData.userName
                        ? 'bg-[#2b5c3f] text-white rounded-tr-sm shadow-emerald-950/50'
                        : 'bg-[#1e2026] text-[#e8eaf0] rounded-tl-sm border border-white/[0.06] shadow-black/40'
                    }`}>
                      {entry.text}
                    </div>

                    {entry.name !== roomData.userName && (
                      <div className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 flex items-center gap-1 transition-opacity">
                        <button onClick={() => setReplyTo({ name: entry.name!, text: entry.text })} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
                          <Reply className="w-3 h-3 text-neutral-400" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          ))}
        </div>

        {/* Input */}
        <div className="p-3 bg-[#161719] border-t border-white/[0.06] shrink-0">
          {replyTo && (
            <div className="mb-2 px-3 py-2 bg-white/5 border-l-[3px] border-emerald-500 rounded-r-lg flex items-center justify-between group">
              <div className="text-[11px] text-neutral-400 italic truncate">
                <span className="font-bold text-emerald-500 not-italic mr-1">Replying to {replyTo.name}:</span>
                {replyTo.text}
              </div>
              <button onClick={() => setReplyTo(null)} className="p-1 hover:bg-white/10 rounded-full transition-colors">
                <X className="w-3 h-3 text-neutral-500" />
              </button>
            </div>
          )}
          {inputError && <p className="text-[10px] text-red-400 font-bold uppercase tracking-widest mb-2 ml-1">{inputError}</p>}
          <div className="flex items-end gap-2">
            <div className="flex-1 flex items-end gap-2 px-3 py-2 rounded-[22px] bg-[#23262e] border border-white/[0.07] transition-all duration-200">
              <input
                type="text"
                value={inputText}
                onChange={e => { setInputText(e.target.value); setInputError(''); }}
                onKeyDown={e => e.key === 'Enter' && send()}
                placeholder={isWaiting ? "Waiting for members..." : "Message…"}
                disabled={isWaiting}
                className="flex-1 bg-transparent text-[13.5px] text-white placeholder:text-neutral-600 focus:outline-none transition-all disabled:opacity-50"
              />
            </div>
            <button
              onClick={send}
              disabled={!inputText.trim() || isWaiting}
              className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200 cursor-pointer ${
                inputText.trim() && !isWaiting
                  ? 'bg-emerald-500 shadow-lg shadow-emerald-900/60 hover:bg-emerald-400'
                  : 'bg-[#23262e] border border-white/8 opacity-40 cursor-not-allowed'
              }`}
            >
              <Send className="w-4 h-4 text-white" strokeWidth={2.5} />
            </button>
          </div>
        </div>

        {/* Waiting Overlay */}
        <AnimatePresence>
          {isWaiting && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-10 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6"
            >
              <div className="bg-neutral-900 border border-white/10 p-6 rounded-3xl text-center max-w-sm w-full shadow-2xl">
                <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
                  <Users className="w-6 h-6 text-emerald-400" />
                </div>
                <h3 className="text-lg font-black text-white mb-2">Waiting for Members</h3>
                <p className="text-sm text-neutral-400">Minimum 2 members are required to start chatting in this room.</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Report Modal */}
      <AnimatePresence>
        {showReport && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="bg-neutral-900 border border-red-500/20 rounded-3xl p-6 w-full max-w-sm shadow-2xl"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                  <ShieldAlert className="w-5 h-5 text-red-500" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white uppercase tracking-wider">Report User</h3>
                  <p className="text-[10px] text-neutral-500 uppercase tracking-widest">Violations lead to bans</p>
                </div>
              </div>

              {reportStatus ? (
                <div className="text-center py-6 text-emerald-400 font-bold">{reportStatus}</div>
              ) : (
                <form onSubmit={handleReport} className="flex flex-col gap-4">
                  <div>
                    <label className="block text-xs font-bold text-neutral-400 uppercase tracking-widest mb-2">Select User</label>
                    <select
                      value={reportUser}
                      onChange={e => setReportUser(e.target.value)}
                      className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-red-500/50 transition-all"
                      required
                    >
                      <option value="">-- Choose a user --</option>
                      {roomState?.users?.filter((u: any) => u.name !== roomData.userName).map((u: any) => (
                        <option key={u.uid || u.name} value={u.name}>{u.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-neutral-400 uppercase tracking-widest mb-2">Violation Type</label>
                    <select
                      value={reportReason}
                      onChange={e => setReportReason(e.target.value)}
                      className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-red-500/50 transition-all"
                      required
                    >
                      <option value="">-- Select violation --</option>
                      {VIOLATION_OPTIONS.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex gap-2 mt-2">
                    <button type="button" onClick={() => setShowReport(false)} className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-colors">
                      Cancel
                    </button>
                    <button type="submit" className="flex-1 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-colors">
                      Submit
                    </button>
                  </div>
                </form>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
