import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Reply, X, Check, CheckCheck, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const CHAR_LIMIT = 200;
const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

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

export const Chat: React.FC<ChatProps> = ({ socket, roomId, currentUserId, onNewMessage }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isPartnerTyping, setIsPartnerTyping] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isPartnerTyping]);

  // Close menu on outside click
  useEffect(() => {
    const handleClick = () => setActiveMenuId(null);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  useEffect(() => {
    if (!socket) return;

    const handleMessage = (message: Message) => {
      setMessages(prev => [...prev, { ...message, status: 'delivered' }]);
      socket.emit('message-seen', { roomId, messageId: message.id });
      if (onNewMessage) onNewMessage();
    };
    const handleTypingStart = () => setIsPartnerTyping(true);
    const handleTypingStop = () => setIsPartnerTyping(false);
    const handleDelivered = ({ messageId }: { messageId: string }) => {
      setMessages(prev => prev.map(m =>
        m.id === messageId && m.status === 'sending' ? { ...m, status: 'delivered' } : m
      ));
    };
    const handleSeen = ({ messageId }: { messageId: string }) => {
      setMessages(prev => prev.map(m =>
        m.id === messageId ? { ...m, status: 'seen' } : m
      ));
    };
    const handleReaction = ({ messageId, emoji }: { messageId: string; emoji: string }) => {
      setMessages(prev => prev.map(m =>
        m.id === messageId ? { ...m, reaction: emoji } : m
      ));
    };

    socket.on('chat-message', handleMessage);
    socket.on('typing-start', handleTypingStart);
    socket.on('typing-stop', handleTypingStop);
    socket.on('message-delivered', handleDelivered);
    socket.on('message-seen', handleSeen);
    socket.on('message-reaction', handleReaction);

    return () => {
      socket.off('chat-message', handleMessage);
      socket.off('typing-start', handleTypingStart);
      socket.off('typing-stop', handleTypingStop);
      socket.off('message-delivered', handleDelivered);
      socket.off('message-seen', handleSeen);
      socket.off('message-reaction', handleReaction);
    };
  }, [socket, roomId]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    if (val.length > CHAR_LIMIT) return;
    setInputText(val);
    // auto-resize
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
    if (socket) {
      socket.emit('typing-start', { roomId });
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        socket.emit('typing-stop', { roomId });
      }, 2000);
    }
  };

  const sendMessage = useCallback(() => {
    const trimmed = inputText.trim();
    if (!trimmed || !socket || trimmed.length > CHAR_LIMIT) return;

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    socket.emit('typing-stop', { roomId });

    const newMessage: Message = {
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

    socket.emit('send-chat-message', { roomId, message: newMessage });
    socket.emit('message-delivered', { roomId, messageId: newMessage.id });
    setMessages(prev => [...prev, newMessage]);
    setInputText('');
    setReplyingTo(null);

    // Reset textarea height and keep focus — keyboard stays open
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

  // Long press handler for mobile
  const handleTouchStart = (msgId: string) => {
    longPressTimerRef.current = setTimeout(() => {
      setActiveMenuId(msgId);
    }, 400);
  };
  const handleTouchEnd = () => {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
  };

  // Status indicator
  const StatusDot = ({ status }: { status: MessageStatus }) => {
    if (status === 'sending') {
      return <Clock className="w-2.5 h-2.5 text-white/40" />;
    }
    if (status === 'delivered') {
      return <CheckCheck className="w-3 h-3 text-white/50" />;
    }
    // seen
    return <CheckCheck className="w-3 h-3 text-emerald-300" />;
  };

  const charsLeft = CHAR_LIMIT - inputText.length;
  const isNearLimit = charsLeft <= 30;

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-neutral-950">

      {/* ── Messages ─────────────────────────────────── */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-3 space-y-1"
        style={{ WebkitOverflowScrolling: 'touch' }}
        onClick={() => setActiveMenuId(null)}
      >
        <AnimatePresence initial={false}>
          {messages.map((msg) => {
            const isMine = msg.sender === currentUserId;
            const isMenuOpen = activeMenuId === msg.id;

            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.12 }}
                className={`flex w-full ${isMine ? 'justify-end' : 'justify-start'}`}
              >
                {/* Outer wrapper — limits width, adds padding for reaction badge */}
                <div
                  className={`relative max-w-[78%] sm:max-w-[70%] mb-1 ${msg.reaction ? 'mb-4' : ''}`}
                  onTouchStart={() => handleTouchStart(msg.id)}
                  onTouchEnd={handleTouchEnd}
                  onTouchMove={handleTouchEnd}
                >
                  {/* Reply preview */}
                  {msg.replyTo && (
                    <div className={`flex mb-0.5 ${isMine ? 'justify-end' : 'justify-start'}`}>
                      <div className={`
                        max-w-full px-2.5 py-1.5 rounded-xl text-[10px] leading-tight
                        border-l-2 border-emerald-500
                        ${isMine ? 'bg-emerald-900/40 text-emerald-200/70' : 'bg-neutral-800/70 text-neutral-400'}
                      `}>
                        <div className="font-semibold text-emerald-400 mb-0.5 text-[9px] uppercase tracking-wide">
                          {msg.replyTo.sender === currentUserId ? 'You' : 'Stranger'}
                        </div>
                        <div className="truncate max-w-[180px]">{msg.replyTo.text}</div>
                      </div>
                    </div>
                  )}

                  {/* Bubble row */}
                  <div className={`flex items-end gap-1.5 ${isMine ? 'flex-row-reverse' : 'flex-row'}`}>

                    {/* Action buttons — desktop only, shown on hover */}
                    <div className="hidden sm:flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mb-0.5">
                      {/* Only partner messages get react button */}
                      {!isMine && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveMenuId(isMenuOpen ? null : msg.id);
                          }}
                          className="p-1 bg-neutral-800 hover:bg-neutral-700 rounded-full text-[11px] leading-none transition-colors"
                          title="React"
                        >😊</button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setReplyingTo(msg);
                          inputRef.current?.focus();
                        }}
                        className="p-1 bg-neutral-800 hover:bg-neutral-700 rounded-full transition-colors"
                        title="Reply"
                      >
                        <Reply className="w-3 h-3 text-neutral-400" />
                      </button>
                    </div>

                    {/* The bubble itself */}
                    <div
                      className={`
                        relative px-3 py-2 text-sm leading-relaxed break-words
                        ${isMine
                          ? 'bg-emerald-600 text-white rounded-2xl rounded-br-md'
                          : 'bg-neutral-800 text-neutral-100 rounded-2xl rounded-bl-md'
                        }
                        group cursor-pointer select-none
                      `}
                      onClick={(e) => {
                        e.stopPropagation();
                        // On mobile, tap opens menu
                        if (window.innerWidth < 640) {
                          setActiveMenuId(isMenuOpen ? null : msg.id);
                        }
                      }}
                    >
                      {msg.text}

                      {/* Time + status row — inside bubble */}
                      <div className={`flex items-center gap-1 mt-1 ${isMine ? 'justify-end' : 'justify-start'}`}>
                        <span className={`text-[9px] ${isMine ? 'text-white/50' : 'text-neutral-500'}`}>
                          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {isMine && <StatusDot status={msg.status} />}
                      </div>

                      {/* Reaction badge */}
                      {msg.reaction && (
                        <div className={`
                          absolute -bottom-4 text-base leading-none
                          bg-neutral-900 border border-neutral-700 rounded-full px-1.5 py-0.5 shadow-lg
                          ${isMine ? '-left-1' : '-right-1'}
                        `}>
                          {msg.reaction}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Context menu */}
                  <AnimatePresence>
                    {isMenuOpen && (
                      <motion.div
                        ref={menuRef}
                        initial={{ opacity: 0, scale: 0.85, y: -4 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.85, y: -4 }}
                        transition={{ duration: 0.12 }}
                        onClick={e => e.stopPropagation()}
                        className={`
                          absolute z-50 bg-neutral-800 border border-neutral-700 rounded-2xl shadow-2xl p-2
                          min-w-[160px]
                          ${isMine ? 'right-0' : 'left-0'}
                          bottom-full mb-2
                        `}
                      >
                        {/* Reaction row — only for partner's messages */}
                        {!isMine && (
                          <div className="flex gap-1 px-1 pb-2 mb-2 border-b border-neutral-700">
                            {REACTIONS.map(emoji => (
                              <button
                                key={emoji}
                                onClick={() => sendReaction(msg.id, emoji)}
                                className="text-lg hover:scale-125 active:scale-110 transition-transform p-0.5"
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        )}

                        {/* Reply option — available for all messages */}
                        <button
                          onClick={() => {
                            setReplyingTo(msg);
                            setActiveMenuId(null);
                            setTimeout(() => inputRef.current?.focus(), 50);
                          }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-neutral-700 active:bg-neutral-600 transition-colors text-left"
                        >
                          <Reply className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span className="text-xs font-semibold text-neutral-200">Reply</span>
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* Empty state */}
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full py-12 text-center">
            <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-3">
              <span className="text-lg">🔒</span>
            </div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-600">End-to-end encrypted</p>
            <p className="text-[9px] text-neutral-700 mt-1">Messages disappear when session ends</p>
          </div>
        )}
      </div>

      {/* ── Input area ───────────────────────────────── */}
      <div className="shrink-0 bg-neutral-950 border-t border-neutral-900">

        {/* Typing indicator */}
        <AnimatePresence>
          {isPartnerTyping && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="flex items-center gap-2 px-4 pt-2"
            >
              <div className="flex gap-0.5 items-center">
                {[0, 1, 2].map(i => (
                  <motion.span
                    key={i}
                    animate={{ y: [0, -3, 0] }}
                    transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.12, ease: 'easeInOut' }}
                    className="block w-1 h-1 rounded-full bg-emerald-500"
                  />
                ))}
              </div>
              <span className="text-[10px] text-neutral-500">Stranger is typing</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Reply preview bar */}
        <AnimatePresence>
          {replyingTo && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="flex items-center gap-2 px-3 pt-2"
            >
              <div className="flex-1 flex items-center gap-2 bg-neutral-800/60 border border-neutral-700/50 border-l-2 border-l-emerald-500 rounded-xl px-3 py-2 min-w-0">
                <div className="flex-1 min-w-0">
                  <div className="text-[9px] font-bold text-emerald-400 uppercase tracking-wide mb-0.5">
                    {replyingTo.sender === currentUserId ? 'You' : 'Stranger'}
                  </div>
                  <div className="text-[11px] text-neutral-400 truncate">{replyingTo.text}</div>
                </div>
                <button
                  onClick={() => setReplyingTo(null)}
                  className="shrink-0 p-1 rounded-full hover:bg-neutral-700 text-neutral-500 hover:text-white transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Input row */}
        <div className="flex items-end gap-2 px-3 py-2.5">
          <div className="flex-1 flex items-end bg-neutral-900 border border-neutral-800 rounded-2xl px-3 py-2 gap-2 focus-within:border-emerald-500/40 transition-colors">
            <textarea
              ref={inputRef}
              value={inputText}
              onChange={handleInputChange}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && window.innerWidth >= 640) {
                  // Desktop: Enter sends
                  e.preventDefault();
                  sendMessage();
                }
                // Mobile: Enter adds newline, send is via button
              }}
              placeholder="Message…"
              rows={1}
              style={{ maxHeight: '120px', minHeight: '20px' }}
              className="flex-1 bg-transparent text-white text-sm leading-relaxed focus:outline-none placeholder:text-neutral-600 resize-none overflow-y-auto"
            />
            {/* Char counter — only near limit */}
            {isNearLimit && (
              <span className={`text-[9px] font-mono self-end mb-0.5 shrink-0 ${charsLeft <= 10 ? 'text-red-400' : 'text-yellow-500'}`}>
                {charsLeft}
              </span>
            )}
          </div>

          {/* Send button */}
          <button
            onMouseDown={(e) => {
              // Prevent blur on desktop
              e.preventDefault();
            }}
            onClick={() => {
              sendMessage();
              inputRef.current?.focus();
            }}
            disabled={!inputText.trim()}
            className={`
              shrink-0 w-9 h-9 rounded-full flex items-center justify-center
              transition-all duration-150
              ${inputText.trim()
                ? 'bg-emerald-500 hover:bg-emerald-400 active:scale-95 shadow-lg shadow-emerald-500/20'
                : 'bg-neutral-800 opacity-40 cursor-not-allowed'
              }
            `}
          >
            <Send className="w-4 h-4 text-white" strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </div>
  );
};