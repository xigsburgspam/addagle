import React, { useState, useEffect, useRef } from 'react';
import { Send, Reply, X, Check, CheckCheck } from 'lucide-react';
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
  const [reactionPickerFor, setReactionPickerFor] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isPartnerTyping]);

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
    if (socket) {
      socket.emit('typing-start', { roomId });
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        socket.emit('typing-stop', { roomId });
      }, 2000);
    }
  };

  const sendMessage = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
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
      replyTo: replyingTo ? { id: replyingTo.id, text: replyingTo.text, sender: replyingTo.sender } : null,
      reaction: null,
    };

    socket.emit('send-chat-message', { roomId, message: newMessage });
    socket.emit('message-delivered', { roomId, messageId: newMessage.id });
    setMessages(prev => [...prev, newMessage]);
    setInputText('');
    setReplyingTo(null);
    if (inputRef.current) inputRef.current.style.height = 'auto';
  };

  const sendReaction = (messageId: string, emoji: string) => {
    socket.emit('message-reaction', { roomId, messageId, emoji });
    setMessages(prev => prev.map(m => m.id === messageId ? { ...m, reaction: emoji } : m));
    setReactionPickerFor(null);
  };

  const StatusIcon = ({ status }: { status: MessageStatus }) => {
    if (status === 'sending') return <Check className="w-3 h-3 text-neutral-600" />;
    if (status === 'delivered') return <CheckCheck className="w-3 h-3 text-neutral-400" />;
    return <CheckCheck className="w-3 h-3 text-emerald-400" />;
  };

  const charsLeft = CHAR_LIMIT - inputText.length;
  const isNearLimit = charsLeft <= 30;

  return (
    <div
      className="flex flex-col h-full bg-neutral-950/50 backdrop-blur-xl w-full overflow-hidden"
      onClick={() => setReactionPickerFor(null)}
    >
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2 scrollbar-thin scrollbar-thumb-neutral-800">
        <AnimatePresence initial={false}>
          {messages.map((msg) => {
            const isMine = msg.sender === currentUserId;
            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 8, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.15 }}
                className={`flex flex-col ${isMine ? 'items-end' : 'items-start'} group`}
              >
                {/* Reply preview above bubble */}
                {msg.replyTo && (
                  <div className="mb-0.5 max-w-[85%] px-3 py-1.5 rounded-xl text-[10px] border-l-2 border-emerald-500 bg-neutral-800/60 text-neutral-400 truncate">
                    <span className="font-bold text-emerald-400 mr-1">
                      {msg.replyTo.sender === currentUserId ? 'You' : 'Stranger'}:
                    </span>
                    {msg.replyTo.text}
                  </div>
                )}

                <div className="relative flex items-end gap-1.5">
                  {/* Left action buttons (for partner messages) */}
                  {!isMine && (
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity mb-1 order-first">
                      <button
                        onClick={(e) => { e.stopPropagation(); setReactionPickerFor(reactionPickerFor === msg.id ? null : msg.id); }}
                        className="p-1 bg-neutral-800 hover:bg-neutral-700 rounded-full text-xs leading-none"
                      >😊</button>
                      <button
                        onClick={() => { setReplyingTo(msg); inputRef.current?.focus(); }}
                        className="p-1 bg-neutral-800 hover:bg-neutral-700 rounded-full"
                      ><Reply className="w-3 h-3 text-neutral-400" /></button>
                    </div>
                  )}

                  {/* Message bubble */}
                  <div className={`relative max-w-[82%] px-3 sm:px-4 py-2 sm:py-2.5 rounded-2xl text-xs sm:text-sm font-medium leading-relaxed break-words ${
                    isMine
                      ? 'bg-emerald-600 text-white rounded-br-sm'
                      : 'bg-neutral-800 text-neutral-100 rounded-bl-sm'
                  }`}>
                    {msg.text}
                    <div className={`flex items-center gap-1 mt-0.5 ${isMine ? 'justify-end' : 'justify-start'}`}>
                      <span className="text-[9px] opacity-50">
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {isMine && <StatusIcon status={msg.status} />}
                    </div>
                    {msg.reaction && (
                      <span className="absolute -bottom-3.5 right-1 text-sm bg-neutral-900 border border-neutral-700 rounded-full px-1 py-0.5 shadow leading-none">
                        {msg.reaction}
                      </span>
                    )}
                  </div>

                  {/* Right action buttons (for own messages) */}
                  {isMine && (
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity mb-1">
                      <button
                        onClick={() => { setReplyingTo(msg); inputRef.current?.focus(); }}
                        className="p-1 bg-neutral-800 hover:bg-neutral-700 rounded-full"
                      ><Reply className="w-3 h-3 text-neutral-400" /></button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setReactionPickerFor(reactionPickerFor === msg.id ? null : msg.id); }}
                        className="p-1 bg-neutral-800 hover:bg-neutral-700 rounded-full text-xs leading-none"
                      >😊</button>
                    </div>
                  )}
                </div>

                {/* Reaction picker */}
                <AnimatePresence>
                  {reactionPickerFor === msg.id && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.8, y: 4 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      onClick={e => e.stopPropagation()}
                      className="flex gap-1.5 mt-1.5 bg-neutral-800 border border-neutral-700 rounded-full px-3 py-1.5 shadow-xl z-50"
                    >
                      {REACTIONS.map(emoji => (
                        <button key={emoji} onClick={() => sendReaction(msg.id, emoji)}
                          className="text-base hover:scale-125 transition-transform">{emoji}</button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-neutral-700 opacity-30 p-4 text-center pt-16">
            <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.4em]">Secure Channel Established</p>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-3 sm:p-4 bg-neutral-950 border-t border-neutral-900 shrink-0">
        {/* Typing indicator */}
        {isPartnerTyping && (
          <div className="flex items-center gap-2 mb-2 px-1">
            <div className="flex gap-0.5">
              {[0, 1, 2].map(i => (
                <motion.div key={i}
                  animate={{ y: [0, -3, 0] }}
                  transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
                  className="w-1.5 h-1.5 bg-emerald-500 rounded-full"
                />
              ))}
            </div>
            <span className="text-[9px] text-neutral-500 font-medium">Stranger is typing…</span>
          </div>
        )}

        {/* Reply bar */}
        <AnimatePresence>
          {replyingTo && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="flex items-center justify-between bg-neutral-800/60 border-l-2 border-emerald-500 rounded-lg px-3 py-1.5 mb-2 text-[10px]"
            >
              <div className="overflow-hidden mr-2">
                <span className="font-bold text-emerald-400 mr-1">
                  {replyingTo.sender === currentUserId ? 'You' : 'Stranger'}:
                </span>
                <span className="text-neutral-400 truncate">{replyingTo.text}</span>
              </div>
              <button onClick={() => setReplyingTo(null)} className="text-neutral-500 hover:text-white shrink-0">
                <X className="w-3 h-3" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-500/20 to-transparent rounded-xl blur opacity-0 group-focus-within:opacity-100 transition-opacity" />
          <div className="relative flex items-end gap-2 bg-neutral-900 border border-neutral-800 rounded-xl p-1.5 focus-within:border-emerald-500/50 transition-colors">
            <textarea
              ref={inputRef}
              value={inputText}
              onChange={(e) => {
                handleInputChange(e);
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px';
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                  if (e.currentTarget) e.currentTarget.style.height = 'auto';
                }
              }}
              placeholder="Message…"
              className="flex-1 bg-transparent text-white px-3 py-1.5 text-xs sm:text-sm font-medium focus:outline-none placeholder:text-neutral-600 resize-none overflow-y-auto"
              rows={1}
              style={{ maxHeight: '100px' }}
            />
            <button
              onClick={() => sendMessage()}
              disabled={!inputText.trim()}
              className="p-2 sm:p-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 disabled:opacity-20 transition-all self-end"
            >
              <Send className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
          </div>
        </div>

        <div className="mt-1 flex justify-end px-1">
          <span className={`text-[9px] font-mono ${isNearLimit ? (charsLeft <= 10 ? 'text-red-400' : 'text-yellow-500') : 'text-neutral-700'}`}>
            {charsLeft}/{CHAR_LIMIT}
          </span>
        </div>
      </div>
    </div>
  );
};