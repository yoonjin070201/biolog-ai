/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  auth, db, handleFirestoreError, OperationType 
} from './firebase';
import { 
  signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut, User as FirebaseUser, signInAnonymously 
} from 'firebase/auth';
import { 
  doc, setDoc, getDoc, collection, query, where, onSnapshot, addDoc, orderBy, serverTimestamp, Timestamp 
} from 'firebase/firestore';
import { 
  Leaf, Microscope, ClipboardList, LayoutDashboard, LogOut, Plus, Send, Camera, Sparkles, Award, User as UserIcon, Search, MessageSquare, ChevronRight, Loader2, Mic, Type as TypeIcon, Settings, X, Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getAIFeedback, identifyOrganism, chatWithAI, performOCR } from './services/geminiService';
import ReactMarkdown from 'react-markdown';
import { cn } from './lib/utils';
import { Toaster, toast } from 'sonner';
import confetti from 'canvas-confetti';

// --- Types ---
interface UserProfile {
  uid: string;
  email?: string;
  displayName: string;
  role: 'student' | 'teacher';
  className?: string;
  studentNumber?: string;
  badgeCount: number;
  createdAt: any;
}

interface ObservationLog {
  id: string;
  studentId: string;
  studentName: string;
  title: string;
  content: string;
  imageUrl?: string;
  aiFeedback?: string;
  createdAt: Timestamp;
}

interface Badge {
  id: string;
  studentId: string;
  type: string;
  awardedAt: Timestamp;
}

// --- Components ---

