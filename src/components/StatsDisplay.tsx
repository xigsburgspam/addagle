import React, { useState, useEffect } from 'react';
import { db, doc, onSnapshot } from '../firebase';
import { Users, Video, MessageCircle } from 'lucide-react';

export const StatsDisplay: React.FC = () => {
  const [stats, setStats] = useState({
    onlineUsers: 0,
    videoChatting: 0,
    textChatting: 0,
  });

  useEffect(() => {
    const unsubStats = onSnapshot(doc(db, 'stats', 'global'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setStats({
          onlineUsers: data.onlineUsers || 0,
          videoChatting: data.videoChatting || 0,
          textChatting: data.textChatting || 0,
        });
      }
    });

    return () => unsubStats();
  }, []);

  return (
    <div className="flex gap-4">
      <div className="flex items-center gap-1.5 text-emerald-500">
        <Users className="w-3 h-3" />
        <span className="text-[10px] font-black tabular-nums">{stats.onlineUsers}</span>
      </div>
      <div className="flex items-center gap-1.5 text-emerald-500">
        <Video className="w-3 h-3" />
        <span className="text-[10px] font-black tabular-nums">{stats.videoChatting}</span>
      </div>
      <div className="flex items-center gap-1.5 text-emerald-500">
        <MessageCircle className="w-3 h-3" />
        <span className="text-[10px] font-black tabular-nums">{stats.textChatting}</span>
      </div>
    </div>
  );
};
