import React, { useState, useEffect, useRef } from 'react';
import { Send, Terminal, Cpu } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useLanguage } from '../LanguageContext';

interface Message {
  id: string;
  sender: string;
  text: string;
  timestamp: number;
}

interface ChatProps {
  socket: any;
  roomId: string;
  currentUserId: string;
}

export const Chat: React.FC<ChatProps> = ({ socket, roomId, currentUserId }) => {
  const { t } = useLanguage();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!socket) return;

    const handleMessage = (message: Message) => {
      setMessages(prev => [...prev, message]);
    };

    socket.on('chat-message', handleMessage);

    return () => {
      socket.off('chat-message', handleMessage);
    };
  }, [socket]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !socket) return;

    // Word limit check
    const words = inputText.trim().split(/\s+/);
    if (words.length > 100) {
      alert(t.chatLimit);
      return;
    }

    const newMessage: Message = {
      id: Math.random().toString(36).substr(2, 9),
      sender: currentUserId,
      text: inputText.trim(),
      timestamp: Date.now(),
    };

    socket.emit('send-chat-message', { roomId, message: newMessage });
    setMessages(prev => [...prev, newMessage]);
    setInputText('');
  };

  return (
    <div className="flex flex-col h-full bg-neutral-950/50 backdrop-blur-xl border-l border-neutral-900 w-full overflow-hidden">
      {/* Messages Area */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6 scrollbar-thin scrollbar-thumb-neutral-800"
      >
        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <motion.div 
              key={msg.id}
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className={`flex flex-col ${msg.sender === currentUserId ? 'items-end' : 'items-start'}`}
            >
              <div className="flex items-center gap-2 mb-1 px-1">
                <span className="text-[6px] sm:text-[8px] font-black uppercase tracking-[0.3em] text-neutral-600 italic">
                  {msg.sender === currentUserId ? 'Local Node' : 'Remote Node'}
                </span>
                <span className="text-[6px] sm:text-[8px] font-mono text-neutral-700">
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              </div>
              
              <div className={`max-w-[90%] px-3 sm:px-4 py-2 sm:py-3 rounded-xl sm:rounded-2xl text-xs sm:text-sm font-medium leading-relaxed border ${
                msg.sender === currentUserId 
                  ? 'bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 text-emerald-400 border-emerald-500/20 rounded-tr-none' 
                  : 'bg-gradient-to-br from-neutral-900/80 to-neutral-900/40 text-neutral-300 border-neutral-800 rounded-tl-none'
              }`}>
                {msg.text}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-neutral-700 opacity-30 p-4 text-center">
            <Cpu className="w-8 h-8 sm:w-12 sm:h-12 mb-4" />
            <p className="text-[8px] sm:text-[10px] font-black uppercase tracking-[0.4em]">Secure Channel Established</p>
          </div>
        )}
      </div>

      {/* Input Area */}
      <form onSubmit={sendMessage} className="p-4 sm:p-6 bg-neutral-950 border-t border-neutral-900">
        <div className="relative group">
          <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500/20 to-transparent rounded-xl sm:rounded-2xl blur opacity-0 group-focus-within:opacity-100 transition-opacity" />
          <div className="relative flex items-center gap-2 sm:gap-3 bg-neutral-900 border border-neutral-800 rounded-xl sm:rounded-2xl p-1.5 sm:p-2 focus-within:border-emerald-500/50 transition-colors">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Transmit..."
              className="flex-1 bg-transparent text-white px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium focus:outline-none placeholder:text-neutral-700"
            />
            <button
              type="submit"
              disabled={!inputText.trim()}
              className="p-2 sm:p-3 bg-gradient-to-r from-emerald-500 to-emerald-600 text-black rounded-lg sm:rounded-xl hover:from-emerald-400 hover:to-emerald-500 disabled:opacity-20 disabled:hover:bg-emerald-500 transition-all shadow-lg shadow-emerald-500/10"
            >
              <Send className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
          </div>
        </div>
        <div className="mt-3 sm:mt-4 flex items-center justify-between px-1 sm:px-2">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <div className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[6px] sm:text-[8px] font-black uppercase tracking-[0.3em] text-neutral-600 italic">Encryption Active</span>
          </div>
          <span className="text-[6px] sm:text-[8px] font-mono text-neutral-800 uppercase">Buffer: 0.0kb</span>
        </div>
      </form>
    </div>
  );
};