const ErrorBoundary = ({ children }: { children: React.ReactNode }) => {
  const [hasError, setHasError] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      try {
        const parsed = JSON.parse(event.error.message);
        setErrorMsg(`Firebase Error: ${parsed.operationType} at ${parsed.path}`);
      } catch {
        setErrorMsg(event.error.message);
      }
      setHasError(true);
    };
    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

  if (hasError) {
    return (
      <div className="p-8 bg-red-50 text-red-800 rounded-xl border border-red-200 m-4">
        <h2 className="text-xl font-bold mb-2">문제가 발생했습니다</h2>
        <p className="mb-4">{errorMsg}</p>
        <button 
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
        >
          다시 시도하기
        </button>
      </div>
    );
  }

  return <>{children}</>;
};

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'student' | 'teacher'>('student');
  const [showLogin, setShowLogin] = useState<'student' | 'teacher' | null>(null);

  // Student Login State
  const [studentClass, setStudentClass] = useState('');
  const [studentNum, setStudentNum] = useState('');
  const [studentName, setStudentName] = useState('');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
        if (userDoc.exists()) {
          const data = userDoc.data() as UserProfile;
          setProfile(data);
          setView(data.role);
        }
      } else {
        // Check local storage for student session
        const savedStudent = localStorage.getItem('biolog_student');
        if (savedStudent) {
          const studentData = JSON.parse(savedStudent);
          setUser({ uid: studentData.uid } as any);
          setProfile(studentData);
          setView('student');
        } else {
          setUser(null);
          setProfile(null);
        }
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleTeacherLogin = async () => {
    try {
      const result = await signInWithPopup(auth, new GoogleAuthProvider());
      const userDoc = await getDoc(doc(db, 'users', result.user.uid));
      if (!userDoc.exists()) {
        const newProfile: UserProfile = {
          uid: result.user.uid,
          email: result.user.email || '',
          displayName: result.user.displayName || '선생님',
          role: 'teacher',
          badgeCount: 0,
          createdAt: serverTimestamp(),
        };
        await setDoc(doc(db, 'users', result.user.uid), newProfile);
        setProfile(newProfile);
      }
      toast.success('선생님 환영합니다!');
    } catch (error) {
      toast.error('로그인에 실패했습니다.');
    }
  };

  const handleStudentLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentClass || !studentNum || !studentName) return;

    try {
      const result = await signInAnonymously(auth);
      const studentUid = result.user.uid;
      const userDoc = await getDoc(doc(db, 'users', studentUid));
      
      let studentProfile: UserProfile;
      if (userDoc.exists()) {
        studentProfile = userDoc.data() as UserProfile;
      } else {
        studentProfile = {
          uid: studentUid,
          displayName: studentName,
          role: 'student',
          className: studentClass,
          studentNumber: studentNum,
          badgeCount: 0,
          createdAt: serverTimestamp(),
        };
        await setDoc(doc(db, 'users', studentUid), studentProfile);
      }

      setProfile(studentProfile);
      setView('student');
      toast.success(`${studentName} 학생 반가워요!`);
    } catch (error) {
      toast.error('로그인에 실패했습니다.');
    }
  };

  const handleLogout = () => {
    signOut(auth);
    localStorage.removeItem('biolog_student');
    setUser(null);
    setProfile(null);
    setShowLogin(null);
  };

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-emerald-50">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
        >
          <Leaf className="w-12 h-12 text-emerald-600" />
        </motion.div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-emerald-50 flex flex-col items-center justify-center p-4">
        <Toaster position="top-center" />
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-white p-8 rounded-3xl shadow-xl text-center"
        >
          <div className="w-20 h-20 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Microscope className="w-10 h-10 text-emerald-600" />
          </div>
          <h1 className="text-3xl font-bold text-emerald-900 mb-2">BioLog AI</h1>
          <p className="text-emerald-700 mb-8">인공지능과 함께하는 즐거운 생물 관찰 여행</p>
          
          {!showLogin ? (
            <div className="space-y-4">
              <button 
                onClick={() => setShowLogin('student')}
                className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-bold text-lg hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200"
              >
                학생으로 시작하기
              </button>
              <button 
                onClick={() => setShowLogin('teacher')}
                className="w-full py-4 bg-white border-2 border-emerald-600 text-emerald-600 rounded-2xl font-bold text-lg hover:bg-emerald-50 transition-all"
              >
                선생님으로 시작하기
              </button>
            </div>
          ) : showLogin === 'student' ? (
            <form onSubmit={handleStudentLogin} className="space-y-4 text-left">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1">학급명</label>
                <input 
                  type="text" 
                  value={studentClass}
                  onChange={(e) => setStudentClass(e.target.value)}
                  placeholder="예: 3학년 1반"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-bold text-slate-700 mb-1">번호</label>
                  <input 
                    type="number" 
                    value={studentNum}
                    onChange={(e) => setStudentNum(e.target.value)}
                    placeholder="번호"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-emerald-500"
                    required
                  />
                </div>
                <div className="flex-2">
                  <label className="block text-sm font-bold text-slate-700 mb-1">이름</label>
                  <input 
                    type="text" 
                    value={studentName}
                    onChange={(e) => setStudentName(e.target.value)}
                    placeholder="이름"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-emerald-500"
                    required
                  />
                </div>
              </div>
              <button 
                type="submit"
                className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-bold text-lg hover:bg-emerald-700 transition-all mt-4"
              >
                로그인
              </button>
              <button 
                type="button"
                onClick={() => setShowLogin(null)}
                className="w-full text-slate-400 text-sm font-medium"
              >
                뒤로가기
              </button>
            </form>
          ) : (
            <div className="space-y-4">
              <button 
                onClick={handleTeacherLogin}
                className="w-full py-4 bg-white border-2 border-slate-200 text-slate-700 rounded-2xl font-bold text-lg hover:bg-slate-50 transition-all flex items-center justify-center gap-3"
              >
                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/layout/google.svg" className="w-6 h-6" alt="Google" />
                선생님 구글 로그인
              </button>
              <button 
                onClick={() => setShowLogin(null)}
                className="w-full text-slate-400 text-sm font-medium"
              >
                뒤로가기
              </button>
            </div>
          )}
        </motion.div>
      </div>
    );
  }

  const [activeTab, setActiveTab] = useState('logs');

  return (
    <ErrorBoundary>
      <Toaster position="top-center" />
      <div className="min-h-screen bg-slate-50 flex">
        {/* Sidebar */}
        <aside className="w-20 md:w-64 bg-white border-r border-slate-200 flex flex-col">
          <div className="p-6 flex items-center gap-3">
            <Leaf className="w-8 h-8 text-emerald-600 shrink-0" />
            <span className="font-bold text-xl text-emerald-900 hidden md:block">BioLog AI</span>
          </div>
          
          <nav className="flex-1 px-4 space-y-2 mt-4">
            {profile?.role === 'student' ? (
              <>
                <SidebarItem icon={<ClipboardList />} label="나의 관찰일지" active={activeTab === 'logs'} onClick={() => setActiveTab('logs')} />
                <SidebarItem icon={<Microscope />} label="AI 생물도감" active={activeTab === 'dictionary'} onClick={() => setActiveTab('dictionary')} />
                <SidebarItem icon={<Award />} label="나의 배지" active={activeTab === 'badges'} onClick={() => setActiveTab('badges')} />
              </>
            ) : (
              <>
                <SidebarItem icon={<LayoutDashboard />} label="학급 대시보드" active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} />
                <SidebarItem icon={<ClipboardList />} label="학생 일지 모아보기" active={activeTab === 'logs'} onClick={() => setActiveTab('logs')} />
                <SidebarItem icon={<Settings />} label="학급 설정" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
              </>
            )}
          </nav>

          <div className="p-4 border-t border-slate-100">
            <div className="flex items-center gap-3 p-2 mb-4">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold">
                {profile?.displayName[0]}
              </div>
              <div className="hidden md:block overflow-hidden">
                <p className="font-medium text-sm truncate">{profile?.displayName}</p>
                <p className="text-xs text-slate-500">{profile?.role === 'student' ? `${profile.className} ${profile.studentNumber}번` : '교사'}</p>
              </div>
            </div>
            <button 
              onClick={handleLogout}
              className="w-full flex items-center gap-3 p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            >
              <LogOut className="w-5 h-5" />
              <span className="hidden md:block text-sm font-medium">로그아웃</span>
            </button>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto relative">
          {view === 'student' ? (
            <StudentDashboard profile={profile!} activeTab={activeTab} />
          ) : (
            <TeacherDashboard activeTab={activeTab} />
          )}
          
          {/* Global AI Chatbot Popup */}
          <AIChatbotPopup />
        </main>
      </div>
    </ErrorBoundary>
  );
}

