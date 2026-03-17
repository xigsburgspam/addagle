import React, { useEffect, useState } from 'react';
import { useFirebase } from '../FirebaseContext';
import { db, collection, onSnapshot, query, orderBy, doc, updateDoc, setDoc } from '../firebase';
import { Shield, UserX, MessageSquare, ExternalLink, Activity, Terminal, ShieldAlert, Users, Globe, Lock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';

interface Report {
  id: string;
  reporterId: string;
  reporterEmail?: string;
  reportedId: string;
  reportedEmail?: string;
  reason: string;
  timestamp: any;
  roomId?: string;
}

interface ActiveRoom {
  id: string;
  users: string[];
  peerIds: Record<string, string>;
}

export const AdminPanel: React.FC = () => {
  const { isAdmin } = useFirebase();
  const [reports, setReports] = useState<Report[]>([]);
  const [activeRooms, setActiveRooms] = useState<ActiveRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'reports' | 'rooms'>('reports');

  useEffect(() => {
    if (!isAdmin) return;

    const q = query(collection(db, 'reports'), orderBy('timestamp', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const reportsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Report));
      setReports(reportsData);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'reports');
    });

    const fetchRooms = async () => {
      try {
        const res = await fetch('/api/active-rooms');
        const data = await res.json();
        setActiveRooms(data);
      } catch (e) {
        console.error('Error fetching active rooms:', e);
      }
    };

    fetchRooms();
    const roomInterval = setInterval(fetchRooms, 5000);

    return () => {
      unsubscribe();
      clearInterval(roomInterval);
    };
  }, [isAdmin]);

  const blockUser = async (userId: string, email?: string) => {
    if (!confirm('Are you sure you want to block this user forever?')) return;
    try {
      await updateDoc(doc(db, 'users', userId), { isBlocked: true });
      if (email) {
        await setDoc(doc(db, 'blocked_emails', email), {
          blockedAt: new Date(),
          reason: 'Admin Blocked',
          uid: userId
        });
      }
      alert('User blocked successfully.');
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `users/${userId}`);
    }
  };

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-neutral-900 border border-neutral-800 rounded-[40px] p-12 text-center shadow-2xl">
          <div className="w-20 h-20 bg-red-500/10 rounded-3xl flex items-center justify-center mx-auto mb-8">
            <ShieldAlert className="w-10 h-10 text-red-500" />
          </div>
          <h1 className="text-3xl font-black tracking-tighter uppercase italic mb-4">Access Denied</h1>
          <p className="text-neutral-500 font-medium leading-relaxed mb-8">
            This terminal is restricted to ADDAgle Protocol Administrators. Unauthorized access is logged.
          </p>
          <button 
            onClick={() => window.location.href = '/'}
            className="w-full bg-white text-black font-black py-4 rounded-2xl hover:bg-emerald-500 hover:text-white transition-all duration-300 uppercase tracking-widest italic"
          >
            Return to Base
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white selection:bg-emerald-500/30 font-sans overflow-hidden flex flex-col">
      {/* Technical Sidebar / Header */}
      <header className="flex items-center justify-between px-10 py-6 border-b border-neutral-900 bg-neutral-950 z-30">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tighter italic uppercase leading-none">Mission Control</h1>
              <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-600 mt-1">ADDAgle Protocol v2.5</p>
            </div>
          </div>
          
          <div className="h-8 w-px bg-neutral-900 mx-2" />
          
          <div className="flex items-center gap-6">
            <div className="flex flex-col">
              <span className="text-[8px] font-black uppercase tracking-widest text-neutral-600">Active Nodes</span>
              <span className="text-lg font-mono text-emerald-500">{activeRooms.length.toString().padStart(2, '0')}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[8px] font-black uppercase tracking-widest text-neutral-600">Reports</span>
              <span className="text-lg font-mono text-red-500">{reports.length.toString().padStart(2, '0')}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-4 py-2 bg-neutral-900 rounded-xl border border-neutral-800">
            <Globe className="w-3 h-3 text-emerald-500" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Global Status: </span>
            <span className="text-[10px] font-mono text-emerald-500 uppercase">Operational</span>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 bg-neutral-900 rounded-xl border border-neutral-800">
            <Lock className="w-3 h-3 text-emerald-500" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Encryption: </span>
            <span className="text-[10px] font-mono text-emerald-500 uppercase">AES-256</span>
          </div>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {/* Navigation Sidebar */}
        <aside className="w-80 border-r border-neutral-900 bg-neutral-950 p-8 flex flex-col gap-4">
          <button 
            onClick={() => setActiveTab('reports')}
            className={`w-full flex items-center justify-between p-5 rounded-2xl transition-all duration-300 group ${
              activeTab === 'reports' ? 'bg-emerald-500 text-black shadow-2xl shadow-emerald-500/20' : 'bg-neutral-900 text-neutral-400 hover:bg-neutral-800'
            }`}
          >
            <div className="flex items-center gap-4">
              <MessageSquare className="w-5 h-5" />
              <span className="font-black uppercase tracking-tighter italic">Reports</span>
            </div>
            {reports.length > 0 && (
              <span className={`text-[10px] font-black px-2 py-1 rounded-lg ${
                activeTab === 'reports' ? 'bg-black text-emerald-500' : 'bg-red-500 text-white'
              }`}>
                {reports.length}
              </span>
            )}
          </button>

          <button 
            onClick={() => setActiveTab('rooms')}
            className={`w-full flex items-center justify-between p-5 rounded-2xl transition-all duration-300 group ${
              activeTab === 'rooms' ? 'bg-emerald-500 text-black shadow-2xl shadow-emerald-500/20' : 'bg-neutral-900 text-neutral-400 hover:bg-neutral-800'
            }`}
          >
            <div className="flex items-center gap-4">
              <Activity className="w-5 h-5" />
              <span className="font-black uppercase tracking-tighter italic">Live Nodes</span>
            </div>
            <span className={`text-[10px] font-black px-2 py-1 rounded-lg ${
              activeTab === 'rooms' ? 'bg-black text-emerald-500' : 'bg-neutral-800 text-neutral-400'
            }`}>
              {activeRooms.length}
            </span>
          </button>

          <div className="mt-auto p-6 bg-neutral-900/50 rounded-3xl border border-neutral-900">
            <div className="flex items-center gap-3 mb-4">
              <Terminal className="w-4 h-4 text-emerald-500" />
              <span className="text-[10px] font-black uppercase tracking-widest text-neutral-500 italic">System Log</span>
            </div>
            <div className="space-y-2">
              <p className="text-[8px] font-mono text-neutral-600 uppercase tracking-widest">07:56:27 - Protocol Initialized</p>
              <p className="text-[8px] font-mono text-neutral-600 uppercase tracking-widest">07:56:30 - Auth Handshake OK</p>
              <p className="text-[8px] font-mono text-emerald-500/50 uppercase tracking-widest animate-pulse">07:56:35 - Monitoring Active</p>
            </div>
          </div>
        </aside>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-12 bg-neutral-950 relative">
          {/* Background Grid */}
          <div className="absolute inset-0 opacity-[0.02] pointer-events-none" 
               style={{ backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

          <AnimatePresence mode="wait">
            {activeTab === 'reports' ? (
              <motion.div 
                key="reports"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="max-w-5xl mx-auto space-y-6"
              >
                <div className="flex items-center justify-between mb-12">
                  <h2 className="text-4xl font-black tracking-tighter uppercase italic">Security Reports</h2>
                  <span className="text-[10px] font-bold uppercase tracking-[0.4em] text-neutral-600">Real-time Feed</span>
                </div>

                {reports.map((report) => (
                  <div key={report.id} className="group bg-neutral-900/50 border border-neutral-900 rounded-[32px] p-8 hover:border-red-500/30 transition-all duration-500 backdrop-blur-xl">
                    <div className="flex items-start justify-between mb-8">
                      <div className="flex items-center gap-6">
                        <div className="w-14 h-14 bg-red-500/10 rounded-2xl flex items-center justify-center">
                          <ShieldAlert className="w-7 h-7 text-red-500" />
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-neutral-600 mb-1">Reported Entity</p>
                          <p className="text-xl font-mono text-emerald-500">{report.reportedEmail || report.reportedId}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => blockUser(report.reportedId, report.reportedEmail)}
                        className="flex items-center gap-3 bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest italic transition-all shadow-xl shadow-red-600/20"
                      >
                        <UserX className="w-4 h-4" />
                        Execute Block
                      </button>
                    </div>

                    <div className="bg-neutral-950 p-6 rounded-2xl border border-neutral-900 mb-6">
                      <p className="text-neutral-400 text-sm font-medium leading-relaxed italic">"{report.reason}"</p>
                    </div>

                    <div className="flex items-center justify-between pt-6 border-t border-neutral-900">
                      <div className="flex gap-8">
                        <div>
                          <p className="text-[8px] font-black uppercase tracking-widest text-neutral-600 mb-1">Reporter</p>
                          <p className="text-[10px] font-mono text-neutral-400">{report.reporterEmail || report.reporterId}</p>
                        </div>
                        <div>
                          <p className="text-[8px] font-black uppercase tracking-widest text-neutral-600 mb-1">Timestamp</p>
                          <p className="text-[10px] font-mono text-neutral-400">{new Date(report.timestamp?.toDate()).toLocaleString()}</p>
                        </div>
                      </div>
                      {report.roomId && (
                        <button 
                          onClick={() => window.location.href = `/?adminRoom=${report.roomId}`}
                          className="flex items-center gap-2 text-emerald-500 hover:text-emerald-400 transition-colors text-[10px] font-black uppercase tracking-widest italic"
                        >
                          Trace Room <ExternalLink className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                {reports.length === 0 && (
                  <div className="py-40 text-center">
                    <Shield className="w-20 h-20 text-neutral-900 mx-auto mb-8" />
                    <p className="text-neutral-700 font-black uppercase tracking-[0.4em]">No Security Violations Logged</p>
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div 
                key="rooms"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="max-w-5xl mx-auto space-y-6"
              >
                <div className="flex items-center justify-between mb-12">
                  <h2 className="text-4xl font-black tracking-tighter uppercase italic">Active Nodes</h2>
                  <span className="text-[10px] font-bold uppercase tracking-[0.4em] text-neutral-600">Live Surveillance</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {activeRooms.map((room) => (
                    <div key={room.id} className="group bg-neutral-900/50 border border-neutral-900 rounded-[32px] p-8 hover:border-emerald-500/30 transition-all duration-500 backdrop-blur-xl">
                      <div className="flex items-center justify-between mb-8">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center">
                            <Activity className="w-6 h-6 text-emerald-500" />
                          </div>
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-neutral-600 mb-1">Node ID</p>
                            <p className="text-lg font-mono text-white">{room.id.split('_').pop()}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 px-3 py-1 bg-neutral-950 rounded-lg border border-neutral-900">
                          <Users className="w-3 h-3 text-emerald-500" />
                          <span className="text-[10px] font-mono text-emerald-500">{room.users.length}</span>
                        </div>
                      </div>

                      <div className="space-y-3 mb-8">
                        {room.users.map((userId, idx) => (
                          <div key={userId} className="flex items-center justify-between text-[10px] font-mono text-neutral-500">
                            <span>User {idx + 1}</span>
                            <span className="text-neutral-700">{userId.slice(0, 12)}...</span>
                          </div>
                        ))}
                      </div>

                      <button
                        onClick={() => window.location.href = `/?adminRoom=${room.id}`}
                        className="w-full bg-white text-black hover:bg-emerald-500 hover:text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest italic transition-all duration-300 flex items-center justify-center gap-3"
                      >
                        <ExternalLink className="w-4 h-4" />
                        Join Surveillance
                      </button>
                    </div>
                  ))}
                </div>

                {activeRooms.length === 0 && (
                  <div className="py-40 text-center">
                    <Activity className="w-20 h-20 text-neutral-900 mx-auto mb-8" />
                    <p className="text-neutral-700 font-black uppercase tracking-[0.4em]">No Active Nodes Detected</p>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
};
