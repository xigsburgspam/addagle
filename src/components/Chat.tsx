import React, {
  useState, useEffect, useRef, useCallback, useLayoutEffect
} from 'react';
import { createPortal } from 'react-dom';
import { Send, Reply, X, CheckCheck, Clock, Smile, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

import { BANNED_WORDS, containsBanned } from '../constants';

const MSG_CHAR_LIMIT  = 70;   // per message
const CHAT_CHAR_TOTAL = 2599; // total per session
const CHAR_LIMIT      = MSG_CHAR_LIMIT; // alias for existing logic
const SWIPE_THRESHOLD = 58;
const REACTIONS       = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

type Status = 'sending' | 'delivered' | 'seen';

interface Message {
  id: string;
  sender: string;
  text: string;
  timestamp: number;
  status: Status;
  replyTo?: { id: string; text: string; sender: string } | null;
  reaction?: string | null;
}

interface Swipe {
  startX: number; startY: number;
  dx: number; active: boolean; triggered: boolean;
}

interface ChatProps {
  socket: any;
  roomId: string;
  currentUserId: string;
  onNewMessage?: () => void;
  onChatLimitReached?: () => void;
  onTotalCharsChange?: (used: number) => void;
  chatSessionLimit?: number;
}

export const Chat: React.FC<ChatProps> = ({
  socket, roomId, currentUserId, onNewMessage, onChatLimitReached, onTotalCharsChange, chatSessionLimit
}) => {
  const [messages,      setMessages]      = useState<Message[]>([]);
  const [inputText,     setInputText]     = useState('');
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [replyingTo,    setReplyingTo]    = useState<Message | null>(null);
  const [menuId,        setMenuId]        = useState<string | null>(null);
  const [menuFlip,      setMenuFlip]      = useState(false);
  const [menuPos,       setMenuPos]       = useState<{ x: number; y: number; width: number } | null>(null);
  const [flashId,       setFlashId]       = useState<string | null>(null);
  const [ripple,        setRipple]        = useState<{ id: string; x: number; y: number } | null>(null);
  const [swipes,        setSwipes]        = useState<Record<string, Swipe>>({});
  const [newReactionId, setNewReactionId] = useState<string | null>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [totalCharsUsed, setTotalCharsUsed] = useState(0);
  // undefined means no limit (video chat); a number means text chat limit
  const hasLimit = chatSessionLimit !== undefined;
  // Keep as state so UI re-renders when limit changes (e.g. after topup)
  const [effectiveLimitState, setEffectiveLimitState] = React.useState(chatSessionLimit ?? Infinity);
  const chatSessionLimitRef = React.useRef(chatSessionLimit ?? Infinity);
  React.useEffect(() => {
    const val = chatSessionLimit ?? Infinity;
    chatSessionLimitRef.current = val;
    setEffectiveLimitState(val); // triggers re-render so chatCharsLeft recalculates
  }, [chatSessionLimit]);

  const scrollRef    = useRef<HTMLDivElement>(null);
  const inputRef     = useRef<HTMLTextAreaElement>(null);
  const typingTimer  = useRef<NodeJS.Timeout | null>(null);
  const bubbleRefs   = useRef<Record<string, HTMLDivElement | null>>({});
  const msgRefs      = useRef<Record<string, HTMLDivElement | null>>({});
  const isAtBottom   = useRef(true);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isAtBottom.current = distFromBottom < 60;
    setShowScrollBtn(distFromBottom > 120);
  };

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    setShowScrollBtn(false);
    isAtBottom.current = true;
  };

  useLayoutEffect(() => {
    if (isAtBottom.current) scrollToBottom('smooth');
  }, [messages]);

  useEffect(() => {
    onTotalCharsChange?.(totalCharsUsed);
  }, [totalCharsUsed]);

  useEffect(() => {
    const close = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('[data-portal-menu]')) return;
      setMenuId(null);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('touchstart', close);
    };
  }, []);

  useEffect(() => {
    if (!socket) return;
    const onMsg = (m: Message) => {
      setMessages(p => [...p, { ...m, status: 'delivered' }]);
      socket.emit('message-seen', { roomId, messageId: m.id });
      // Count partner's message toward the shared session limit
      setTotalCharsUsed(prev => {
        const newTotal = prev + m.text.length;
        if (newTotal >= chatSessionLimitRef.current) {
          setTimeout(() => onChatLimitReached?.(), 1500);
        }
        return newTotal;
      });
      if (onNewMessage) onNewMessage();
    };
    const onDelivered = ({ messageId }: { messageId: string }) =>
      setMessages(p => p.map(m =>
        m.id === messageId && m.status === 'sending' ? { ...m, status: 'delivered' } : m));
    const onSeen = ({ messageId }: { messageId: string }) =>
      setMessages(p => p.map(m =>
        m.id === messageId ? { ...m, status: 'seen' } : m));
    const onReaction = ({ messageId, emoji }: { messageId: string; emoji: string }) => {
      setMessages(p => p.map(m =>
        m.id === messageId ? { ...m, reaction: emoji } : m));
      setNewReactionId(messageId);
      setTimeout(() => setNewReactionId(null), 600);
    };
    socket.on('chat-message',      onMsg);
    socket.on('typing-start',      () => setPartnerTyping(true));
    socket.on('typing-stop',       () => setPartnerTyping(false));
    socket.on('message-delivered', onDelivered);
    socket.on('message-seen',      onSeen);
    socket.on('message-reaction',  onReaction);
    return () => {
      socket.off('chat-message');      socket.off('typing-start');
      socket.off('typing-stop');       socket.off('message-delivered');
      socket.off('message-seen');      socket.off('message-reaction');
    };
  }, [socket, roomId]);

  const send = useCallback(() => {
    const t = inputText.trim();
    if (!t || !socket) return;
    if (t.length > MSG_CHAR_LIMIT) return;
    if (hasLimit && chatCharsLeft <= 0) return;
    if (containsBanned(t)) {
      setInputText('');
      return;
    }
    if (typingTimer.current) clearTimeout(typingTimer.current);
    socket.emit('typing-stop', { roomId });
    const msg: Message = {
      id: Math.random().toString(36).slice(2, 11),
      sender: currentUserId, text: t,
      timestamp: Date.now(), status: 'sending',
      replyTo: replyingTo
        ? { id: replyingTo.id, text: replyingTo.text, sender: replyingTo.sender }
        : null,
      reaction: null,
    };
    socket.emit('send-chat-message', { roomId, message: msg });
    socket.emit('message-delivered', { roomId, messageId: msg.id });
    setMessages(p => [...p, msg]);
    const newTotal = totalCharsUsed + t.length;
    setTotalCharsUsed(newTotal);
    setInputText('');
    // Auto-skip when total chat chars exceeded
    if (newTotal >= chatSessionLimitRef.current) {
      setTimeout(() => onChatLimitReached?.(), 1500);
    }
    setReplyingTo(null);
    isAtBottom.current = true;
    if (inputRef.current) { inputRef.current.style.height = 'auto'; inputRef.current.focus(); }
  }, [inputText, socket, roomId, currentUserId, replyingTo]);

  const react = useCallback((messageId: string, emoji: string) => {
    const msg = messages.find(m => m.id === messageId);
    const isSame = msg?.reaction === emoji;
    const newEmoji = isSame ? null : emoji;
    socket.emit('message-reaction', { roomId, messageId, emoji: newEmoji });
    setMessages(p => p.map(m => m.id === messageId ? { ...m, reaction: newEmoji } : m));
    if (!isSame) {
      setNewReactionId(messageId);
      setTimeout(() => setNewReactionId(null), 600);
    }
    setMenuId(null);
  }, [socket, roomId, messages]);

  const scrollToMsg = (id: string) => {
    const el = msgRefs.current[id];
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setFlashId(id);
    setTimeout(() => setFlashId(null), 1200);
  };

  const openMenu = (id: string, e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    const el = bubbleRefs.current[id];
    if (el) {
      const r = el.getBoundingClientRect();
      const spaceBelow = window.innerHeight - r.bottom;
      const flip = spaceBelow < 200;
      setMenuFlip(flip);
      setMenuPos({ x: r.left, y: flip ? r.top : r.bottom, width: r.width });
    }
    setMenuId(p => p === id ? null : id);
  };

  const triggerRipple = (id: string, e: React.MouseEvent | React.TouchEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    let cx: number, cy: number;
    if ('touches' in e) {
      cx = e.touches[0].clientX - rect.left;
      cy = e.touches[0].clientY - rect.top;
    } else {
      cx = (e as React.MouseEvent).clientX - rect.left;
      cy = (e as React.MouseEvent).clientY - rect.top;
    }
    setRipple({ id, x: cx, y: cy });
    setTimeout(() => setRipple(null), 500);
  };

  const swipeStart = (id: string, e: React.TouchEvent) => {
    const t = e.touches[0];
    setSwipes(p => ({ ...p, [id]: { startX: t.clientX, startY: t.clientY, dx: 0, active: true, triggered: false } }));
  };
  const swipeMove = (id: string, e: React.TouchEvent) => {
    const s = swipes[id];
    if (!s?.active) return;
    const t  = e.touches[0];
    const dx = t.clientX - s.startX;
    const dy = Math.abs(t.clientY - s.startY);
    if (dy > 18 && Math.abs(dx) < dy) {
      setSwipes(p => ({ ...p, [id]: { ...s, active: false } }));
      return;
    }
    const cdx = Math.max(0, Math.min(dx, SWIPE_THRESHOLD + 16));
    if (!s.triggered && cdx >= SWIPE_THRESHOLD && navigator.vibrate) navigator.vibrate(28);
    setSwipes(p => ({ ...p, [id]: { ...s, dx: cdx, triggered: s.triggered || cdx >= SWIPE_THRESHOLD } }));
  };
  const swipeEnd = (id: string, msg: Message) => {
    const s = swipes[id];
    if (s?.triggered) {
      setReplyingTo(msg);
      setTimeout(() => inputRef.current?.focus(), 80);
    }
    setSwipes(p => ({ ...p, [id]: { ...s, dx: 0, active: false, triggered: false } }));
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (e.target.value.length > MSG_CHAR_LIMIT) return;
    setInputText(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
    if (!socket) return;
    socket.emit('typing-start', { roomId });
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => socket.emit('typing-stop', { roomId }), 2000);
  };

  const Tick = ({ s }: { s: Status }) => (
    s === 'sending'   ? <Clock      className="w-2.5 h-2.5 text-white/30" /> :
    s === 'delivered' ? <CheckCheck className="w-3 h-3 text-white/50" />     :
                        <CheckCheck className="w-3 h-3 text-emerald-300" />
  );

  const effectiveLimit = chatSessionLimitRef.current;
  const msgCharsLeft = MSG_CHAR_LIMIT - inputText.length;
  const chatCharsLeft = effectiveLimit - totalCharsUsed;

  return (
    <div className="flex flex-col h-full w-full overflow-hidden select-none"
         style={{ background: '#111214' }}>

      {/* scroll area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overflow-x-hidden px-2 sm:px-3 pt-4 pb-2 relative"
        style={{ WebkitOverflowScrolling: 'touch' }}
        onScroll={handleScroll}
        onMouseDown={e => {
          const target = e.target as HTMLElement;
          if (!target.closest('[data-portal-menu]')) setMenuId(null);
        }}
      >

        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center gap-2 opacity-40">
            <div className="w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-500/30
                            flex items-center justify-center text-lg">🔒</div>
            <p className="text-[10px] text-neutral-500 font-medium tracking-widest uppercase">
              End-to-end encrypted
            </p>
            <p className="text-[9px] text-neutral-600">Swipe → any message to reply</p>
          </div>
        )}

        {messages.map((msg, idx) => {
          const mine    = msg.sender === currentUserId;
          const prev    = idx > 0 ? messages[idx - 1] : null;
          const grouped = !!(prev && prev.sender === msg.sender && msg.timestamp - prev.timestamp < 60_000);
          const isActive = menuId === msg.id;
          const swDx    = swipes[msg.id]?.dx ?? 0;
          const isFlash = flashId === msg.id;

          return (
            <div
              key={msg.id}
              ref={el => { msgRefs.current[msg.id] = el; }}
              className={`flex w-full ${mine ? 'justify-end' : 'justify-start'}
                          ${grouped ? 'mt-0.5' : 'mt-3'}
                          ${msg.reaction ? 'mb-5' : 'mb-0.5'}`}
            >
              <div
                className="relative"
                style={{
                  maxWidth: '80%',
                  transform:  `translateX(${swDx}px)`,
                  transition: swipes[msg.id]?.active ? 'none' : 'transform 0.28s cubic-bezier(.34,1.56,.64,1)',
                }}
                onTouchStart={e => swipeStart(msg.id, e)}
                onTouchMove={e  => swipeMove(msg.id, e)}
                onTouchEnd={() => swipeEnd(msg.id, msg)}
              >
                {swDx > 6 && (
                  <motion.div
                    className="absolute -left-9 top-1/2 -translate-y-1/2"
                    style={{ opacity: Math.min(swDx / SWIPE_THRESHOLD, 1) }}
                  >
                    <div className={`w-7 h-7 rounded-full border flex items-center justify-center
                                     bg-emerald-500/15 border-emerald-500/40 transition-transform duration-100
                                     ${swDx >= SWIPE_THRESHOLD ? 'scale-125' : 'scale-100'}`}>
                      <Reply className="w-3.5 h-3.5 text-emerald-400" />
                    </div>
                  </motion.div>
                )}

                <div className={`flex items-end gap-2 group/row ${mine ? 'flex-row-reverse' : 'flex-row'}`}>

                  <div className={`hidden sm:flex flex-col gap-1 shrink-0 mb-1
                                   opacity-0 group-hover/row:opacity-100 transition-opacity duration-150
                                   ${mine ? 'order-last' : 'order-first'}`}>
                    {!mine && (
                      <button
                        onMouseDown={e => { e.stopPropagation(); openMenu(msg.id, e); }}
                        className="w-7 h-7 rounded-full bg-[#1e2025] hover:bg-[#2a2d34]
                                   border border-white/8 hover:border-emerald-500/30
                                   flex items-center justify-center cursor-pointer
                                   transition-all hover:scale-110 active:scale-95"
                        title="React"
                      >
                        <Smile className="w-3.5 h-3.5 text-neutral-500" />
                      </button>
                    )}
                    <button
                      onMouseDown={e => { e.stopPropagation(); setReplyingTo(msg); inputRef.current?.focus(); }}
                      className="w-7 h-7 rounded-full bg-[#1e2025] hover:bg-[#2a2d34]
                                 border border-white/8 hover:border-emerald-500/30
                                 flex items-center justify-center cursor-pointer
                                 transition-all hover:scale-110 active:scale-95"
                      title="Reply"
                    >
                      <Reply className="w-3.5 h-3.5 text-neutral-500" />
                    </button>
                  </div>

                  <motion.div
                    ref={el => { bubbleRefs.current[msg.id] = el; }}
                    initial={{ opacity: 0, scale: 0.92, y: 6, x: mine ? 10 : -10 }}
                    animate={{ opacity: 1, scale: 1, y: 0, x: 0 }}
                    transition={{ duration: 0.18, ease: [0.34, 1.2, 0.64, 1] }}
                    onMouseDown={e => e.stopPropagation()}
                    onMouseEnter={() => {}}
                    onClick={e => {
                      if (window.innerWidth < 640) { triggerRipple(msg.id, e); openMenu(msg.id, e); }
                    }}
                    onTouchStart={e => triggerRipple(msg.id, e)}
                    className={`relative rounded-2xl
                      ${mine  ? 'rounded-tr-sm' : 'rounded-tl-sm'}
                      ${mine
                        ? 'bg-[#2b5c3f] text-white shadow-md shadow-emerald-950/50'
                        : 'bg-[#1e2026] text-[#e8eaf0] shadow-md shadow-black/40 border border-white/[0.06]'}
                      ${isActive ? 'brightness-110' : ''}
                      ${isFlash ? 'ring-2 ring-emerald-400/60' : ''}
                      cursor-pointer transition-[filter,box-shadow] duration-150 pb-1
                    `}
                    style={{
                      background: isFlash ? (mine ? '#3a7a55' : '#2c3040') : undefined,
                      overflow: 'visible',
                    }}
                  >
                    {/* ripple clipped inside inner div */}
                    <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none">
                      {ripple?.id === msg.id && (
                        <motion.span
                          className="absolute rounded-full bg-white/15"
                          style={{ width: 8, height: 8, left: ripple.x - 4, top: ripple.y - 4 }}
                          initial={{ scale: 0, opacity: 0.6 }}
                          animate={{ scale: 22, opacity: 0 }}
                          transition={{ duration: 0.45, ease: 'easeOut' }}
                        />
                      )}
                    </div>

                    {msg.replyTo && (
                      <div
                        className={`mx-2 mt-2 mb-1 px-2.5 py-1.5 rounded-xl cursor-pointer
                                    border-l-[3px] border-emerald-500
                                    ${mine ? 'bg-black/20' : 'bg-black/25'}
                                    hover:brightness-125 transition-all`}
                        onClick={e => { e.stopPropagation(); scrollToMsg(msg.replyTo!.id); }}
                      >
                        <p className="text-[9px] font-semibold text-emerald-400 mb-0.5 tracking-wide">
                          {msg.replyTo.sender === currentUserId ? 'You' : 'Stranger'}
                        </p>
                        <p className="text-[11px] text-white/50 truncate leading-snug">
                          {msg.replyTo.text}
                        </p>
                      </div>
                    )}

                    <p className="px-3 pt-1.5 text-[13.5px] leading-[1.5] break-words break-all relative z-10" style={{ wordBreak: "break-word", overflowWrap: "anywhere" }}>
                      {msg.text}
                    </p>

                    <div className={`flex items-center gap-1 px-2.5 pb-1.5 mt-0.5
                                     ${mine ? 'justify-end' : 'justify-start'}`}>
                      <span className={`text-[10px] ${mine ? 'text-white/30' : 'text-white/20'}`}>
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {mine && <Tick s={msg.status} />}
                    </div>

                    <AnimatePresence>
                      {msg.reaction && (
                        <motion.div
                          key={msg.reaction}
                          initial={{ scale: 0, opacity: 0 }}
                          animate={{ scale: newReactionId === msg.id ? [0, 1.4, 1] : 1, opacity: 1 }}
                          exit={{ scale: 0, opacity: 0 }}
                          transition={{ duration: 0.3, ease: 'backOut' }}
                          className={`absolute -bottom-5 text-sm leading-none z-30
                                      bg-[#1a1c22] border border-white/10
                                      rounded-full px-1.5 py-0.5 shadow-lg
                                      ${mine ? 'right-2' : 'left-2'}`}
                        >
                          {msg.reaction}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                </div>
              </div>
            </div>
          );
        })}

        {/* Grey notice when approaching chat limit */}
        {hasLimit && chatCharsLeft <= 100 && chatCharsLeft > 0 && (
          <div className="flex justify-center my-2">
            <span className="text-[10px] font-bold text-neutral-500 bg-neutral-900/60 px-3 py-1 rounded-full border border-neutral-800">
              ⚠ {chatCharsLeft} characters remaining in this chat
            </span>
          </div>
        )}
        {hasLimit && chatCharsLeft <= 0 && (
          <div className="flex justify-center my-2">
            <span className="text-[10px] font-bold text-red-400 bg-red-500/10 px-3 py-1 rounded-full border border-red-500/20">
              Chat limit reached — finding next person...
            </span>
          </div>
        )}

        <AnimatePresence>
          {partnerTyping && (
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.9 }}
              transition={{ duration: 0.2 }}
              className="flex justify-start mt-3"
            >
              <div className="px-4 py-3 rounded-2xl rounded-tl-sm shadow-md"
                   style={{ background: '#1e2026', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="flex gap-1 items-end h-3">
                  {[0, 1, 2].map(i => (
                    <motion.span key={i}
                      animate={{ y: [0, -5, 0] }}
                      transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15, ease: 'easeInOut' }}
                      className="block w-1.5 h-1.5 rounded-full bg-neutral-500"
                    />
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="h-2" />
      </div>

      {/* Scroll-to-bottom button */}
      <AnimatePresence>
        {showScrollBtn && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 8 }}
            transition={{ duration: 0.18 }}
            onClick={() => scrollToBottom('smooth')}
            className="absolute bottom-[72px] right-4 z-40
                       w-9 h-9 rounded-full flex items-center justify-center
                       bg-[#2b5c3f] border border-emerald-500/30
                       shadow-lg shadow-black/40 cursor-pointer
                       hover:bg-emerald-600 transition-colors"
            style={{ position: 'absolute' }}
          >
            <ChevronDown className="w-4 h-4 text-white" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Portal context menu */}
      {menuId && menuPos && (() => {
        const activeMsg = messages.find(m => m.id === menuId);
        if (!activeMsg) return null;
        const isMinePortal = activeMsg.sender === currentUserId;
        const menuWidth = 196;
        const rawX = isMinePortal
          ? menuPos.x + menuPos.width - menuWidth
          : menuPos.x;
        const clampedX = Math.max(8, Math.min(rawX, window.innerWidth - menuWidth - 8));
        const posStyle: React.CSSProperties = menuFlip
          ? { position: 'fixed', left: clampedX, bottom: window.innerHeight - menuPos.y + 6, zIndex: 99999 }
          : { position: 'fixed', left: clampedX, top: menuPos.y + 6, zIndex: 99999 };

        return createPortal(
          <motion.div
            data-portal-menu="true"
            initial={{ opacity: 0, scale: 0.85, y: menuFlip ? 6 : -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.85 }}
            transition={{ duration: 0.16, ease: [0.34, 1.4, 0.64, 1] }}
            style={{ ...posStyle, minWidth: menuWidth, background: '#1e2128' }}
            className="rounded-2xl overflow-hidden shadow-2xl shadow-black/80 border border-white/[0.08]"
            onMouseDown={e => e.stopPropagation()}
          >
            {!isMinePortal && (
              <div className="flex items-center gap-0.5 px-2 py-2.5 border-b border-white/[0.07]">
                {REACTIONS.map(emoji => (
                  <button
                    key={emoji}
                    onPointerDown={e => {
                      e.stopPropagation();
                      e.preventDefault();
                      react(activeMsg.id, emoji);
                    }}
                    className="w-9 h-9 flex items-center justify-center rounded-xl
                               text-[1.25rem] hover:bg-white/10 active:scale-90
                               transition-all duration-100 cursor-pointer"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
            <button
              onPointerDown={e => {
                e.stopPropagation();
                e.preventDefault();
                setReplyingTo(activeMsg);
                setMenuId(null);
                setTimeout(() => inputRef.current?.focus(), 60);
              }}
              className="w-full flex items-center gap-3 px-4 py-3
                         hover:bg-white/[0.07] active:bg-white/10
                         transition-colors cursor-pointer"
            >
              <div className="w-7 h-7 rounded-full bg-emerald-500/15 flex items-center justify-center shrink-0">
                <Reply className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <span className="text-[13px] font-medium text-neutral-200">Reply</span>
            </button>
          </motion.div>,
          document.body
        );
      })()}

      {/* input area */}
      <div className="shrink-0 relative" style={{ background: '#161719', borderTop: '1px solid rgba(255,255,255,0.06)' }}>

        <AnimatePresence>
          {replyingTo && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.18 }}
              className="overflow-hidden"
            >
              <div className="flex items-center gap-3 px-4 pt-3 pb-1">
                <div className="w-0.5 self-stretch rounded-full bg-emerald-500" />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-semibold text-emerald-400 mb-0.5">
                    {replyingTo.sender === currentUserId ? 'You' : 'Stranger'}
                  </p>
                  <p className="text-[11px] text-neutral-500 truncate">{replyingTo.text}</p>
                </div>
                <button onClick={() => setReplyingTo(null)}
                  className="shrink-0 w-6 h-6 rounded-full bg-white/8 hover:bg-white/15
                             flex items-center justify-center transition-colors cursor-pointer">
                  <X className="w-3 h-3 text-neutral-500" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-end gap-2 px-3 py-2.5">
          <div className="flex-1 flex items-end gap-2 px-3 py-2 rounded-[22px] transition-all duration-200"
               style={{ background: '#23262e', border: '1px solid rgba(255,255,255,0.07)' }}>
            <textarea
              ref={inputRef}
              value={inputText}
              onChange={handleInput}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey && window.innerWidth >= 640) {
                  e.preventDefault(); send();
                }
              }}
              placeholder={hasLimit && chatCharsLeft <= 0 ? "Chat limit reached" : "Message…"}
              disabled={hasLimit && chatCharsLeft <= 0}
              rows={1}
              style={{ maxHeight: 120, minHeight: 22 }}
              className="flex-1 bg-transparent text-[13.5px] text-white leading-relaxed
                         focus:outline-none placeholder:text-neutral-600 resize-none overflow-y-auto"
            />
            {msgCharsLeft <= 20 && (
              <span className={`text-[9px] font-mono self-end mb-0.5 shrink-0
                               ${msgCharsLeft <= 5 ? 'text-red-400' : 'text-yellow-500/60'}`}>
                {msgCharsLeft}
              </span>
            )}
          </div>

          <motion.button
            onMouseDown={e => e.preventDefault()}
            onClick={() => { send(); inputRef.current?.focus(); }}
            disabled={!inputText.trim()}
            whileTap={{ scale: 0.88 }}
            className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center
                        transition-all duration-200 cursor-pointer
                        ${inputText.trim()
                          ? 'bg-emerald-500 shadow-lg shadow-emerald-900/60 hover:bg-emerald-400'
                          : 'bg-[#23262e] border border-white/8 opacity-40 cursor-not-allowed'}`}
          >
            <Send className="w-4 h-4 text-white" strokeWidth={2.5} />
          </motion.button>
        </div>
      </div>
    </div>
  );
};