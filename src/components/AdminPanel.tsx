import React, { useEffect, useState } from 'react';
import { useFirebase } from '../FirebaseContext';
import { useLanguage } from '../LanguageContext';
import { db, collection, onSnapshot, query, orderBy, doc, updateDoc, setDoc, deleteDoc, Timestamp } from '../firebase';
import { Shield, UserX, MessageSquare, ExternalLink, Activity, Terminal, ShieldAlert, Users, Globe, Lock, Video } from 'lucide-react';
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

interface BlockedEmail {
  id: string;
  blockedAt: any;
  reason: string;
  uid?: string;
}

export const AdminPanel: React.FC = () => {
  const { isAdmin } = useFirebase();
  const { t } = useLanguage();
  const [reports, setReports] = useState<Report[]>([]);
  const [blockedEmails, setBlockedEmails] = useState<BlockedEmail[]>([]);
  const [activeRooms, setActiveRooms] = useState<ActiveRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'reports' | 'blocked'>('reports');

  useEffect(() => {
    if (!isAdmin) return;

    const q = query(collection(db, 'reports'));
    const unsubscribeReports = onSnapshot(q, (snapshot) => {
      const reportsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Report));
      // Sort in memory instead of query to avoid issues with missing fields
      reportsData.sort((a, b) => (b.timestamp?.toMillis?.() || 0) - (a.timestamp?.toMillis?.() || 0));
      setReports(reportsData);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'reports');
    });

    const qBlocked = query(collection(db, 'blocked_emails'));
    const unsubscribeBlocked = onSnapshot(qBlocked, (snapshot) => {
      const blockedData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as BlockedEmail));
      // Sort in memory
      blockedData.sort((a, b) => (b.blockedAt?.toMillis?.() || 0) - (a.blockedAt?.toMillis?.() || 0));
      setBlockedEmails(blockedData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'blocked_emails');
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
      unsubscribeReports();
      unsubscribeBlocked();
      clearInterval(roomInterval);
    };
  }, [isAdmin]);

  const deleteReport = async (reportId: string) => {
    if (!confirm('Are you sure you want to delete this report?')) return;
    try {
      await deleteDoc(doc(db, 'reports', reportId));
      alert('Report dismissed successfully.');
    } catch (e) {
      console.error('Delete report error:', e);
      alert('Failed to delete report. Check console for details.');
      handleFirestoreError(e, OperationType.DELETE, `reports/${reportId}`);
    }
  };

  const unblockEmail = async (email: string, userId?: string) => {
    if (!confirm(`Are you sure you want to unblock ${email}?`)) return;
    try {
      await deleteDoc(doc(db, 'blocked_emails', email));
      if (userId) {
        await updateDoc(doc(db, 'users', userId), { isBlocked: false });
      }
      alert('Email unblocked successfully.');
    } catch (e) {
      console.error('Unblock error:', e);
      alert('Failed to unblock. Check console for details.');
      handleFirestoreError(e, OperationType.DELETE, `blocked_emails/${email}`);
    }
  };

  const blockUser = async (userId: string, email?: string) => {
    if (!confirm('Are you sure you want to block this user forever?')) return;
    try {
      await updateDoc(doc(db, 'users', userId), { isBlocked: true });
      
      // Always create a blocked email entry if email is available
      // If not available, we still blocked the UID, but it won't show in the "Blocked Emails" list
      // which is primarily for email-based blocking.
      if (email) {
        await setDoc(doc(db, 'blocked_emails', email), {
          blockedAt: Timestamp.now(),
          reason: 'Admin Blocked',
          uid: userId
        });
      } else {
        // Create a placeholder entry for UID-only blocks so they show up in the list
        await setDoc(doc(db, 'blocked_emails', `uid:${userId}`), {
          blockedAt: Timestamp.now(),
          reason: 'Admin Blocked (UID)',
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
          <h1 className="text-3xl font-black tracking-tighter uppercase  mb-4">Access Denied</h1>
          <p className="text-neutral-500 font-medium leading-relaxed mb-8">
            This terminal is restricted to Gupto Protocol Administrators. Unauthorized access is logged.
          </p>
          <button 
            onClick={() => window.location.href = '/'}
            className="w-full bg-white text-black font-black py-4 rounded-2xl hover:bg-emerald-500 hover:text-white transition-all duration-300 uppercase tracking-widest "
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
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-widest uppercase leading-none font-brand bg-gradient-to-r from-emerald-500 to-emerald-400 bg-clip-text text-transparent">{t.appName} Control</h1>
              <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-600 mt-1">Gupto Protocol v2.5</p>
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
            className={`p-5 rounded-2xl transition-all duration-300 flex items-center justify-between ${
              activeTab === 'reports' 
                ? 'bg-emerald-500 text-black shadow-2xl shadow-emerald-500/20' 
                : 'bg-neutral-900 text-neutral-400 hover:bg-neutral-800'
            }`}
          >
            <div className="flex items-center gap-4">
              <MessageSquare className="w-5 h-5" />
              <span className="font-black uppercase tracking-tighter ">Reports</span>
            </div>
            {reports.length > 0 && (
              <span className={`text-[10px] font-black px-2 py-1 rounded-lg ${
                activeTab === 'reports' ? 'bg-black text-emerald-500' : 'bg-neutral-800 text-neutral-500'
              }`}>
                {reports.length}
              </span>
            )}
          </button>

          <button 
            onClick={() => setActiveTab('blocked')}
            className={`p-5 rounded-2xl transition-all duration-300 flex items-center justify-between ${
              activeTab === 'blocked' 
                ? 'bg-emerald-500 text-black shadow-2xl shadow-emerald-500/20' 
                : 'bg-neutral-900 text-neutral-400 hover:bg-neutral-800'
            }`}
          >
            <div className="flex items-center gap-4">
              <UserX className="w-5 h-5" />
              <span className="font-black uppercase tracking-tighter ">Blocked</span>
            </div>
            {blockedEmails.length > 0 && (
              <span className={`text-[10px] font-black px-2 py-1 rounded-lg ${
                activeTab === 'blocked' ? 'bg-black text-emerald-500' : 'bg-neutral-800 text-neutral-500'
              }`}>
                {blockedEmails.length}
              </span>
            )}
          </button>

          <button 
            onClick={() => {
              window.location.href = '/';
            }}
            className="w-full flex items-center justify-center gap-4 p-6 rounded-2xl bg-white text-black hover:bg-emerald-500 hover:text-white transition-all duration-300 font-black uppercase tracking-tighter  shadow-xl"
          >
            <Video className="w-6 h-6" />
            Start Encounter
          </button>

          <div className="mt-auto p-6 bg-neutral-900/50 rounded-3xl border border-neutral-900">
            <div className="flex items-center gap-3 mb-4">
              <Terminal className="w-4 h-4 text-emerald-500" />
              <span className="text-[10px] font-black uppercase tracking-widest text-neutral-500 ">System Log</span>
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
                  <h2 className="text-4xl font-black tracking-tighter uppercase ">Security Reports</h2>
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
                      <div className="flex gap-3">
                        <button
                          onClick={() => deleteReport(report.id)}
                          className="flex items-center gap-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest  transition-all"
                        >
                          Dismiss
                        </button>
                        <button
                          onClick={() => blockUser(report.reportedId, report.reportedEmail)}
                          className="flex items-center gap-3 bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest  transition-all shadow-xl shadow-red-600/20"
                        >
                          <UserX className="w-4 h-4" />
                          Execute Block
                        </button>
                      </div>
                    </div>

                    <div className="bg-neutral-950 p-6 rounded-2xl border border-neutral-900 mb-6">
                      <p className="text-neutral-400 text-sm font-medium leading-relaxed ">"{report.reason}"</p>
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
                key="blocked"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="max-w-5xl mx-auto space-y-6"
              >
                <div className="flex items-center justify-between mb-12">
                  <h2 className="text-4xl font-black tracking-tighter uppercase ">Blocked Entities</h2>
                  <span className="text-[10px] font-bold uppercase tracking-[0.4em] text-neutral-600">Protocol Deny List</span>
                </div>

                {blockedEmails.map((blocked) => (
                  <div key={blocked.id} className="group bg-neutral-900/50 border border-neutral-900 rounded-[32px] p-8 hover:border-emerald-500/30 transition-all duration-500 backdrop-blur-xl">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-6">
                        <div className="w-14 h-14 bg-neutral-950 rounded-2xl flex items-center justify-center border border-neutral-800">
                          <Lock className="w-6 h-6 text-neutral-600" />
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-neutral-600 mb-1">Email Address</p>
                          <p className="text-xl font-mono text-white">{blocked.id}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => unblockEmail(blocked.id, blocked.uid)}
                        className="flex items-center gap-3 bg-white hover:bg-emerald-500 text-black hover:text-white px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest  transition-all shadow-xl"
                      >
                        Restore Access
                      </button>
                    </div>
                    
                    <div className="mt-6 flex gap-8 pt-6 border-t border-neutral-900">
                      <div>
                        <p className="text-[8px] font-black uppercase tracking-widest text-neutral-600 mb-1">Blocked At</p>
                        <p className="text-[10px] font-mono text-neutral-400">{new Date(blocked.blockedAt?.toDate()).toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-[8px] font-black uppercase tracking-widest text-neutral-600 mb-1">Reason</p>
                        <p className="text-[10px] font-mono text-neutral-400 uppercase">{blocked.reason}</p>
                      </div>
                      {blocked.uid && (
                        <div>
                          <p className="text-[8px] font-black uppercase tracking-widest text-neutral-600 mb-1">Internal UID</p>
                          <p className="text-[10px] font-mono text-neutral-400">{blocked.uid}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {blockedEmails.length === 0 && (
                  <div className="py-40 text-center">
                    <Globe className="w-20 h-20 text-neutral-900 mx-auto mb-8" />
                    <p className="text-neutral-700 font-black uppercase tracking-[0.4em]">Deny List is Empty</p>
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
