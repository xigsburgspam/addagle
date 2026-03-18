import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Reply, X, Check, CheckCheck, Clock, Smile } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const CHAR_LIMIT = 200;
const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];
const SWIPE_THRESHOLD = 60;

type MessageStatus = 'sending' | 'delivered' | 'seen';

interface Message {
  id: string;
  sender: string;
  text: string;
  timestamp: number;
  status: MessageStatus;
  replyTo?: { id: string; text: string; sender: string } | null;
  reaction?: string | null;
}

interface ChatProps {
  socket: any;
  roomId: string;
  currentUserId: string;
  onNewMessage?: () => void;
}

interface SwipeState {
  startX: number;
  startY: number;
  dx: number;
  active: boolean;
  triggered: boolean;
}

export const Chat: React.FC<ChatProps> = ({ socket, roomId, currentUserId, onNewMessage }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isPartnerTyping, setIsPartnerTyping] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [menuAbove, setMenuAbove] = useState(true);
  const [swipeStates, setSwipeStates] = useState<Record<string, SwipeState>>({});

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const bubbleRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isPartnerTyping]);

  useEffect(() => {
    const close = (e: MouseEvent | TouchEvent) => {
      setActiveMenuId(null);
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

    const handleMessage = (message: Message) => {
      setMessages(prev => [...prev, { ...message, status: 'delivered' }]);
      socket.emit('message-seen', { roomId, messageId: message.id });
      if (onNewMessage) onNewMessage();
    };
    const handleTypingStart = () => setIsPartnerTyping(true);
    const handleTypingStop  = () => setIsPartnerTyping(false);
    const handleDelivered = ({ messageId }: { messageId: string }) =>
      setMessages(prev => prev.map(m =>
        m.id === messageId && m.status === 'sending' ? { ...m, status: 'delivered' } : m
      ));
    const handleSeen = ({ messageId }: { messageId: string }) =>
      setMessages(prev => prev.map(m =>
        m.id === messageId ? { ...m, status: 'seen' } : m
      ));
    const handleReaction = ({ messageId, emoji }: { messageId: string; emoji: string }) =>
      setMessages(prev => prev.map(m =>
        m.id === messageId ? { ...m, reaction: emoji } : m
      ));

    socket.on('chat-message',      handleMessage);
    socket.on('typing-start',      handleTypingStart);
    socket.on('typing-stop',       handleTypingStop);
    socket.on('message-delivered', handleDelivered);
    socket.on('message-seen',      handleSeen);
    socket.on('message-reaction',  handleReaction);

    return () => {
      socket.off('chat-message',      handleMessage);
      socket.off('typing-start',      handleTypingStart);
      socket.off('typing-stop',       handleTypingStop);
      socket.off('message-delivered', handleDelivered);
      socket.off('message-seen',      handleSeen);
      socket.off('message-reaction',  handleReaction);
    };
  }, [socket, roomId]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    if (val.length > CHAR_LIMIT) return;
    setInputText(val);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
    if (socket) {
      socket.emit('typing-start', { roomId });
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => socket.emit('typing-stop', { roomId }), 2000);
    }
  };

  const sendMessage = useCallback(() => {
    const trimmed = inputText.trim();
    if (!trimmed || !socket || trimmed.length > CHAR_LIMIT) return;
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    socket.emit('typing-stop', { roomId });

    const msg: Message = {
      id: Math.random().toString(36).substr(2, 9),
      sender: currentUserId,
      text: trimmed,
      timestamp: Date.now(),
      status: 'sending',
      replyTo: replyingTo
        ? { id: replyingTo.id, text: replyingTo.text, sender: replyingTo.sender }
        : null,
      reaction: null,
    };
    socket.emit('send-chat-message',  { roomId, message: msg });
    socket.emit('message-delivered',  { roomId, messageId: msg.id });
    setMessages(prev => [...prev, msg]);
    setInputText('');
    setReplyingTo(null);
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.focus();
    }
  }, [inputText, socket, roomId, currentUserId, replyingTo]);

  const sendReaction = (messageId: string, emoji: string) => {
    socket.emit('message-reaction', { roomId, messageId, emoji });
    setMessages(prev => prev.map(m => m.id === messageId ? { ...m, reaction: emoji } : m));
    setActiveMenuId(null);
  };

  const openMenu = (msgId: string, e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    const el = bubbleRefs.current[msgId];
    if (el) {
      const rect = el.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      setMenuAbove(spaceBelow < 180);
    }
    setActiveMenuId(prev => prev === msgId ? null : msgId);
  };

  const onTouchStart = (msgId: string, e: React.TouchEvent) => {
    const t = e.touches[0];
    setSwipeStates(prev => ({
      ...prev,
      [msgId]: { startX: t.clientX, startY: t.clientY, dx: 0, active: true, triggered: false }
    }));
  };

  const onTouchMove = (msgId: string, e: React.TouchEvent) => {
    const s = swipeStates[msgId];
    if (!s || !s.active) return;
    const t = e.touches[0];
    const dx = t.clientX - s.startX;
    const dy = Math.abs(t.clientY - s.startY);

    if (dy > 20 && Math.abs(dx) < dy) {
      setSwipeStates(prev => ({ ...prev, [msgId]: { ...s, active: false } }));
      return;
    }

    const clampedDx = Math.max(0, Math.min(dx, SWIPE_THRESHOLD + 20));

    setSwipeStates(prev => ({
      ...prev,
      [msgId]: { ...s, dx: clampedDx, triggered: s.triggered || clampedDx >= SWIPE_THRESHOLD }
    }));

    if (!s.triggered && clampedDx >= SWIPE_THRESHOLD) {
      if (navigator.vibrate) navigator.vibrate(30);
    }
  };

  const onTouchEnd = (msgId: string, msg: Message) => {
    const s = swipeStates[msgId];
    if (s?.triggered) {
      setReplyingTo(msg);
      setTimeout(() => inputRef.current?.focus(), 80);
    }
    setSwipeStates(prev => ({ ...prev, [msgId]: { ...s, dx: 0, active: false, triggered: false } }));
  };

  const StatusIcon = ({ status }: { status: MessageStatus }) => {
    if (status === 'sending')   return <Clock      className="w-2.5 h-2.5 text-white/30" />;
    if (status === 'delivered') return <CheckCheck className="w-3 h-3 text-white/50" />;
    return                              <CheckCheck className="w-3 h-3 text-emerald-300" />;
  };

  const charsLeft   = CHAR_LIMIT - inputText.length;
  const isNearLimit = charsLeft <= 30;

  return (
    <div className="flex flex-col h-full w-full overflow-hidden"
         style={{ background: 'linear-gradient(180deg, #0a0a0a 0%, #0d0d0d 100%)' }}>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overflow-x-hidden py-3 px-2 sm:px-3"
        style={{ WebkitOverflowScrolling: 'touch' }}
        onMouseDown={() => setActiveMenuId(null)}
      >
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 py-16">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20
                            flex items-center justify-center shadow-lg shadow-emerald-500/10">
              <span className="text-xl">🔒</span>
            </div>
            <p className="text-[10px] font-bold tracking-[0.25em] uppercase text-neutral-600">
              End-to-end encrypted
            </p>
            <p className="text-[9px] text-neutral-700 tracking-wide">
              Swipe right on any message to reply
            </p>
          </div>
        )}

        <div className="space-y-0.5">
          {messages.map((msg, idx) => {
            const isMine    = msg.sender === currentUserId;
            const isMenu    = activeMenuId === msg.id;
            const sw        = swipeStates[msg.id];
            const swipeDx   = sw?.dx ?? 0;
            const prevMsg   = idx > 0 ? messages[idx - 1] : null;
            const isGrouped = prevMsg && prevMsg.sender === msg.sender &&
                              msg.timestamp - prevMsg.timestamp < 60_000;

            return (
              <div
                key={msg.id}
                className={`flex w-full ${isMine ? 'justify-end' : 'justify-start'}
                            ${isGrouped ? 'mt-0.5' : 'mt-3'}`}
              >
                <div
                  className="relative"
                  style={{
                    transform: `translateX(${swipeDx}px)`,
                    transition: sw?.active ? 'none' : 'transform 0.25s cubic-bezier(.34,1.56,.64,1)',
                    maxWidth: '82%',
                  }}
                  onTouchStart={e => onTouchStart(msg.id, e)}
                  onTouchMove={e  => onTouchMove(msg.id, e)}
                  onTouchEnd={() => onTouchEnd(msg.id, msg)}
                >
                  {/* Swipe reply arrow */}
                  {swipeDx > 8 && (
                    <div
                      className="absolute -left-8 top-1/2 -translate-y-1/2 flex items-center justify-center"
                      style={{ opacity: Math.min(swipeDx / SWIPE_THRESHOLD, 1) }}
                    >
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center
                                       bg-emerald-500/20 border border-emerald-500/40
                                       ${swipeDx >= SWIPE_THRESHOLD ? 'scale-110' : 'scale-100'}
                                       transition-transform`}>
                        <Reply className="w-3 h-3 text-emerald-400" />
                      </div>
                    </div>
                  )}

                  {/* Reply preview */}
                  {msg.replyTo && (
                    <div className={`flex mb-1 ${isMine ? 'justify-end' : 'justify-start'}`}>
                      <div className={`
                        max-w-full px-2.5 py-1.5 rounded-xl text-[10px] leading-snug
                        border-l-2 border-emerald-500
                        ${isMine
                          ? 'bg-emerald-950/60 text-emerald-200/60 rounded-tr-sm'
                          : 'bg-white/5 text-neutral-400 rounded-tl-sm'}
                      `}>
                        <div className="text-[9px] font-semibold text-emerald-400 uppercase tracking-wider mb-0.5">
                          {msg.replyTo.sender === currentUserId ? 'You' : 'Stranger'}
                        </div>
                        <div className="truncate max-w-[200px] text-[10px]">{msg.replyTo.text}</div>
                      </div>
                    </div>
                  )}

                  {/* Bubble row */}
                  <div className={`flex items-end gap-1.5 group/row
                                   ${isMine ? 'flex-row-reverse' : 'flex-row'}`}>

                    {/* Desktop action buttons */}
                    <div className={`
                      hidden sm:flex flex-col gap-1 shrink-0 mb-0.5
                      opacity-0 group-hover/row:opacity-100
                      transition-all duration-150
                      ${isMine ? 'order-last' : 'order-first'}
                    `}>
                      {!isMine && (
                        <button
                          onMouseDown={e => { e.stopPropagation(); openMenu(msg.id, e); }}
                          className="w-7 h-7 rounded-full bg-neutral-800 hover:bg-neutral-700
                                     border border-neutral-700 hover:border-emerald-500/40
                                     flex items-center justify-center
                                     transition-all hover:scale-110 active:scale-95"
                          title="React"
                        >
                          <Smile className="w-3.5 h-3.5 text-neutral-400" />
                        </button>
                      )}
                      <button
                        onMouseDown={e => {
                          e.stopPropagation();
                          setReplyingTo(msg);
                          inputRef.current?.focus();
                        }}
                        className="w-7 h-7 rounded-full bg-neutral-800 hover:bg-neutral-700
                                   border border-neutral-700 hover:border-emerald-500/40
                                   flex items-center justify-center
                                   transition-all hover:scale-110 active:scale-95"
                        title="Reply"
                      >
                        <Reply className="w-3.5 h-3.5 text-neutral-400" />
                      </button>
                    </div>

                    {/* Bubble */}
                    <div
                      ref={el => { bubbleRefs.current[msg.id] = el; }}
                      onMouseDown={e => e.stopPropagation()}
                      onClick={e => {
                        if (window.innerWidth < 640) openMenu(msg.id, e);
                      }}
                      className={`
                        relative px-3 py-2 select-none cursor-pointer
                        text-sm leading-relaxed break-words
                        transition-all duration-150
                        ${isMine
                          ? 'bg-gradient-to-br from-emerald-600 to-emerald-700 text-white shadow-lg shadow-emerald-900/40 rounded-2xl rounded-tr-md'
                          : 'bg-gradient-to-br from-neutral-800 to-neutral-800/80 text-neutral-100 shadow-lg shadow-black/30 border border-white/5 rounded-2xl rounded-tl-md'
                        }
                        ${isMenu ? (isMine ? 'ring-1 ring-emerald-400/30' : 'ring-1 ring-white/10') : ''}
                        active:opacity-80
                      `}
                    >
                      {isMine && (
                        <div className="absolute inset-0 rounded-2xl rounded-tr-md
                                        bg-gradient-to-br from-white/10 to-transparent
                                        pointer-events-none" />
                      )}

                      <span className="relative z-10">{msg.text}</span>

                      <div className={`flex items-center gap-1 mt-1
                                       ${isMine ? 'justify-end' : 'justify-start'}`}>
                        <span className={`text-[9px] ${isMine ? 'text-white/40' : 'text-neutral-600'}`}>
                          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {isMine && <StatusIcon status={msg.status} />}
                      </div>

                      {msg.reaction && (
                        <div className={`
                          absolute -bottom-4 text-sm leading-none z-20
                          bg-neutral-900 border border-neutral-700/80
                          rounded-full px-1.5 py-0.5 shadow-xl
                          ${isMine ? '-left-1' : '-right-1'}
                        `}>
                          {msg.reaction}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Context menu */}
                  <AnimatePresence>
                    {isMenu && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.88, y: menuAbove ? 6 : -6 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.88 }}
                        transition={{ duration: 0.15, ease: [0.34, 1.56, 0.64, 1] }}
                        onMouseDown={e => e.stopPropagation()}
                        onClick={e => e.stopPropagation()}
                        className={`
                          absolute z-50 min-w-[180px]
                          bg-neutral-900/95 backdrop-blur-xl
                          border border-white/10
                          rounded-2xl shadow-2xl shadow-black/60
                          overflow-hidden
                          ${isMine ? 'right-0' : 'left-0'}
                          ${menuAbove ? 'bottom-full mb-2' : 'top-full mt-2'}
                        `}
                      >
                        {!isMine && (
                          <div className="flex gap-0.5 px-2 py-2 border-b border-white/8">
                            {REACTIONS.map(emoji => (
                              <button
                                key={emoji}
                                onClick={() => sendReaction(msg.id, emoji)}
                                className="w-8 h-8 flex items-center justify-center rounded-xl
                                           text-lg hover:bg-white/10 active:scale-90
                                           transition-all duration-100"
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        )}

                        <button
                          onClick={() => {
                            setReplyingTo(msg);
                            setActiveMenuId(null);
                            setTimeout(() => inputRef.current?.focus(), 60);
                          }}
                          className="w-full flex items-center gap-3 px-4 py-3
                                     hover:bg-white/8 active:bg-white/12
                                     transition-colors text-left"
                        >
                          <div className="w-7 h-7 rounded-full bg-emerald-500/15
                                          flex items-center justify-center shrink-0">
                            <Reply className="w-3.5 h-3.5 text-emerald-400" />
                          </div>
                          <span className="text-xs font-semibold text-neutral-200 tracking-wide">
                            Reply
                          </span>
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            );
          })}
        </div>

        {/* Typing indicator */}
        <AnimatePresence>
          {isPartnerTyping && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              className="flex justify-start mt-3 ml-2"
            >
              <div className="px-4 py-3 bg-neutral-800 border border-white/5
                              rounded-2xl rounded-tl-md shadow-lg">
                <div className="flex gap-1 items-center">
                  {[0, 1, 2].map(i => (
                    <motion.span
                      key={i}
                      animate={{ y: [0, -4, 0] }}
                      transition={{ duration: 0.55, repeat: Infinity, delay: i * 0.13, ease: 'easeInOut' }}
                      className="block w-1.5 h-1.5 rounded-full bg-neutral-500"
                    />
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Input area */}
      <div className="shrink-0 border-t border-white/5"
           style={{ background: 'rgba(10,10,10,0.95)', backdropFilter: 'blur(20px)' }}>

        {/* Reply bar */}
        <AnimatePresence>
          {replyingTo && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="px-3 pt-2.5"
            >
              <div className="flex items-center gap-2.5
                              bg-white/5 border border-white/8 border-l-2 border-l-emerald-500
                              rounded-xl px-3 py-2">
                <div className="flex-1 min-w-0">
                  <div className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest mb-0.5">
                    {replyingTo.sender === currentUserId ? 'You' : 'Stranger'}
                  </div>
                  <div className="text-[11px] text-neutral-400 truncate">{replyingTo.text}</div>
                </div>
                <button
                  onClick={() => setReplyingTo(null)}
                  className="shrink-0 w-5 h-5 rounded-full bg-white/10 hover:bg-white/20
                             flex items-center justify-center transition-colors"
                >
                  <X className="w-2.5 h-2.5 text-neutral-400" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Input row */}
        <div className="flex items-end gap-2 px-3 py-2.5">
          <div className="flex-1 flex items-end gap-2
                          bg-white/6 border border-white/10
                          rounded-2xl px-3 py-2
                          focus-within:border-emerald-500/40
                          focus-within:bg-white/8
                          transition-all duration-200">
            <textarea
              ref={inputRef}
              value={inputText}
              onChange={handleInputChange}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey && window.innerWidth >= 640) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder="Message…"
              rows={1}
              style={{ maxHeight: '120px', minHeight: '22px' }}
              className="flex-1 bg-transparent text-white text-sm leading-relaxed
                         focus:outline-none placeholder:text-neutral-600
                         resize-none overflow-y-auto"
            />
            {isNearLimit && (
              <span className={`text-[9px] font-mono self-end mb-0.5 shrink-0
                               ${charsLeft <= 10 ? 'text-red-400' : 'text-yellow-500/80'}`}>
                {charsLeft}
              </span>
            )}
          </div>

          <button
            onMouseDown={e => e.preventDefault()}
            onClick={() => { sendMessage(); inputRef.current?.focus(); }}
            disabled={!inputText.trim()}
            className={`
              shrink-0 w-10 h-10 rounded-full flex items-center justify-center
              transition-all duration-150
              ${inputText.trim()
                ? 'bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-lg shadow-emerald-900/50 hover:from-emerald-400 hover:to-emerald-500 active:scale-95'
                : 'bg-white/6 border border-white/10 opacity-40 cursor-not-allowed'}
            `}
          >
            <Send className="w-4 h-4 text-white" strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </div>
  );
};