function SidebarItem({ icon, label, active = false, onClick }: { icon: React.ReactNode, label: string, active?: boolean, onClick?: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 p-3 rounded-xl transition-all group",
        active ? "bg-emerald-50 text-emerald-700" : "text-slate-500 hover:bg-slate-50"
      )}
    >
      <span className={cn("shrink-0", active ? "text-emerald-600" : "group-hover:text-emerald-500")}>
        {React.isValidElement(icon) ? React.cloneElement(icon as React.ReactElement<any>, { size: 22 }) : icon}
      </span>
      <span className="hidden md:block text-sm font-semibold">{label}</span>
    </button>
  );
}

// --- Student Dashboard ---
function StudentDashboard({ profile, activeTab }: { profile: UserProfile, activeTab: string }) {
  const [logs, setLogs] = useState<ObservationLog[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [badges, setBadges] = useState<Badge[]>([]);

  useEffect(() => {
    const q = query(
      collection(db, 'logs'), 
      where('studentId', '==', profile.uid),
      orderBy('createdAt', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ObservationLog)));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'logs'));
    return () => unsubscribe();
  }, [profile.uid]);

  useEffect(() => {
    const q = query(collection(db, 'badges'), where('studentId', '==', profile.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setBadges(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Badge)));
    });
    return () => unsubscribe();
  }, [profile.uid]);

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {activeTab === 'logs' && (
        <>
          <header className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">안녕, {profile.displayName}! 👋</h2>
              <p className="text-slate-500">오늘도 멋진 생물을 발견했나요?</p>
            </div>
            <button 
              onClick={() => setIsAdding(true)}
              className="bg-emerald-600 text-white px-6 py-3 rounded-2xl font-bold flex items-center gap-2 hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100"
            >
              <Plus className="w-5 h-5" />
              새 관찰일지 쓰기
            </button>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <AnimatePresence>
              {logs.map((log) => (
                <LogCard key={log.id} log={log} />
              ))}
            </AnimatePresence>
            {logs.length === 0 && (
              <div className="col-span-full py-20 text-center bg-white rounded-3xl border-2 border-dashed border-slate-200">
                <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <ClipboardList className="w-8 h-8 text-slate-300" />
                </div>
                <p className="text-slate-400 font-medium">아직 작성된 일지가 없어요.<br/>첫 번째 관찰을 기록해보세요!</p>
              </div>
            )}
          </div>
        </>
      )}

      {activeTab === 'dictionary' && <BioDictionary />}
      
      {activeTab === 'badges' && (
        <div className="space-y-8">
          <header>
            <h2 className="text-2xl font-bold text-slate-900">나의 배지 🏆</h2>
            <p className="text-slate-500">관찰 활동을 통해 획득한 멋진 배지들이에요!</p>
          </header>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
            {badges.map((badge) => (
              <div key={badge.id} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 text-center flex flex-col items-center gap-3">
                <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center text-amber-600">
                  <Award size={32} />
                </div>
                <div>
                  <p className="font-bold text-slate-900">{badge.type}</p>
                  <p className="text-xs text-slate-400">{badge.awardedAt?.toDate().toLocaleDateString()}</p>
                </div>
              </div>
            ))}
            {badges.length === 0 && (
              <div className="col-span-full py-20 text-center text-slate-400">
                아직 획득한 배지가 없어요. 꾸준히 관찰 일지를 써보세요!
              </div>
            )}
          </div>
        </div>
      )}

      {isAdding && <AddLogModal onClose={() => setIsAdding(false)} profile={profile} />}
    </div>
  );
}

