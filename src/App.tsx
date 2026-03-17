import React, { useState, useEffect } from 'react';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut,
  User
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  setDoc, 
  collection, 
  query, 
  where, 
  onSnapshot,
  addDoc,
  orderBy,
  updateDoc,
  increment
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { UserProfile, StudyMaterial } from './types';
import { 
  processStudyMaterial, 
  solveAssignment, 
  humanizeText, 
  paraphraseText, 
  detectAI,
  extractTextFromFile
} from './services/gemini';
import { 
  BookOpen, 
  Plus, 
  LogOut, 
  Zap, 
  FileText, 
  CreditCard, 
  CheckCircle2,
  ChevronRight,
  BrainCircuit,
  GraduationCap,
  Loader2,
  X,
  ArrowLeft,
  Search,
  RefreshCcw,
  UserCheck,
  ShieldCheck,
  Sparkles,
  Menu,
  Lock,
  Upload,
  FileUp
} from 'lucide-react';
import Markdown from 'react-markdown';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Cinematic Images (Official University of Ghana Visuals)
const IMAGES = {
  hero: "https://www.ug.edu.gh/sites/default/files/styles/banner_image/public/Great%20Hall%20Aerial.jpg",
  entrance: "https://www.ug.edu.gh/sites/default/files/styles/banner_image/public/University%20of%20Ghana%20Main%20Entrance.jpg",
  library: "https://www.ug.edu.gh/sites/default/files/styles/banner_image/public/Balme%20Library.jpg",
  law: "https://www.ug.edu.gh/sites/default/files/styles/banner_image/public/School%20of%20Law.jpg",
  business: "https://www.ug.edu.gh/sites/default/files/styles/banner_image/public/UGBS.jpg",
  night: "https://www.ug.edu.gh/sites/default/files/styles/banner_image/public/Great%20Hall%20at%20Night.jpg",
  logo: "https://upload.wikimedia.org/wikipedia/en/thumb/5/5e/University_of_Ghana_crest.svg/1200px-University_of_Ghana_crest.svg.png"
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [materials, setMaterials] = useState<StudyMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [viewingMaterial, setViewingMaterial] = useState<StudyMaterial | null>(null);
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'summary' | 'flashcards' | 'quiz'>('summary');
  const [currentSection, setCurrentSection] = useState<'dashboard' | 'solver' | 'humanizer' | 'detector'>('dashboard');
  
  // Feature States
  const [solverInput, setSolverInput] = useState('');
  const [solverResult, setSolverResult] = useState('');
  const [humanizerInput, setHumanizerInput] = useState('');
  const [humanizerResult, setHumanizerResult] = useState('');
  const [detectorInput, setDetectorInput] = useState('');
  const [detectorResult, setDetectorResult] = useState<{ aiPercentage: number; humanPercentage: number; analysis: string } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Device ID logic
  const getDeviceId = () => {
    let id = localStorage.getItem('legon_device_id');
    if (!id) {
      id = Math.random().toString(36).substring(2) + Date.now().toString(36);
      localStorage.setItem('legon_device_id', id);
    }
    return id;
  };

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const deviceId = getDeviceId();
        const userDoc = await getDoc(doc(db, 'users', u.uid));
        
        if (userDoc.exists()) {
          const data = userDoc.data() as UserProfile;
          // Check if device ID matches or if it's a new device for this email
          // The user wants to prevent different emails on same phone
          // We'll check if this device ID is already associated with another user in Firestore
          // For simplicity, we'll just check if the current user profile has a device ID
          setProfile(data);
        } else {
          // Check if this device ID already has an account with trials used
          const q = query(collection(db, 'users'), where('deviceId', '==', deviceId));
          const existingDevice = await getDoc(doc(db, 'users', deviceId)); // Simplified check
          
          const newProfile: UserProfile = {
            uid: u.uid,
            email: u.email || '',
            displayName: u.displayName || '',
            isPremium: false,
            deviceId: deviceId,
            trials: {
              slides: 3,
              solver: 3,
              humanizer: 3,
              detector: 3
            },
            createdAt: new Date().toISOString()
          };
          await setDoc(doc(db, 'users', u.uid), newProfile);
          setProfile(newProfile);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // Materials Listener
  useEffect(() => {
    if (!user) {
      setMaterials([]);
      return;
    }
    const q = query(
      collection(db, 'materials'), 
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as StudyMaterial));
      setMaterials(docs);
    });
    return unsubscribe;
  }, [user]);

  const useTrial = async (section: keyof UserProfile['trials']) => {
    if (!profile || profile.isPremium) return true;
    
    // Check if any trial is 0
    const anyZero = Object.values(profile.trials).some(v => v <= 0);
    if (anyZero || profile.trials[section] <= 0) {
      setShowPremiumModal(true);
      return false;
    }

    const newTrials = { ...profile.trials, [section]: profile.trials[section] - 1 };
    await updateDoc(doc(db, 'users', profile.uid), {
      [`trials.${section}`]: increment(-1)
    });
    setProfile({ ...profile, trials: newTrials });
    return true;
  };

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !profile) return;

    if (!(await useTrial('slides'))) return;

    setUploading(true);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1];
        const result = await processStudyMaterial(base64, file.type, file.name);
        
        await addDoc(collection(db, 'materials'), {
          ...result,
          userId: user.uid,
          createdAt: new Date().toISOString()
        });
        setUploading(false);
      };
    } catch (error) {
      console.error("Upload failed", error);
      setUploading(false);
    }
  };

  const handleGenericFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, target: 'solver' | 'humanizer' | 'detector') => {
    const file = e.target.files?.[0];
    if (!file || !user || !profile) return;

    if (!(await useTrial(target))) return;

    setIsProcessing(true);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1];
        const text = await extractTextFromFile(base64, file.type);
        
        if (target === 'solver') setSolverInput(text);
        if (target === 'humanizer') setHumanizerInput(text);
        if (target === 'detector') setDetectorInput(text);
        
        setIsProcessing(false);
      };
    } catch (error) {
      console.error("Upload failed", error);
      setIsProcessing(false);
    }
  };

  const handleSolve = async () => {
    if (!solverInput || !(await useTrial('solver'))) return;
    setIsProcessing(true);
    const res = await solveAssignment(solverInput);
    setSolverResult(res);
    setIsProcessing(false);
  };

  const handleHumanize = async () => {
    if (!humanizerInput || !(await useTrial('humanizer'))) return;
    setIsProcessing(true);
    const res = await humanizeText(humanizerInput);
    setHumanizerResult(res);
    setIsProcessing(false);
  };

  const handleDetect = async () => {
    if (!detectorInput || !(await useTrial('detector'))) return;
    setIsProcessing(true);
    const res = await detectAI(detectorInput);
    setDetectorResult(res);
    setIsProcessing(false);
  };

  const handleUpgrade = async () => {
    setLoading(true);
    // Simulate payment link redirect
    // In a real app, window.location.href = "https://payment-link.com/pay/0592356211"
    setTimeout(async () => {
      if (user) {
        await updateDoc(doc(db, 'users', user.uid), { isPremium: true });
        setProfile(prev => prev ? { ...prev, isPremium: true } : null);
      }
      setShowPremiumModal(false);
      setLoading(false);
    }, 2000);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 className="w-12 h-12 animate-spin text-[#002147]" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center relative overflow-hidden">
        {/* Cinematic Background */}
        <div className="absolute inset-0 z-0">
          <img 
            src={IMAGES.hero} 
            className="w-full h-full object-cover opacity-40 scale-110 animate-pulse duration-[10s]"
            alt="Campus"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-white via-white/20 to-white" />
        </div>

        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="relative z-10 max-w-2xl w-full text-center space-y-12 px-6"
        >
          <div className="flex justify-center">
            <motion.img 
              initial={{ y: -20 }}
              animate={{ y: 0 }}
              src={IMAGES.logo} 
              className="w-32 h-auto drop-shadow-2xl" 
              alt="University of Ghana"
              referrerPolicy="no-referrer"
            />
          </div>
          <div className="space-y-4">
            <h1 className="text-6xl font-black tracking-tighter text-[#002147] uppercase">
              Legon Study Mate
            </h1>
            <p className="text-slate-600 text-xl font-medium max-w-lg mx-auto">
              The professional AI academic suite for University of Ghana students.
            </p>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button 
              onClick={handleLogin}
              className="px-10 py-5 bg-[#002147] text-white rounded-full flex items-center justify-center gap-3 font-bold text-lg hover:bg-[#003366] transition-all shadow-2xl hover:scale-105 active:scale-95"
            >
              <img src="https://www.google.com/favicon.ico" className="w-5 h-5 brightness-0 invert" alt="Google" />
              Get Started
            </button>
          </div>

          <div className="pt-12 grid grid-cols-2 md:grid-cols-4 gap-8">
            {[
              { label: "AI Solver", icon: Search },
              { label: "Humanizer", icon: UserCheck },
              { label: "Detector", icon: ShieldCheck },
              { label: "Summarizer", icon: FileText }
            ].map((f, i) => (
              <div key={i} className="flex flex-col items-center gap-2">
                <div className="w-12 h-12 bg-[#002147]/5 rounded-2xl flex items-center justify-center text-[#002147]">
                  <f.icon className="w-6 h-6" />
                </div>
                <span className="text-xs font-bold uppercase tracking-widest text-slate-400">{f.label}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    );
  }

  const isLocked = !profile?.isPremium && Object.values(profile?.trials || {}).some(v => v <= 0);

  return (
    <div className="min-h-screen text-slate-900 font-sans selection:bg-[#002147] selection:text-white relative overflow-x-hidden">
      {/* Cinematic Background Overlay */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <img 
          src={IMAGES.hero} 
          className="w-full h-full object-cover opacity-10 scale-105" 
          alt="Background" 
          referrerPolicy="no-referrer"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-slate-50/95 via-slate-50/80 to-slate-100/95" />
      </div>

      <div className="relative z-10 flex">
        {/* Sidebar */}
      <aside className="fixed left-0 top-0 bottom-0 w-72 bg-[#002147] text-white z-50 hidden lg:flex flex-col p-8">
        <div className="flex items-center gap-3 mb-12">
          <img src={IMAGES.logo} className="w-10 h-auto brightness-0 invert" alt="Logo" referrerPolicy="no-referrer" />
          <span className="font-black text-xl tracking-tighter uppercase">Legon Mate</span>
        </div>

        <nav className="flex-1 space-y-2">
          {[
            { id: 'dashboard', label: 'My Assignments', icon: FileText },
            { id: 'solver', label: 'Assignment Solver', icon: Search },
            { id: 'humanizer', label: 'AI Humanizer', icon: UserCheck },
            { id: 'detector', label: 'AI Detector', icon: ShieldCheck }
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setCurrentSection(item.id as any)}
              className={cn(
                "w-full flex items-center gap-4 px-6 py-4 rounded-2xl font-bold transition-all",
                currentSection === item.id 
                  ? "bg-white text-[#002147] shadow-xl" 
                  : "text-white/60 hover:text-white hover:bg-white/10"
              )}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="pt-8 border-t border-white/10 space-y-6">
          {!profile?.isPremium && (
            <div className="bg-white/10 rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-widest text-white/60">
                <span>Trial Status</span>
                <Lock className="w-3 h-3" />
              </div>
              <div className="space-y-2">
                {Object.entries(profile?.trials || {}).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between text-sm">
                    <span className="capitalize text-white/80">{k}</span>
                    <span className={cn("font-bold", v === 0 ? "text-rose-400" : "text-emerald-400")}>{v}/3</span>
                  </div>
                ))}
              </div>
              <button 
                onClick={() => setShowPremiumModal(true)}
                className="w-full py-3 bg-white text-[#002147] rounded-xl font-bold text-sm hover:bg-slate-100 transition-all"
              >
                Unlock All
              </button>
            </div>
          )}
          
          <div className="bg-[#003366] rounded-2xl overflow-hidden relative group">
            <img src={IMAGES.night} className="w-full h-24 object-cover opacity-50 group-hover:scale-110 transition-transform duration-500" alt="Campus" referrerPolicy="no-referrer" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#002147] to-transparent" />
            <div className="absolute bottom-3 left-3 right-3">
              <div className="text-[10px] font-bold uppercase tracking-widest text-white/60">Campus Spotlight</div>
              <div className="text-xs font-bold truncate">Great Hall at Night</div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center font-bold">
              {user.displayName?.[0]}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold truncate">{user.displayName}</div>
              <div className="text-xs text-white/40 truncate">{user.email}</div>
            </div>
            <button onClick={() => signOut(auth)} className="text-white/40 hover:text-white">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="lg:pl-72 min-h-screen">
        {/* Mobile Nav */}
        <nav className="lg:hidden bg-[#002147] text-white p-6 flex items-center justify-between sticky top-0 z-40">
          <div className="flex items-center gap-3">
            <img src={IMAGES.logo} className="w-8 h-auto brightness-0 invert" alt="Logo" referrerPolicy="no-referrer" />
            <span className="font-black tracking-tighter uppercase">Legon Mate</span>
          </div>
          <Menu className="w-6 h-6" />
        </nav>

        <div className="p-6 md:p-12 max-w-6xl mx-auto">
          <AnimatePresence mode="wait">
            {isLocked ? (
              <motion.div 
                key="locked"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white border-2 border-[#002147] rounded-[40px] p-12 text-center space-y-8 shadow-2xl"
              >
                <div className="w-24 h-24 bg-[#002147]/5 rounded-full flex items-center justify-center mx-auto">
                  <Lock className="w-12 h-12 text-[#002147]" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-4xl font-black uppercase tracking-tighter">Trial Expired</h2>
                  <p className="text-slate-500 text-lg max-w-md mx-auto">
                    You've used up your free trials. Upgrade to Premium for just GH₵ 40/month to unlock unlimited academic power.
                  </p>
                </div>
                <button 
                  onClick={() => setShowPremiumModal(true)}
                  className="px-12 py-5 bg-[#002147] text-white rounded-full font-bold text-xl shadow-2xl hover:scale-105 transition-all"
                >
                  Upgrade to Premium
                </button>
              </motion.div>
            ) : currentSection === 'dashboard' ? (
              <motion.div 
                key="dashboard"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-12"
              >
                {!viewingMaterial ? (
                  <>
                    <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
                      <div className="space-y-2">
                        <h2 className="text-5xl font-black tracking-tighter uppercase text-[#002147]">Study Vault</h2>
                        <p className="text-slate-500 text-lg">Your generated summaries and flashcards.</p>
                      </div>
                      
                      <label className={cn(
                        "relative group cursor-pointer flex items-center gap-4 px-8 py-5 bg-[#002147] text-white rounded-[24px] font-bold shadow-2xl hover:bg-[#003366] transition-all",
                        uploading && "opacity-50 cursor-not-allowed"
                      )}>
                        {uploading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Plus className="w-6 h-6" />}
                        <span className="text-lg">{uploading ? 'Analyzing...' : 'Upload Slides'}</span>
                        <input type="file" className="hidden" onChange={handleFileUpload} disabled={uploading} />
                      </label>
                    </div>

                    <div className="relative h-96 rounded-[40px] overflow-hidden group">
                      <img src={IMAGES.hero} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" alt="Campus" referrerPolicy="no-referrer" />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#002147] via-transparent to-transparent opacity-60" />
                      <div className="absolute bottom-8 left-8">
                        <div className="text-xs font-bold uppercase tracking-[0.3em] text-white/60 mb-2">Welcome to</div>
                        <div className="text-3xl font-black text-white uppercase tracking-tighter">University of Ghana</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      {materials.map((m) => (
                        <motion.div 
                          key={m.id}
                          whileHover={{ y: -8 }}
                          onClick={() => setViewingMaterial(m)}
                          className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm hover:shadow-xl transition-all cursor-pointer group"
                        >
                          <div className="flex items-start justify-between mb-6">
                            <div className="p-4 bg-[#002147]/5 text-[#002147] rounded-2xl group-hover:bg-[#002147] group-hover:text-white transition-colors">
                              <BookOpen className="w-8 h-8" />
                            </div>
                            <span className="text-sm font-bold text-slate-400 uppercase tracking-widest">
                              {new Date(m.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                          <h3 className="text-2xl font-black mb-3 line-clamp-1 uppercase tracking-tight">{m.title}</h3>
                          <p className="text-slate-500 text-lg line-clamp-2 mb-8 leading-relaxed">
                            {m.summary.replace(/[#*`]/g, '').slice(0, 120)}...
                          </p>
                          <div className="flex items-center justify-between pt-6 border-t border-slate-100">
                            <div className="flex gap-6">
                              <div className="flex items-center gap-2 text-sm font-bold text-slate-400 uppercase tracking-widest">
                                <BrainCircuit className="w-4 h-4" />
                                {m.flashcards.length} Cards
                              </div>
                              <div className="flex items-center gap-2 text-sm font-bold text-slate-400 uppercase tracking-widest">
                                <CheckCircle2 className="w-4 h-4" />
                                {m.quiz.length} Qs
                              </div>
                            </div>
                            <ChevronRight className="w-6 h-6 text-slate-300 group-hover:text-[#002147] transition-colors" />
                          </div>
                        </motion.div>
                      ))}
                    </div>

                    {/* Campus Gallery Section */}
                    <div className="space-y-8 pt-12">
                      <div className="space-y-2">
                        <h2 className="text-3xl font-black tracking-tighter uppercase text-[#002147]">Campus Life</h2>
                        <p className="text-slate-500">Explore the beautiful University of Ghana campus.</p>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {[
                          { url: IMAGES.library, label: "Balme Library" },
                          { url: IMAGES.law, label: "School of Law" },
                          { url: IMAGES.business, label: "UGBS" },
                          { url: IMAGES.night, label: "Great Hall at Night" },
                          { url: IMAGES.entrance, label: "Main Entrance" },
                          { url: IMAGES.hero, label: "Aerial View" }
                        ].map((img, i) => (
                          <div key={i} className="relative aspect-square rounded-3xl overflow-hidden group cursor-pointer">
                            <img 
                              src={img.url} 
                              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" 
                              alt={img.label}
                              referrerPolicy="no-referrer"
                            />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
                              <span className="text-white text-xs font-bold uppercase tracking-widest">{img.label}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="space-y-8">
                    <button onClick={() => setViewingMaterial(null)} className="flex items-center gap-2 text-slate-400 hover:text-[#002147] font-bold uppercase tracking-widest transition-colors">
                      <ArrowLeft className="w-5 h-5" /> Back
                    </button>
                    <div className="bg-white rounded-[40px] border border-slate-200 shadow-2xl overflow-hidden">
                      <div className="p-8 md:p-16">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 mb-12">
                          <h1 className="text-4xl font-black uppercase tracking-tighter">{viewingMaterial.title}</h1>
                          <div className="flex bg-slate-100 p-1.5 rounded-2xl">
                            {(['summary', 'flashcards', 'quiz'] as const).map((tab) => (
                              <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={cn(
                                  "px-8 py-3 rounded-xl text-sm font-bold uppercase tracking-widest transition-all",
                                  activeTab === tab ? "bg-[#002147] text-white shadow-xl" : "text-slate-500 hover:bg-white"
                                )}
                              >
                                {tab}
                              </button>
                            ))}
                          </div>
                        </div>
                        
                        <div className="min-h-[400px]">
                          {activeTab === 'summary' && (
                            <div className="prose prose-slate max-w-none prose-headings:font-black prose-headings:uppercase prose-p:text-xl prose-p:leading-relaxed">
                              <Markdown>{viewingMaterial.summary}</Markdown>
                            </div>
                          )}
                          {activeTab === 'flashcards' && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                              {viewingMaterial.flashcards.map((card, i) => <Flashcard key={i} card={card} />)}
                            </div>
                          )}
                          {activeTab === 'quiz' && (
                            <div className="max-w-3xl mx-auto space-y-16">
                              {viewingMaterial.quiz.map((q, i) => <QuizQuestion key={i} question={q} index={i} />)}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            ) : currentSection === 'solver' ? (
              <motion.div key="solver" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-12">
                <div className="space-y-2">
                  <h2 className="text-5xl font-black tracking-tighter uppercase text-[#002147]">Assignment Solver</h2>
                  <p className="text-slate-500 text-lg">Paste your question and get a detailed, step-by-step solution.</p>
                </div>
                <div className="bg-white rounded-[40px] border border-slate-200 shadow-2xl p-8 md:p-12 space-y-8 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-96 h-96 -mr-32 -mt-32 opacity-[0.05] pointer-events-none">
                    <img src={IMAGES.library} className="w-full h-full object-cover rounded-full" alt="Library" referrerPolicy="no-referrer" />
                  </div>
                  <div className="relative space-y-8">
                    <div className="relative">
                      <textarea 
                        value={solverInput}
                        onChange={(e) => setSolverInput(e.target.value)}
                        placeholder="Enter your assignment question here..."
                        className="w-full h-64 p-8 bg-slate-50 rounded-[32px] border-none focus:ring-4 focus:ring-[#002147]/10 text-xl resize-none"
                      />
                      <label className="absolute bottom-6 right-6 p-4 bg-white shadow-xl rounded-2xl cursor-pointer hover:scale-110 transition-transform group">
                        <FileUp className="w-6 h-6 text-[#002147]" />
                        <input type="file" className="hidden" onChange={(e) => handleGenericFileUpload(e, 'solver')} accept=".pdf,.doc,.docx,.txt,image/*" />
                        <div className="absolute bottom-full right-0 mb-2 px-3 py-1 bg-[#002147] text-white text-[10px] font-bold uppercase tracking-widest rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                          Upload File
                        </div>
                      </label>
                    </div>
                    <button 
                      onClick={handleSolve}
                      disabled={isProcessing || !solverInput}
                      className="w-full py-6 bg-[#002147] text-white rounded-[24px] font-black text-2xl uppercase tracking-tighter shadow-2xl hover:bg-[#003366] transition-all disabled:opacity-50"
                    >
                      {isProcessing ? <Loader2 className="w-8 h-8 animate-spin mx-auto" /> : 'Solve Assignment'}
                    </button>
                  </div>
                  {solverResult && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pt-8 border-t border-slate-100">
                      <div className="text-xs font-bold uppercase tracking-widest text-[#002147] mb-6">Solution</div>
                      <div className="prose prose-slate max-w-none prose-p:text-lg">
                        <Markdown>{solverResult}</Markdown>
                      </div>
                    </motion.div>
                  )}
                </div>
              </motion.div>
            ) : currentSection === 'humanizer' ? (
              <motion.div key="humanizer" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-12">
                <div className="space-y-2">
                  <h2 className="text-5xl font-black tracking-tighter uppercase text-[#002147]">AI Humanizer</h2>
                  <p className="text-slate-500 text-lg">Transform robotic AI text into natural, human-like writing.</p>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="bg-white rounded-[40px] border border-slate-200 shadow-xl p-8 space-y-6 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 -mr-24 -mt-24 opacity-[0.03] pointer-events-none">
                      <img src={IMAGES.law} className="w-full h-full object-cover rounded-full" alt="Law" referrerPolicy="no-referrer" />
                    </div>
                    <div className="text-xs font-bold uppercase tracking-widest text-slate-400">Input Text</div>
                    <div className="relative">
                      <textarea 
                        value={humanizerInput}
                        onChange={(e) => setHumanizerInput(e.target.value)}
                        placeholder="Paste AI-generated text here..."
                        className="w-full h-96 p-6 bg-slate-50 rounded-[24px] border-none focus:ring-4 focus:ring-[#002147]/10 text-lg resize-none"
                      />
                      <label className="absolute bottom-4 right-4 p-3 bg-white shadow-lg rounded-xl cursor-pointer hover:scale-110 transition-transform group">
                        <Upload className="w-5 h-5 text-[#002147]" />
                        <input type="file" className="hidden" onChange={(e) => handleGenericFileUpload(e, 'humanizer')} accept=".pdf,.doc,.docx,.txt,image/*" />
                      </label>
                    </div>
                    <div className="flex gap-4">
                      <button 
                        onClick={handleHumanize}
                        disabled={isProcessing || !humanizerInput}
                        className="flex-1 py-5 bg-[#002147] text-white rounded-2xl font-bold uppercase tracking-widest shadow-lg hover:bg-[#003366] transition-all disabled:opacity-50"
                      >
                        {isProcessing ? <Loader2 className="w-6 h-6 animate-spin mx-auto" /> : 'Humanize'}
                      </button>
                      <button 
                        onClick={async () => {
                          if (!humanizerInput || !(await useTrial('humanizer'))) return;
                          setIsProcessing(true);
                          const res = await paraphraseText(humanizerInput);
                          setHumanizerResult(res);
                          setIsProcessing(false);
                        }}
                        disabled={isProcessing || !humanizerInput}
                        className="flex-1 py-5 bg-white border-2 border-[#002147] text-[#002147] rounded-2xl font-bold uppercase tracking-widest hover:bg-slate-50 transition-all disabled:opacity-50"
                      >
                        Paraphrase
                      </button>
                    </div>
                  </div>
                  <div className="bg-[#002147] rounded-[40px] shadow-2xl p-8 space-y-6 text-white">
                    <div className="text-xs font-bold uppercase tracking-widest text-white/40">Result</div>
                    <div className="h-96 overflow-y-auto pr-4 custom-scrollbar text-lg leading-relaxed font-medium">
                      {humanizerResult || <span className="text-white/20 italic">Humanized text will appear here...</span>}
                    </div>
                    {humanizerResult && (
                      <button 
                        onClick={() => navigator.clipboard.writeText(humanizerResult)}
                        className="w-full py-4 bg-white/10 hover:bg-white/20 rounded-xl font-bold text-sm transition-all"
                      >
                        Copy to Clipboard
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div key="detector" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-12">
                <div className="space-y-2">
                  <h2 className="text-5xl font-black tracking-tighter uppercase text-[#002147]">AI Detector</h2>
                  <p className="text-slate-500 text-lg">Check if your assignment looks like it was written by a human or AI.</p>
                </div>
                <div className="bg-white rounded-[40px] border border-slate-200 shadow-2xl p-8 md:p-12 space-y-12 relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-96 h-96 -ml-32 -mt-32 opacity-[0.03] pointer-events-none">
                    <img src={IMAGES.business} className="w-full h-full object-cover rounded-full" alt="Business" referrerPolicy="no-referrer" />
                  </div>
                  <div className="relative space-y-12">
                    <div className="relative">
                      <textarea 
                        value={detectorInput}
                        onChange={(e) => setDetectorInput(e.target.value)}
                        placeholder="Paste text to analyze..."
                        className="w-full h-64 p-8 bg-slate-50 rounded-[32px] border-none focus:ring-4 focus:ring-[#002147]/10 text-xl resize-none"
                      />
                      <label className="absolute bottom-6 right-6 p-4 bg-white shadow-xl rounded-2xl cursor-pointer hover:scale-110 transition-transform group">
                        <FileUp className="w-6 h-6 text-[#002147]" />
                        <input type="file" className="hidden" onChange={(e) => handleGenericFileUpload(e, 'detector')} accept=".pdf,.doc,.docx,.txt,image/*" />
                      </label>
                    </div>
                    <button 
                      onClick={handleDetect}
                      disabled={isProcessing || !detectorInput}
                      className="w-full py-6 bg-[#002147] text-white rounded-[24px] font-black text-2xl uppercase tracking-tighter shadow-2xl hover:bg-[#003366] transition-all disabled:opacity-50"
                    >
                      {isProcessing ? <Loader2 className="w-8 h-8 animate-spin mx-auto" /> : 'Analyze Content'}
                    </button>
                  </div>
                  
                  {detectorResult && (
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-1 md:grid-cols-2 gap-12 pt-12 border-t border-slate-100">
                      <div className="space-y-8">
                        <div className="flex items-center justify-between">
                          <div className="space-y-1">
                            <div className="text-4xl font-black text-[#002147]">{detectorResult.humanPercentage}%</div>
                            <div className="text-xs font-bold uppercase tracking-widest text-slate-400">Human Written</div>
                          </div>
                          <div className="space-y-1 text-right">
                            <div className="text-4xl font-black text-rose-500">{detectorResult.aiPercentage}%</div>
                            <div className="text-xs font-bold uppercase tracking-widest text-slate-400">AI Generated</div>
                          </div>
                        </div>
                        <div className="h-4 w-full bg-slate-100 rounded-full overflow-hidden flex">
                          <div className="h-full bg-[#002147] transition-all duration-1000" style={{ width: `${detectorResult.humanPercentage}%` }} />
                          <div className="h-full bg-rose-500 transition-all duration-1000" style={{ width: `${detectorResult.aiPercentage}%` }} />
                        </div>
                      </div>
                      <div className="bg-slate-50 p-8 rounded-[32px] space-y-4">
                        <div className="flex items-center gap-2 text-[#002147]">
                          <ShieldCheck className="w-6 h-6" />
                          <span className="font-bold uppercase tracking-widest text-sm">AI Analysis</span>
                        </div>
                        <p className="text-slate-600 leading-relaxed font-medium italic">
                          "{detectorResult.analysis}"
                        </p>
                      </div>
                    </motion.div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Premium Modal */}
      <AnimatePresence>
        {showPremiumModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowPremiumModal(false)} className="absolute inset-0 bg-[#002147]/60 backdrop-blur-xl" />
            <motion.div initial={{ opacity: 0, scale: 0.9, y: 40 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 40 }} className="relative w-full max-w-2xl bg-white rounded-[48px] shadow-2xl overflow-hidden">
              <div className="grid grid-cols-1 md:grid-cols-2">
                <div className="bg-[#002147] p-12 text-white space-y-8">
                  <div className="w-16 h-16 bg-white/10 rounded-3xl flex items-center justify-center">
                    <Sparkles className="w-8 h-8 text-white" />
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-4xl font-black uppercase tracking-tighter">Go Premium</h2>
                    <p className="text-white/60 text-lg">Unlock the full power of Legon Mate.</p>
                  </div>
                  <div className="space-y-4">
                    {["Unlimited Solver", "Unlimited Humanizer", "Unlimited Detector", "Large File Support", "Priority AI"].map((b, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                        <span className="font-bold text-white/80">{b}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="p-12 space-y-8">
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <div className="text-sm font-bold uppercase tracking-widest text-slate-400">Monthly Plan</div>
                      <div className="text-4xl font-black text-[#002147]">GH₵ 40.00</div>
                    </div>
                    <button onClick={() => setShowPremiumModal(false)} className="p-2 text-slate-300 hover:text-slate-900"><X className="w-8 h-8" /></button>
                  </div>

                  <div className="space-y-4">
                    <div className="p-6 bg-slate-50 rounded-3xl border-2 border-slate-100 flex items-center gap-4">
                      <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm">
                        <CreditCard className="w-6 h-6 text-[#002147]" />
                      </div>
                      <div className="flex-1">
                        <div className="font-bold">Mobile Money</div>
                        <div className="text-xs text-slate-400">Instant Activation</div>
                      </div>
                    </div>
                  </div>

                  <button 
                    onClick={handleUpgrade}
                    className="w-full py-6 bg-[#002147] text-white rounded-[24px] font-black text-xl uppercase tracking-tighter shadow-2xl hover:scale-[1.02] transition-all"
                  >
                    Pay & Unlock Now
                  </button>
                  <p className="text-center text-xs text-slate-400">
                    Secure payment link generated for 0592356211.
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style>{`
        .perspective-1000 { perspective: 1000px; }
        .preserve-3d { transform-style: preserve-3d; }
        .backface-hidden { backface-visibility: hidden; }
        .rotate-y-180 { transform: rotateY(180deg); }
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
      `}</style>
      </div>
    </div>
  );
}

function Flashcard({ card }: { card: { question: string, answer: string } }) {
  const [isFlipped, setIsFlipped] = useState(false);
  return (
    <div onClick={() => setIsFlipped(!isFlipped)} className="h-80 perspective-1000 cursor-pointer group">
      <motion.div animate={{ rotateY: isFlipped ? 180 : 0 }} transition={{ duration: 0.6, type: "spring", stiffness: 260, damping: 20 }} className="relative w-full h-full preserve-3d">
        <div className="absolute inset-0 backface-hidden bg-white border-2 border-slate-100 rounded-[32px] p-10 flex flex-col items-center justify-center text-center shadow-sm group-hover:shadow-xl transition-all">
          <div className="text-xs font-bold text-[#002147] uppercase tracking-widest mb-6">Question</div>
          <p className="text-2xl font-black text-slate-800 leading-tight">{card.question}</p>
          <div className="mt-10 text-xs text-slate-300 font-bold uppercase tracking-widest">Tap to reveal</div>
        </div>
        <div className="absolute inset-0 backface-hidden bg-[#002147] border-2 border-[#002147] rounded-[32px] p-10 flex flex-col items-center justify-center text-center shadow-2xl rotate-y-180">
          <div className="text-xs font-bold text-white/40 uppercase tracking-widest mb-6">Answer</div>
          <p className="text-2xl font-bold text-white leading-relaxed">{card.answer}</p>
          <div className="mt-10 text-xs text-white/20 font-bold uppercase tracking-widest">Tap to flip back</div>
        </div>
      </motion.div>
    </div>
  );
}

function QuizQuestion({ question, index }: { question: any, index: number }) {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const isCorrect = selectedOption === question.correctAnswer;
  return (
    <div className="space-y-8">
      <div className="flex gap-6">
        <div className="w-14 h-14 bg-[#002147] text-white rounded-2xl flex items-center justify-center flex-shrink-0 font-black text-2xl shadow-lg">
          {index + 1}
        </div>
        <h3 className="text-2xl font-black pt-2 leading-tight">{question.question}</h3>
      </div>
      <div className="grid grid-cols-1 gap-4 pl-20">
        {question.options.map((option: string) => (
          <button
            key={option}
            onClick={() => setSelectedOption(option)}
            disabled={selectedOption !== null}
            className={cn(
              "w-full p-6 rounded-[24px] text-left font-bold text-lg transition-all border-2",
              selectedOption === null && "bg-white border-slate-100 hover:border-[#002147] hover:bg-slate-50",
              selectedOption === option && isCorrect && "bg-emerald-50 border-emerald-500 text-emerald-700",
              selectedOption === option && !isCorrect && "bg-rose-50 border-rose-500 text-rose-700",
              selectedOption !== null && option === question.correctAnswer && !isCorrect && "bg-emerald-50 border-emerald-500 text-emerald-700",
              selectedOption !== null && selectedOption !== option && option !== question.correctAnswer && "bg-slate-50 border-slate-50 text-slate-400"
            )}
          >
            <div className="flex items-center justify-between">
              <span>{option}</span>
              {selectedOption === option && (isCorrect ? <CheckCircle2 className="w-6 h-6" /> : <X className="w-6 h-6" />)}
              {selectedOption !== null && option === question.correctAnswer && !isCorrect && <CheckCircle2 className="w-6 h-6" />}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
