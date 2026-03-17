import React, { useState, useEffect } from 'react';
import { Users, Activity } from 'lucide-react';
import { useLanguage } from '../LanguageContext';

interface StatsDisplayProps {
  mode?: 'video' | 'text';
}

export const StatsDisplay: React.FC<StatsDisplayProps> = ({ mode }) => {
  const { t } = useLanguage();
  const [stats, setStats] = useState({
    onlineUsers: 0,
    videoChatting: 0,
    textChatting: 0,
  });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/stats');
        if (res.ok) {
          const data = await res.json();
          setStats({
            onlineUsers: data.onlineUsers || 0,
            videoChatting: data.videoChatting || 0,
            textChatting: data.textChatting || 0,
          });
        }
      } catch (e) {
        console.error('Failed to fetch stats:', e);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 5000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center gap-2 sm:gap-4">
      <div className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 bg-neutral-900 rounded-lg border border-neutral-800">
        <Activity className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-emerald-500" />
        <span className="text-[8px] sm:text-[10px] font-bold uppercase tracking-widest text-neutral-400">Live</span>
        <span className="text-[8px] sm:text-[10px] font-mono text-emerald-500">{stats.onlineUsers.toString().padStart(4, '0')}</span>
      </div>
      {mode && (
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-neutral-900 rounded-lg border border-neutral-800">
          <Users className="w-3 h-3 text-emerald-500 animate-pulse" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">{mode === 'video' ? t.videoChatting : t.textChatting}</span>
          <span className="text-[10px] font-mono text-emerald-500">{mode === 'video' ? stats.videoChatting : stats.textChatting}</span>
        </div>
      )}
    </div>
  );
};