function LogCard({ log }: { log: ObservationLog }) {
  return (
    <motion.div 
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 hover:shadow-md transition-shadow"
    >
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-lg font-bold text-slate-900">{log.title}</h3>
          <p className="text-xs text-slate-400">{log.createdAt?.toDate().toLocaleDateString()}</p>
        </div>
        <div className="bg-emerald-50 text-emerald-600 p-2 rounded-xl">
          <Microscope size={20} />
        </div>
      </div>
      
      {log.imageUrl && (
        <img 
          src={log.imageUrl} 
          alt={log.title} 
          className="w-full h-48 object-cover rounded-2xl mb-4"
          referrerPolicy="no-referrer"
        />
      )}
      
      <p className="text-slate-600 text-sm line-clamp-3 mb-4">{log.content}</p>
      
      {log.aiFeedback && (
        <div className="bg-amber-50 rounded-2xl p-4 border border-amber-100">
          <div className="flex items-center gap-2 mb-2 text-amber-700 font-bold text-xs">
            <Sparkles size={14} />
            AI 선생님의 칭찬과 조언
          </div>
          <p className="text-amber-900 text-xs leading-relaxed italic">"{log.aiFeedback}"</p>
        </div>
      )}
    </motion.div>
  );
}

function AddLogModal({ onClose, profile }: { onClose: () => void, profile: UserProfile }) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleOCR = async () => {
    if (!imageFile) return;
    setLoading(true);
    const text = await performOCR(imageFile);
    if (text) {
      setContent(prev => prev + (prev ? '\n' : '') + text);
      toast.success('손글씨를 텍스트로 변환했습니다!');
    } else {
      toast.error('텍스트를 추출할 수 없습니다.');
    }
    setLoading(false);
  };

  const startSpeechRecognition = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error('이 브라우저는 음성 인식을 지원하지 않습니다.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'ko-KR';
    recognition.onstart = () => setIsRecording(true);
    recognition.onend = () => setIsRecording(false);
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setContent(prev => prev + (prev ? ' ' : '') + transcript);
    };
    recognition.start();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !content) return;

    setLoading(true);
    try {
      const feedback = await getAIFeedback(content);
      
      await addDoc(collection(db, 'logs'), {
        studentId: profile.uid,
        studentName: profile.displayName,
        className: profile.className,
        title,
        content,
        imageUrl: image,
        aiFeedback: feedback,
        createdAt: serverTimestamp(),
      });

      // Simple badge logic: 1st log
      const logsSnap = await getDoc(doc(db, 'users', profile.uid));
      if (logsSnap.exists()) {
        const currentCount = logsSnap.data().badgeCount || 0;
        if (currentCount === 0) {
          await addDoc(collection(db, 'badges'), {
            studentId: profile.uid,
            type: '첫 관찰의 시작 묘목 배지',
            awardedAt: serverTimestamp(),
          });
          await setDoc(doc(db, 'users', profile.uid), { badgeCount: 1 }, { merge: true });
          confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
          toast.success('첫 관찰 배지를 획득했습니다! 🎉');
        }
      }

      toast.success('관찰 일지가 저장되었습니다!');
      onClose();
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'logs');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden"
      >
        <form onSubmit={handleSubmit}>
          <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-emerald-600 text-white">
            <h3 className="text-xl font-bold">새 관찰일지 작성</h3>
            <button type="button" onClick={onClose} className="hover:bg-white/20 p-1 rounded-full transition-colors">
              <X className="w-6 h-6" />
            </button>
          </div>
          
          <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">무엇을 관찰했나요? (제목)</label>
              <input 
                type="text" 
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="예: 우리 집 베란다의 상추"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                required
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-bold text-slate-700">관찰 내용</label>
                <div className="flex gap-2">
                  <button 
                    type="button"
                    onClick={startSpeechRecognition}
                    className={cn(
                      "flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold transition-all",
                      isRecording ? "bg-red-100 text-red-600 animate-pulse" : "bg-blue-100 text-blue-600 hover:bg-blue-200"
                    )}
                  >
                    <Mic size={14} />
                    {isRecording ? '녹음 중...' : '음성 입력'}
                  </button>
                  {image && (
                    <button 
                      type="button"
                      onClick={handleOCR}
                      className="flex items-center gap-1 px-3 py-1 rounded-full bg-purple-100 text-purple-600 text-xs font-bold hover:bg-purple-200 transition-all"
                    >
                      <TypeIcon size={14} />
                      손글씨 인식
                    </button>
                  )}
                </div>
              </div>
              <textarea 
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="오늘 무엇을 관찰했나요? 생김새나 변화를 적어보세요."
                className="w-full h-40 px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none transition-all resize-none"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">사진 첨부</label>
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="w-full h-48 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:bg-slate-50 transition-colors overflow-hidden relative group"
              >
                {image ? (
                  <>
                    <img src={image} alt="Preview" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                      <Camera className="text-white w-10 h-10" />
                    </div>
                  </>
                ) : (
                  <>
                    <Camera className="w-10 h-10 text-slate-300 mb-2" />
                    <p className="text-sm text-slate-400 font-medium">사진을 클릭해서 업로드하세요</p>
                  </>
                )}
              </div>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleImageChange} 
                className="hidden" 
                accept="image/*" 
              />
            </div>
          </div>

          <div className="p-6 bg-slate-50 flex gap-3">
            <button 
              type="button" 
              onClick={onClose}
              className="flex-1 py-3 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-100"
            >
              취소
            </button>
            <button 
              type="submit" 
              disabled={loading}
              className="flex-2 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-emerald-100"
            >
              {loading ? <Loader2 className="animate-spin" /> : <Send size={18} />}
              일지 저장하기
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// --- Teacher Dashboard ---
function TeacherDashboard({ activeTab }: { activeTab: string }) {
  const [allLogs, setAllLogs] = useState<ObservationLog[]>([]);
  const [stats, setStats] = useState({ totalLogs: 0, studentCount: 0 });
  const [filterClass, setFilterClass] = useState('전체');
  const [badgeSettings, setBadgeSettings] = useState<{ [key: string]: boolean }>({});

  useEffect(() => {
    const q = query(collection(db, 'logs'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ObservationLog));
      setAllLogs(logs);
      
      const uniqueStudents = new Set(logs.map(l => l.studentId));
      setStats({
        totalLogs: logs.length,
        studentCount: uniqueStudents.size
      });
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'logs'));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'settings'), (snapshot) => {
      const settings: { [key: string]: boolean } = {};
      snapshot.docs.forEach(doc => {
        settings[doc.id] = doc.data().badgesEnabled;
      });
      setBadgeSettings(settings);
    });
    return () => unsubscribe();
  }, []);

  const toggleBadges = async (className: string) => {
    const current = badgeSettings[className] ?? true;
    await setDoc(doc(db, 'settings', className), { 
      className, 
      badgesEnabled: !current 
    }, { merge: true });
    toast.success(`${className} 배지 시스템이 ${!current ? '활성화' : '비활성화'} 되었습니다.`);
  };

  const classes = ['전체', ...Array.from(new Set(allLogs.map(l => (l as any).className).filter(Boolean)))];
  const filteredLogs = filterClass === '전체' ? allLogs : allLogs.filter(l => (l as any).className === filterClass);

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {activeTab === 'dashboard' && (
        <>
          <header className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900">학급 활동 현황 📊</h2>
            <p className="text-slate-500">학생들의 관찰 활동을 한눈에 관리하세요.</p>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <StatCard title="전체 관찰일지" value={stats.totalLogs} icon={<ClipboardList className="text-blue-600" />} color="bg-blue-50" />
            <StatCard title="참여 학생 수" value={stats.studentCount} icon={<UserIcon className="text-emerald-600" />} color="bg-emerald-50" />
            <StatCard title="오늘의 활동" value={allLogs.filter(l => l.createdAt?.toDate().toDateString() === new Date().toDateString()).length} icon={<Sparkles className="text-amber-600" />} color="bg-amber-50" />
          </div>

          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-bold text-lg">최근 관찰 활동</h3>
              <div className="flex items-center gap-2">
                <Search size={16} className="text-slate-400" />
                <select 
                  value={filterClass}
                  onChange={(e) => setFilterClass(e.target.value)}
                  className="text-sm border-none bg-slate-50 rounded-lg px-3 py-1 outline-none font-medium text-slate-600"
                >
                  {classes.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold">
                  <tr>
                    <th className="px-6 py-4">학급/번호</th>
                    <th className="px-6 py-4">학생</th>
                    <th className="px-6 py-4">관찰 대상</th>
                    <th className="px-6 py-4">날짜</th>
                    <th className="px-6 py-4"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 text-xs font-bold text-slate-400">
                        {(log as any).className}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold">
                            {log.studentName[0]}
                          </div>
                          <span className="text-sm font-medium">{log.studentName}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm font-semibold">{log.title}</td>
                      <td className="px-6 py-4 text-sm text-slate-500">{log.createdAt?.toDate().toLocaleDateString()}</td>
                      <td className="px-6 py-4 text-right">
                        <button className="text-slate-400 hover:text-emerald-600">
                          <ChevronRight size={20} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredLogs.length === 0 && (
                <div className="p-12 text-center text-slate-400 italic">아직 활동 기록이 없습니다.</div>
              )}
            </div>
          </div>
        </>
      )}

      {activeTab === 'settings' && (
        <div className="space-y-8">
          <header>
            <h2 className="text-2xl font-bold text-slate-900">학급 설정 ⚙️</h2>
            <p className="text-slate-500">학급별 배지 시스템 및 활동 설정을 관리합니다.</p>
          </header>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {classes.filter(c => c !== '전체').map(className => (
              <div key={className} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600">
                    <UserIcon size={24} />
                  </div>
                  <div>
                    <p className="font-bold text-slate-900">{className}</p>
                    <p className="text-xs text-slate-500">배지 시스템 활성화 상태</p>
                  </div>
                </div>
                <button 
                  onClick={() => toggleBadges(className)}
                  className={cn(
                    "px-4 py-2 rounded-xl text-sm font-bold transition-all",
                    badgeSettings[className] !== false ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-400"
                  )}
                >
                  {badgeSettings[className] !== false ? '활성화됨' : '비활성화됨'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'logs' && (
        <div className="space-y-4">
          <header className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900">학생 일지 모아보기 📚</h2>
            <p className="text-slate-500">전체 학생들의 관찰 기록을 확인하고 피드백을 관리하세요.</p>
          </header>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filteredLogs.map(log => (
              <LogCard key={log.id} log={log} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ title, value, icon, color }: { title: string, value: number, icon: React.ReactNode, color: string }) {
  return (
    <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex items-center gap-4">
      <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center", color)}>
        {icon}
      </div>
      <div>
        <p className="text-slate-500 text-sm font-medium">{title}</p>
        <p className="text-2xl font-bold text-slate-900">{value}</p>
      </div>
    </div>
  );
}

function BioDictionary() {
  const [image, setImage] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [result, setResult] = useState<{ name: string, description: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleIdentify = async () => {
    if (!imageFile) return;
    setLoading(true);
    const data = await identifyOrganism(imageFile);
    setResult(data);
    setLoading(false);
  };

  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-2xl font-bold text-slate-900">AI 생물도감 📖</h2>
        <p className="text-slate-500">사진을 찍으면 인공지능이 어떤 생물인지 알려줘요!</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-4">
          <div 
            onClick={() => fileInputRef.current?.click()}
            className="aspect-square bg-white border-4 border-dashed border-slate-200 rounded-3xl flex flex-col items-center justify-center cursor-pointer hover:bg-slate-50 transition-all overflow-hidden relative"
          >
            {image ? (
              <img src={image} alt="Target" className="w-full h-full object-cover" />
            ) : (
              <>
                <Camera className="w-16 h-16 text-slate-200 mb-4" />
                <p className="text-slate-400 font-bold">생물 사진을 올려주세요</p>
              </>
            )}
          </div>
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept="image/*" 
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                setImageFile(file);
                const reader = new FileReader();
                reader.onloadend = () => setImage(reader.result as string);
                reader.readAsDataURL(file);
              }
            }}
          />
          <button 
            onClick={handleIdentify}
            disabled={!image || loading}
            className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-bold text-lg hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-emerald-100"
          >
            {loading ? <Loader2 className="animate-spin" /> : <Search size={20} />}
            누구일까요? 분석하기
          </button>
        </div>

        <AnimatePresence>
          {result && (
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-emerald-100 rounded-2xl flex items-center justify-center text-emerald-600">
                  <Sparkles size={24} />
                </div>
                <h3 className="text-2xl font-bold text-emerald-900">{result.name}</h3>
              </div>
              <div className="prose prose-emerald max-w-none">
                <p className="text-slate-600 leading-relaxed whitespace-pre-wrap">{result.description}</p>
              </div>
              <div className="mt-8 p-4 bg-emerald-50 rounded-2xl flex items-start gap-3">
                <Info className="text-emerald-600 shrink-0 mt-1" size={18} />
                <p className="text-xs text-emerald-800 leading-relaxed">
                  인공지능의 분석 결과는 참고용입니다. 더 정확한 정보는 백과사전이나 선생님께 여쭤보세요!
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function AIChatbotPopup() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<{ role: 'user' | 'ai', text: string }[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMsg = input;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setLoading(true);

    const reply = await chatWithAI(userMsg);
    setMessages(prev => [...prev, { role: 'ai', text: reply }]);
    setLoading(false);
  };

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className="absolute bottom-20 right-0 w-80 md:w-96 h-[500px] bg-white rounded-3xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden"
          >
            <div className="p-4 bg-emerald-600 text-white flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
                  <MessageSquare size={18} />
                </div>
                <span className="font-bold">AI 생물박사 챗봇</span>
              </div>
              <button onClick={() => setIsOpen(false)} className="hover:bg-white/20 p-1 rounded-full">
                <X size={20} />
              </button>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
              <div className="bg-white p-3 rounded-2xl rounded-tl-none shadow-sm border border-slate-100 text-sm text-slate-600">
                안녕하세요! 궁금한 생물 이야기가 있나요? 무엇이든 물어보세요! 🌿
              </div>
              {messages.map((m, i) => (
                <div key={i} className={cn(
                  "flex",
                  m.role === 'user' ? "justify-end" : "justify-start"
                )}>
                  <div className={cn(
                    "max-w-[80%] p-3 rounded-2xl text-sm shadow-sm",
                    m.role === 'user' 
                      ? "bg-emerald-600 text-white rounded-tr-none" 
                      : "bg-white text-slate-700 rounded-tl-none border border-slate-100"
                  )}>
                    <ReactMarkdown>{m.text}</ReactMarkdown>
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-white p-3 rounded-2xl rounded-tl-none border border-slate-100">
                    <Loader2 className="w-4 h-4 text-emerald-600 animate-spin" />
                  </div>
                </div>
              )}
            </div>

            <form onSubmit={handleSend} className="p-4 bg-white border-t border-slate-100 flex gap-2">
              <input 
                type="text" 
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="질문을 입력하세요..."
                className="flex-1 bg-slate-50 border-none rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button 
                type="submit"
                disabled={loading || !input.trim()}
                className="bg-emerald-600 text-white p-2 rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                <Send size={18} />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-14 h-14 bg-emerald-600 text-white rounded-full shadow-xl flex items-center justify-center hover:bg-emerald-700 hover:scale-110 transition-all"
      >
        {isOpen ? <X size={28} /> : <MessageSquare size={28} />}
      </button>
    </div>
  );
}
