/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import {
  FileText,
  FileCode,
  Check,
  Copy,
  Download,
  Trash2,
  PlusCircle,
  Sparkles,
  Loader2,
  UploadCloud,
  BookOpen,
  ArrowRight,
  RefreshCw,
  FolderOpen,
  AlertCircle,
  Menu,
  X,
  FileCheck,
  ExternalLink,
  ChevronRight,
  LogOut,
  Mail,
  Cloud,
  Lock,
  Shield,
  User,
  Database
} from "lucide-react";
import { SavedProject } from "./types";
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  doc, 
  setDoc, 
  deleteDoc,
  getDocFromServer
} from "firebase/firestore";
import { signInWithPopup, onAuthStateChanged, signOut as firebaseSignOut } from "firebase/auth";
import { db, auth, googleProvider, handleFirestoreError, OperationType } from "./firebase";

export default function App() {
  // User Authentication State
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [loginEmailInput, setLoginEmailInput] = useState<string>("parthapratimnath51@gmail.com"); // Prefill for frictionless launch
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Application State
  const [projects, setProjects] = useState<SavedProject[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [docTitle, setDocTitle] = useState<string>("");
  const [inputText, setInputText] = useState<string>("");
  const [latexCode, setLatexCode] = useState<string>("");
  const [convertMode, setConvertMode] = useState<"ai" | "local">("ai");
  const [inputTab, setInputTab] = useState<"editor" | "upload">("editor");

  // Status & UI State
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isParsingFile, setIsParsingFile] = useState<boolean>(false);
  const [isConverting, setIsConverting] = useState<boolean>(false);
  const [parsingError, setParsingError] = useState<string | null>(null);
  const [conversionError, setConversionError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  
  // Custom dialog notifications (bypasses iframe block on alert/confirm)
  const [modalAlert, setModalAlert] = useState<{ title: string; message: string } | null>(null);
  const [projectToDelete, setProjectToDelete] = useState<string | null>(null);
  
  // App system connection alert
  const [hasGemini, setHasGemini] = useState<boolean>(true);

  // File Ref for click uploads
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Loading phase messages for pleasant user feedback
  const [loadingPhase, setLoadingPhase] = useState<string>("");

  // Check Firestore connectivity & state on mount
  useEffect(() => {
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, "test", "connection"));
        console.log("Firestore connection check completed successfully.");
      } catch (error: any) {
        if (error instanceof Error && error.message.includes("offline")) {
          console.warn("Firestore appears offline. Local fallback operation will run.");
        }
      }
    };
    testConnection();
  }, []);

  // Monitor Active Firebase Auth Sessions
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        const email = firebaseUser.email || "authenticated_user";
        setUserEmail(email);
        localStorage.setItem("latexforge_user_email", email);
        fetchFirestoreProjects(firebaseUser.uid, email);
      } else {
        // Fallback to legacy mail if no Firebase session is active
        const storedEmail = localStorage.getItem("latexforge_user_email");
        if (storedEmail) {
          setUserEmail(storedEmail.trim());
          fetchLegacyProjects(storedEmail.trim());
        } else {
          setUserEmail(null);
          setProjects([]);
          startNewProject();
        }
      }
    });
    return () => unsubscribe();
  }, []);

  // Fetch documents from cloud-hosted Firestore database
  const fetchFirestoreProjects = async (uid: string, email: string) => {
    setIsSyncing(true);
    const pathName = "projects";
    try {
      const q = query(
        collection(db, pathName),
        where("userId", "==", uid)
      );
      const querySnapshot = await getDocs(q);
      const fetched: SavedProject[] = [];
      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        fetched.push({
          id: data.id,
          title: data.title || "Untitled LaTeX Document",
          inputText: data.inputText || "",
          latexCode: data.latexCode || "",
          mode: (data.mode as "ai" | "local") || "ai",
          updatedAt: data.updatedAt || Date.now(),
        });
      });

      const sorted = fetched.sort((a, b) => b.updatedAt - a.updatedAt);
      setProjects(sorted);
      
      // Sync local storage partition
      localStorage.setItem(`latex_converter_projects_${email}`, JSON.stringify(sorted));

      if (sorted.length > 0) {
        loadProject(sorted[0]);
      } else {
        startNewProject();
      }
    } catch (error: any) {
      console.error("Firestore fetch error, fallback active:", error);
      handleFirestoreError(error, OperationType.GET, pathName);
    } finally {
      setIsSyncing(false);
    }
  };

  // Legacy fetch of projects from localStorage / Custom REST API
  const fetchLegacyProjects = async (email: string) => {
    setIsSyncing(true);
    const cleanMail = email.trim().toLowerCase();
    try {
      const response = await fetch(`/api/projects?email=${encodeURIComponent(cleanMail)}`);
      if (response.ok) {
        const data = await response.json();
        setProjects(data.projects);
        localStorage.setItem(`latex_converter_projects_${cleanMail}`, JSON.stringify(data.projects));
        if (data.projects.length > 0) {
          const sorted = [...data.projects].sort((a, b) => b.updatedAt - a.updatedAt);
          loadProject(sorted[0]);
        } else {
          startNewProject();
        }
      } else {
        throw new Error("API call failed");
      }
    } catch (e) {
      console.warn("JSON server offline, retrieving from cached local data:", e);
      const cached = localStorage.getItem(`latex_converter_projects_${cleanMail}`);
      if (cached) {
        const parsed = JSON.parse(cached) as SavedProject[];
        setProjects(parsed);
        if (parsed.length > 0) {
          const sorted = [...parsed].sort((a, b) => b.updatedAt - a.updatedAt);
          loadProject(sorted[0]);
        } else {
          startNewProject();
        }
      } else {
        setProjects([]);
        startNewProject();
      }
    } finally {
      setIsSyncing(false);
    }
  };

  // Google Authentication popup trigger
  const handleGoogleSignIn = async () => {
    setAuthError(null);
    try {
      setIsSyncing(true);
      await signInWithPopup(auth, googleProvider);
    } catch (e: any) {
      console.error("Popup block or authentication failure:", e);
      setAuthError(e.message || "Failed to sign in with Google.");
    } finally {
      setIsSyncing(false);
    }
  };

  // Guest bypass sign-in handler
  const handleGuestSignIn = async () => {
    setAuthError(null);
    const guestEmail = "guest@latexforge.com";
    localStorage.setItem("latexforge_user_email", guestEmail);
    setUserEmail(guestEmail);
    await fetchLegacyProjects(guestEmail);
  };

  // Sign-in legacy authentication
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    const email = loginEmailInput.trim().toLowerCase();
    
    if (!email) {
      setAuthError("Please search or specify your Gmail address.");
      return;
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setAuthError("Please write a valid Gmail or work email address.");
      return;
    }

    localStorage.setItem("latexforge_user_email", email);
    setUserEmail(email);
    await fetchLegacyProjects(email);
  };

  // Sign out user
  const handleSignOut = async () => {
    try {
      await firebaseSignOut(auth);
    } catch (err) {
      console.error("Firebase Signout error:", err);
    }
    localStorage.removeItem("latexforge_user_email");
    setUserEmail(null);
    setProjects([]);
    startNewProject();
  };

  // Setup sample document
  const startNewProject = (clean = false) => {
    setCurrentProjectId(null);
    if (clean) {
      setDocTitle("Untitled LaTeX Document");
      setInputText("");
    } else {
      setDocTitle("My Document Title");
      setInputText(
        `# Dynamic Physics & Mathematics Analysis

This is a comprehensive scientific analysis designed for direct conversion into Overleaf LaTeX typesetting.

## Mathematical Formulations
When converting under AI mode, written equations like these will automatically format into mathematical tags:
- Einstein's relation: Energy equals mass times light speed squared (E = mc^2)
- Integral relation: Integrating e raised to the power of negative x with respect to x from 0 to infinity equals 1
- Quadratic formula: x equals minus b plus or minus square root of b squared minus 4ac, all divided by 2a

## Experimental Data Table
We have evaluated materials under two trials:
- Silicon chips exhibited 98.4% productivity in Trial A and 99.1% productivity in Trial B.
- Germanium fibers exhibited 87.2% and 91.5% productivity under identical trial conditions.

## Important Requirements
Make sure to escape special characters inside the text body under standard compilation, such as percentage signs (e.g. 50% improvement) or currency calculations (e.g. costing $100 per license).`
      );
    }
    setLatexCode("");
    setConversionError(null);
    setParsingError(null);
  };

  // Load selected project
  const loadProject = (p: SavedProject) => {
    setCurrentProjectId(p.id);
    setDocTitle(p.title);
    setInputText(p.inputText);
    setLatexCode(p.latexCode);
    setConvertMode(p.mode);
    setConversionError(null);
    setParsingError(null);
  };

  // Save Current Project - with cloud synchronization
  const handleSaveProject = async () => {
    if (!docTitle.trim()) {
      setModalAlert({
        title: "Missing Document Title",
        message: "Please specify a document title to save your work.",
      });
      return;
    }
    if (!userEmail) {
      setModalAlert({
        title: "Authentication Required",
        message: "Please sign in to save your workspace.",
      });
      return;
    }

    const now = Date.now();
    let updated: SavedProject[] = [];
    let targetProj: SavedProject;
    
    const projId = currentProjectId || `proj_${now}`;

    if (currentProjectId) {
      // Edit existing
      updated = projects.map((p) => {
        if (p.id === currentProjectId) {
          const updatedProj = {
            ...p,
            title: docTitle.trim(),
            inputText: inputText,
            latexCode: latexCode,
            mode: convertMode,
            updatedAt: now,
          };
          targetProj = updatedProj;
          return updatedProj;
        }
        return p;
      });
      targetProj = updated.find((p) => p.id === currentProjectId) as SavedProject;
    } else {
      // Create new
      targetProj = {
        id: projId,
        title: docTitle.trim(),
        inputText: inputText,
        latexCode: latexCode,
        mode: convertMode,
        updatedAt: now,
      };
      updated = [targetProj, ...projects];
      setCurrentProjectId(projId);
    }

    // Save to Local Partition First
    setProjects(updated);
    const activeEmail = userEmail || auth.currentUser?.email || "anonymous";
    localStorage.setItem(`latex_converter_projects_${activeEmail}`, JSON.stringify(updated));

    // Async Cloud Storage save / local backup save
    if (auth.currentUser) {
      setIsSyncing(true);
      const pathStr = `projects/${projId}`;
      try {
        await setDoc(doc(db, "projects", projId), {
          id: projId,
          userId: auth.currentUser.uid,
          userEmail: auth.currentUser.email || "",
          title: targetProj.title,
          inputText: targetProj.inputText,
          latexCode: targetProj.latexCode,
          mode: targetProj.mode,
          updatedAt: now,
        });
      } catch (error) {
        console.error("Cloud database save failed:", error);
        handleFirestoreError(error, OperationType.WRITE, pathStr);
      } finally {
        setIsSyncing(false);
      }
    } else if (userEmail && userEmail !== "anonymous") {
      try {
        setIsSyncing(true);
        const res = await fetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: userEmail,
            project: targetProj,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          setProjects(data.projects);
          localStorage.setItem(`latex_converter_projects_${userEmail}`, JSON.stringify(data.projects));
        }
      } catch (e) {
        console.error("Local partition sync delay:", e);
      } finally {
        setIsSyncing(false);
      }
    }

    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  // Delete project (direct non-blocking call triggered after custom confirmation)
  const handleDeleteProject = async (id: string) => {
    if (!userEmail) return;

    const filtered = projects.filter((p) => p.id !== id);
    setProjects(filtered);
    const activeEmail = userEmail || auth.currentUser?.email || "anonymous";
    localStorage.setItem(`latex_converter_projects_${activeEmail}`, JSON.stringify(filtered));
    
    // Transition loaded project if deleting active
    if (currentProjectId === id) {
      if (filtered.length > 0) {
        loadProject(filtered[0]);
      } else {
        startNewProject(true); // completely clear workspace from screen
      }
    }

    // Sync deletion with Cloud Firestore / JSON Server
    if (auth.currentUser) {
      setIsSyncing(true);
      const pathStr = `projects/${id}`;
      try {
        await deleteDoc(doc(db, "projects", id));
      } catch (error) {
        console.error("Cloud database deletion failed:", error);
        handleFirestoreError(error, OperationType.DELETE, pathStr);
      } finally {
        setIsSyncing(false);
      }
    } else {
      try {
        setIsSyncing(true);
        const res = await fetch("/api/projects/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: userEmail,
            projectId: id,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          setProjects(data.projects);
          localStorage.setItem(`latex_converter_projects_${userEmail}`, JSON.stringify(data.projects));
          
          // Re-evaluate current active project to prevent stale view
          if (currentProjectId === id) {
            if (data.projects && data.projects.length > 0) {
              loadProject(data.projects[0]);
            } else {
              startNewProject(true);
            }
          }
        }
      } catch (e) {
        console.error("Local deletion sync delay:", e);
      } finally {
        setIsSyncing(false);
      }
    }
  };

  // Copy to Clipboard
  const handleCopyToClipboard = () => {
    if (!latexCode) return;
    navigator.clipboard.writeText(latexCode)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch((err) => {
         console.error("Clipboard copy failed:", err);
      });
  };

  // Trigger Local File Download (.tex)
  const handleDownloadFile = () => {
    if (!latexCode) return;
    const element = document.createElement("a");
    const file = new Blob([latexCode], { type: "text/plain;charset=utf-8" });
    element.href = URL.createObjectURL(file);
    const sanitizedTitle = docTitle.toLowerCase().replace(/[^a-z0-9]/gi, "_") || "document";
    element.download = `${sanitizedTitle}.tex`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  // File Upload API Post
  const handleFileUpload = async (file: File) => {
    setParsingError(null);
    setIsParsingFile(true);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/parse-document", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "File parsing failed.");
      }

      const data = await response.json();
      
      // Load file into input editor
      setInputText(data.text);
      
      // Auto assign document title
      let baseName = file.name;
      const lastDot = baseName.lastIndexOf(".");
      if (lastDot !== -1) {
        baseName = baseName.substring(0, lastDot);
      }
      setDocTitle(baseName);
      
      // Focus on editor
      setInputTab("editor");
    } catch (error: any) {
      console.error(error);
      setParsingError(error.message || "Unable to extract text from this document.");
    } finally {
      setIsParsingFile(false);
    }
  };

  // Drag and drop events
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const firstFile = files[0];
      const ext = firstFile.name.substring(firstFile.name.lastIndexOf(".")).toLowerCase();
      if (ext === ".txt" || ext === ".docx") {
        handleFileUpload(firstFile);
      } else {
        setParsingError("Invalid file type. Please construct with .txt or .docx documents.");
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileUpload(files[0]);
    }
  };

  // Convert to Latex API Post
  const handleConvertLatex = async () => {
    if (!inputText.trim()) {
      setConversionError("Input workspace is empty. Please write some raw content or upload a document first.");
      return;
    }

    setConversionError(null);
    setIsConverting(true);

    // Dynamic messaging rotation during generation
    const stages = [
      "Analyzing document structures...",
      "Escaping special character notations safely...",
      "Synthesizing standard packages & imports...",
    ];
    if (convertMode === "ai") {
      stages.push(
        "Interpreting formulas and layout mappings via Gemini AI...",
        "Validating mathematical syntax and equation matrices...",
        "Formulating Overleaf compatible outputs..."
      );
    } else {
      stages.push(
        "Applying regex structure mappings...",
        "Building bullet-proof tabular layouts..."
      );
    }

    let stageIdx = 0;
    setLoadingPhase(stages[0]);
    const timer = setInterval(() => {
      stageIdx = (stageIdx + 1) % stages.length;
      setLoadingPhase(stages[stageIdx]);
    }, 1800);

    try {
      const response = await fetch("/api/convert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: inputText,
          mode: convertMode,
          documentTitle: docTitle,
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Latex translation failed.");
      }

      const data = await response.json();
      setLatexCode(data.latex);
      
      if (data.warning) {
        setConversionError(data.warning);
        setHasGemini(false);
      } else if (data.error) {
        setConversionError(data.error);
      }
    } catch (error: any) {
      console.error(error);
      setConversionError(error.message || "An unexpected error occurred during LaTeX translation.");
    } finally {
      clearInterval(timer);
      setIsConverting(false);
    }
  };

  if (!userEmail) {
    return (
      <div className="min-h-screen bg-slate-100 text-slate-800 font-sans flex flex-col justify-center items-center p-4 sm:p-6 antialiased">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-xl p-8 relative overflow-hidden transition-all duration-300">
          
          {/* Top accent accent */}
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-indigo-600"></div>

          <div className="text-center mb-8">
            <div className="mx-auto w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600 mb-4 shadow-sm">
              <FileCode className="w-6 h-6" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Sign In to LaTeXForge</h2>
            <p className="text-xs text-slate-500 mt-2">
              Access your personalized workspace and secure your scientific TeX working histories.
            </p>
          </div>

          {authError && (
            <div className="mb-5 p-3 rounded-lg bg-rose-50 border border-rose-100 text-rose-800 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <span>{authError}</span>
            </div>
          )}

          {/* Primary: Real Google Sign-In with Firebase Auth */}
          <div className="space-y-4">
            <button
              onClick={handleGoogleSignIn}
              id="btn_google_signin"
              className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-lg transition-all shadow-sm active:scale-[0.99] cursor-pointer flex items-center justify-center gap-2.5 border border-slate-800"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22c-.43-.63-.74-1.34-.81-2.18l1.62-1.45z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335" />
              </svg>
              <span>Sign In with Google</span>
            </button>

            <div className="flex items-center my-4 justify-between text-[10px] text-slate-400 font-bold uppercase tracking-wider select-none">
              <span className="w-5/12 h-[1px] bg-slate-200"></span>
              <span>or</span>
              <span className="w-5/12 h-[1px] bg-slate-200"></span>
            </div>

            <button
              onClick={handleGuestSignIn}
              id="btn_guest_signin"
              className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 font-bold text-xs rounded-lg border border-slate-200 transition-all shadow-xs cursor-pointer flex items-center justify-center gap-2"
            >
              <User className="w-3.5 h-3.5 text-slate-400" />
              <span>Continue as Guest</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-slate-50 text-slate-800 font-sans flex flex-col overflow-hidden antialiased">
      {/* APP HEADER */}
      <header className="bg-white border-b border-slate-200 shrink-0 px-6 py-3.5 flex items-center justify-between shadow-xs z-40">
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-1.5 hover:bg-slate-100 rounded-md transition-colors text-slate-500 hover:text-slate-700 cursor-pointer"
            title="Toggle past sessions sidebar"
            id="btn_toggle_sidebar"
          >
            <Menu className="w-5 h-5" />
          </button>
          
          <div className="flex items-center space-x-2.5">
            <div className="bg-indigo-600 text-white p-1.5 rounded flex items-center justify-center">
              <FileCode className="w-4.5 h-4.5" />
            </div>
            <div>
              <h1 className="font-bold text-slate-900 tracking-tight text-base sm:text-lg flex items-center gap-1.5">
                LaTeXForge
              </h1>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <div className="hidden sm:flex flex-col items-end text-right">
            <p className="text-xs font-semibold text-slate-800 truncate max-w-[180px]" title={userEmail || ""}>
              {userEmail}
            </p>
            <span className="text-[10px] text-emerald-600 font-bold tracking-wider uppercase flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Workspace Synced
            </span>
          </div>

          <button
            onClick={handleSignOut}
            className="p-1.5 hover:bg-slate-100 hover:text-red-650 text-slate-450 rounded transition-colors cursor-pointer"
            title="Sign out of workspace"
            id="btn_auth_logout"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* CORE WORKSPACE SPLIT */}
      <div className="flex-1 flex overflow-hidden relative">
        
        {/* SIDEBAR: SAVED WORK */}
        <aside
          className={`bg-white border-r border-slate-200 w-72 flex flex-col shrink-0 transition-all duration-300 z-30 absolute md:static h-full ${
            isSidebarOpen ? "translate-x-0" : "-translate-x-full md:-ml-72"
          }`}
        >
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center space-x-2 text-slate-700">
              <FolderOpen className="w-4.5 h-4.5 text-indigo-600" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Saved Projects</span>
            </div>
            <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-bold">
              {projects.length}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
            {projects.length === 0 ? (
              <div className="text-center py-10 px-4 text-slate-400">
                <FileText className="w-8 h-8 mx-auto stroke-1 mb-2.5 opacity-40 text-indigo-600" />
                <p className="text-xs font-semibold">No saved documents yet</p>
                <p className="text-[10px] text-slate-400 mt-1">Convert or draft raw text to auto-save files.</p>
              </div>
            ) : (
              projects.map((proj) => {
                const isActive = currentProjectId === proj.id;
                return (
                  <div
                    key={proj.id}
                    onClick={() => loadProject(proj)}
                    className={`w-full text-left px-3 py-2.5 rounded flex items-center justify-between cursor-pointer group transition-all border-l-4 ${
                      isActive
                        ? "bg-indigo-50 border-indigo-600 text-indigo-700 font-semibold"
                        : "border-transparent hover:bg-slate-50 text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <div className="flex items-center space-x-2 min-w-0 flex-1">
                      <FileCheck className={`w-4 h-4 shrink-0 ${isActive ? "text-indigo-600" : "text-slate-400"}`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium truncate">
                           {proj.title}
                        </p>
                        <p className="text-[9px] text-slate-400 font-mono mt-0.5">
                          {new Date(proj.updatedAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        setProjectToDelete(proj.id);
                      }}
                      className="p-1.5 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded transition-all opacity-65 group-hover:opacity-100 cursor-pointer relative z-10 shrink-0"
                      title="Delete saved document"
                      id={`btn_delete_proj_${proj.id}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>

          <div className="p-4 bg-slate-50 border-t border-slate-200">
            <div className="flex items-center gap-3 px-2">
              <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-xs font-bold uppercase shrink-0">
                {userEmail ? userEmail.substring(0, 2) : "US"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-slate-800 truncate" title={userEmail || ""}>
                  {userEmail}
                </p>
                <div className="flex items-center gap-1 text-[10px] text-slate-500">
                  {isSyncing ? (
                    <>
                      <Loader2 className="w-2.5 h-2.5 text-indigo-500 animate-spin" />
                      <span>Syncing Cloud...</span>
                    </>
                  ) : (
                    <>
                      <Cloud className="w-3.5 h-3.5 text-emerald-500" />
                      <span>Workspace Synced</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* MAIN CONVERSION WORKSPACE */}
        <main className="flex-1 flex flex-col h-full bg-slate-50 p-6 overflow-y-auto">
          
          {/* HEADER ROW WITH CONTROLS */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 shrink-0">
            <div className="flex-1 min-w-0">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-0.5">Project Workspace</span>
              <input
                type="text"
                className="bg-transparent text-slate-800 font-bold text-lg sm:text-xl border-b border-dashed border-slate-300 hover:border-slate-500 focus:border-indigo-600 focus:outline-none pb-0.5 w-full transition-all max-w-sm sm:max-w-md"
                value={docTitle}
                onChange={(e) => setDocTitle(e.target.value)}
                placeholder="My Document Title"
              />
            </div>
            
            <div className="flex gap-2 shrink-0 self-stretch sm:self-auto justify-end">
              <button 
                onClick={startNewProject}
                className="px-4 py-2 bg-white border border-slate-200 text-slate-600 text-xs sm:text-sm font-medium rounded hover:bg-slate-50 hover:text-slate-900 transition-colors cursor-pointer shadow-xs"
              >
                New Project
              </button>
              <button 
                onClick={handleSaveProject}
                className="px-4 py-2 bg-indigo-600 text-white text-xs sm:text-sm font-medium rounded shadow-sm hover:bg-indigo-700 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <span>Save Current Work</span>
                {saveSuccess && <Check className="w-3.5 h-3.5 text-emerald-300" />}
              </button>
            </div>
          </div>

          {/* TWO-COLUMN EDITING & COMPILATION CARDS */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 min-h-0 overflow-y-auto lg:overflow-hidden pb-4">
            
            {/* COLUMN 1: INTERACTIVE SOURCES */}
            <div className="flex flex-col gap-4 overflow-y-auto lg:overflow-hidden h-full min-h-[400px] lg:min-h-0">
              
              <div className="flex-1 flex flex-col bg-white border border-slate-200 rounded-lg shadow-xs overflow-hidden min-h-0">
                
                {/* Panel Header */}
                <div className="px-4 py-2 border-b border-slate-100 bg-slate-50 flex justify-between items-center text-xs font-semibold text-slate-500 uppercase shrink-0">
                  <div className="flex space-x-1">
                    <button
                      onClick={() => setInputTab("editor")}
                      className={`px-3 py-1 rounded font-bold transition-all cursor-pointer ${
                        inputTab === "editor"
                          ? "bg-indigo-50 border border-indigo-150 text-indigo-700"
                          : "text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      Editor View
                    </button>
                    <button
                      onClick={() => setInputTab("upload")}
                      className={`px-3 py-1 rounded font-bold transition-all cursor-pointer ${
                        inputTab === "upload"
                          ? "bg-indigo-50 border border-indigo-150 text-indigo-700"
                          : "text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      File Upload
                    </button>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {inputText.trim().split(/\s+/).filter(Boolean).length} words
                  </span>
                </div>

                {/* Content body based on tabs */}
                <div className="flex-1 flex flex-col overflow-y-auto relative min-h-[220px]">
                  {conversionError && (
                    <div className="m-4 p-3 bg-rose-50 border border-rose-100 text-rose-800 rounded-lg flex items-start space-x-2 text-xs">
                      <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                      <span>{conversionError}</span>
                    </div>
                  )}

                  {inputTab === "editor" ? (
                    <textarea
                      className="w-full flex-1 p-4 text-sm focus:outline-none resize-none font-sans leading-relaxed text-slate-800"
                      placeholder="Type or paste markdown headers, numerical lists or evaluations here..."
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                    />
                  ) : (
                    <div 
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                      className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-indigo-50/10 cursor-pointer"
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".txt,.docx"
                        className="hidden"
                        onChange={handleFileSelect}
                      />
                      
                      {isParsingFile ? (
                        <div className="text-center">
                          <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mx-auto mb-2.5" />
                          <p className="text-xs font-semibold text-slate-700">Extracting Word formatting...</p>
                        </div>
                      ) : (
                        <div className="text-center max-w-xs">
                          <UploadCloud className="w-10 h-10 text-indigo-400 mx-auto mb-2 animate-pulse" />
                          <p className="text-xs font-semibold text-indigo-700">Drop Word document or text file</p>
                          <p className="text-[11px] text-slate-400 mt-1">We parse headers & tables from .docx and .txt files</p>
                        </div>
                      )}

                      {parsingError && (
                        <div className="absolute bottom-4 left-4 right-4 p-2 bg-rose-50 border border-rose-100 text-rose-800 text-[11px] rounded flex items-center space-x-1.5">
                          <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                          <span>{parsingError}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>



              {/* LARGE CONVERSION RUN BUTTON */}
              <button
                onClick={handleConvertLatex}
                disabled={isConverting}
                className="w-full py-3.5 bg-indigo-600 text-white rounded-lg font-bold shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99] disabled:opacity-50"
              >
                {isConverting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Analyzing Syntax structures...</span>
                  </>
                ) : (
                  <>
                    <span>Convert to LaTeX</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

            </div>

            {/* COLUMN 2: LATEX TRANSLATION CODEBLOCK */}
            <div className="flex flex-col bg-slate-900 rounded-lg shadow-sm border border-slate-800 h-full min-h-[400px] lg:min-h-0 overflow-hidden">
              
              <div className="px-4 py-2 border-b border-slate-800 bg-slate-800 flex justify-between items-center text-xs font-semibold text-slate-400 uppercase shrink-0">
                <span>LaTeX Output</span>
                {latexCode && (
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={handleCopyToClipboard}
                      className="text-[10px] bg-slate-700 text-white px-2.5 py-1 rounded hover:bg-slate-600 transition-colors cursor-pointer"
                    >
                      {copied ? "Copied!" : "Copy to Clipboard"}
                    </button>
                    <button
                      onClick={handleDownloadFile}
                      className="text-[10px] bg-slate-700 text-white px-2.5 py-1 rounded hover:bg-slate-600 transition-colors cursor-pointer flex items-center gap-1"
                    >
                      <Download className="w-2.5 h-2.5" />
                      <span>Download</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Code viewer display block */}
              <div className="flex-1 p-4 overflow-y-auto font-mono text-xs select-text leading-relaxed relative min-h-[220px]">
                {isConverting ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-4 bg-slate-900/95 text-center">
                    <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mb-3.5" />
                    <p className="text-xs font-bold text-slate-300 tracking-wide uppercase">Translating System Files</p>
                    <span className="text-[10px] text-indigo-300 italic mt-1">{loadingPhase}</span>
                  </div>
                ) : latexCode ? (
                  <div className="flex items-start">
                    <div className="text-slate-600 pr-3.5 mr-3 border-r border-slate-800 text-right select-none font-mono text-[10px] space-y-0.5 pt-0.5 sticky top-0">
                      {latexCode.split("\n").map((_, i) => (
                        <div key={i} className="h-5">{i + 1}</div>
                      ))}
                    </div>
                    <pre className="text-indigo-300 leading-5 text-xs whitespace-pre flex-1">{latexCode}</pre>
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 p-8">
                    <FileText className="w-10 h-10 text-slate-700 mb-3" />
                    <p className="text-xs font-semibold text-slate-300">Ready to compile in Overleaf</p>
                    <p className="text-[11px] text-slate-500 mt-1.5 max-w-xs mx-auto">
                      Click the &quot;Convert to LaTeX&quot; trigger to view pristine mathematical frameworks and escaping configurations.
                    </p>
                  </div>
                )}
              </div>

              {/* PDFLaTeX guidelines layout banner */}
              <div className="p-3 bg-slate-800/60 border-t border-slate-800/85 flex justify-center text-[10px] text-slate-500 shrink-0 uppercase tracking-widest">
                Ready to compile in Overleaf
              </div>

            </div>

          </div>





        </main>

      </div>

      {/* CUSTOM CONFIRMATION DIALOG (MODAL) */}
      {projectToDelete && (
        <div id="delete_confirm_modal" className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 transition-all duration-200">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-sm w-full p-6 animate-in scale-in-95 duration-150 relative">
            <div className="text-center">
              <div className="mx-auto w-12 h-12 bg-rose-50 rounded-full flex items-center justify-center text-rose-600 mb-4">
                <Trash2 className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-900 mb-2">Delete Project?</h3>
              <p className="text-xs text-slate-500 mb-5 leading-relaxed">
                Are you sure you want to permanently delete this project? This action cannot be undone and will clear the workspace.
              </p>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setProjectToDelete(null)}
                  className="px-4 py-2 text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-850 rounded font-semibold transition-colors cursor-pointer"
                  id="btn_delete_cancel"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    handleDeleteProject(projectToDelete);
                    setProjectToDelete(null);
                  }}
                  className="px-4 py-2 text-xs bg-rose-600 hover:bg-rose-700 text-white rounded font-semibold transition-colors cursor-pointer"
                  id="btn_delete_confirm"
                >
                  Delete Document
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CUSTOM ALERT DIALOG (MODAL) */}
      {modalAlert && (
        <div id="alert_info_modal" className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 transition-all duration-200">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-sm w-full p-6 animate-in scale-in-95 duration-150 relative">
            <div className="text-center">
              <div className="mx-auto w-12 h-12 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-600 mb-4">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-900 mb-2">{modalAlert.title}</h3>
              <p className="text-xs text-slate-500 mb-5 leading-relaxed">
                {modalAlert.message}
              </p>
              <div className="flex justify-end">
                <button
                  onClick={() => setModalAlert(null)}
                  className="px-5 py-2 text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded font-semibold transition-colors cursor-pointer"
                  id="btn_alert_ok"
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
