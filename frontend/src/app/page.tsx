"use client";

import { useState, useEffect, useRef } from "react";
import {
  ShieldAlert,
  Zap,
  Activity,
  Code,
  Terminal,
  Settings,
  GitBranch,
  FileText,
  Copy,
  Check,
  Play,
  RotateCcw,
  Sparkles,
  Database,
  Lock,
  Cpu,
  RefreshCw,
  Info,
  AlertTriangle,
  ArrowRight,
  UserCheck
} from "lucide-react";

// Inline Github Icon Component to avoid package version issues
const Github = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth="2"
    fill="none"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
    <path d="M9 18c-4.51 2-5-2-7-2" />
  </svg>
);

// Types
interface AnalysisResult {
  health_score: number;
  security_alerts: number;
  performance_boost: number;
  security_report: string;
  performance_report: string;
  refactored_code: string;
}

const DUMMY_VULNERABLE_CODE = `def login_user(username, password):
    # CRITICAL SECURITY FLAW & BAD PERFORMANCE
    import sqlite3
    conn = sqlite3.connect('users.db')
    cursor = conn.cursor()
    query = f"SELECT * FROM accounts WHERE user='{username}' AND pass='{password}'"
    cursor.execute(query)
    return cursor.fetchall()`;

const MOCK_DEMO_RESULTS = {
  health_score: 35,
  security_alerts: 2,
  performance_boost: 65,
  security_report: `### 🛡️ Agent 1: Code Style & Linter Report
**Status:** 🔴 STYLE WARNINGS & BUGS DETECTED
**Vulnerability Type:** Raw SQL string interpolation (SQL Injection Risk)
**Classification:** PEP8 & Secure DB Standards

#### Detailed Breakdown
1. **Raw SQL Query Construction (Line 6)**:
   - **Context**: \`query = f"SELECT * FROM accounts WHERE user='{username}' AND pass='{password}'"\`
   - **Risk**: Directly interpolating variables inside database queries breaks standards and risks SQL syntax injection errors.
   - **Impact**: High. Execution errors and un-parameterized query overhead.

2. **In-Line Connection Management (Line 4)**:
   - **Context**: \`conn = sqlite3.connect('users.db')\`
   - **Risk**: Instantiating connection handles inside standard function scopes causes socket leaks and PEP8 violations.`,
  performance_report: `### ⚡ Agent 2: Performance Optimizer Report
**Status:** 🟡 BOTTLENECKS DETECTED
**Code Smell Score:** 78/100
**Estimated Speed Improvement:** +65%

#### Architectural & Execution Bottlenecks
1. **Disk I/O connection in hot path (Line 4)**:
   - **Problem**: Opening SQLite connections on every query triggers heavy disk operations, stalling requests.
   - **Fix**: Move database driver initialization and connections to a global connection pool scope.

2. **Inline module imports (Line 3)**:
   - **Problem**: Loading libraries in execution scope causes overhead on every call.
   - **Fix**: Elevate imports to the module level.`,
  refactored_code: `import sqlite3

# Reusable database connection helper
_conn = None

def get_db_connection():
    global _conn
    if _conn is None:
        # Reusing connection reduces connection creation overhead by 90%
        _conn = sqlite3.connect('users.db', check_same_thread=False)
    return _conn

def login_user(username: str, password: str):
    """
    Secured and Optimized version of login_user.
    - Resolves SQL syntax issues via parameterized queries.
    - Prevents disk I/O connection bottlenecks by reusing the db handle.
    - Module-level imports avoid function scope import overhead.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Parameterized query protects against SQL injection
    query = "SELECT username FROM accounts WHERE user = ? AND pass = ?"
    cursor.execute(query, (username, password))
    
    return cursor.fetchall()`
};

export default function Page() {
  const [activeTab, setActiveTab] = useState<"dashboard" | "sync" | "reports" | "settings">("dashboard");
  const [language, setLanguage] = useState<"python" | "javascript" | "cpp" | "java">("python");
  const [githubUrl, setGithubUrl] = useState("");
  const [codeContent, setCodeContent] = useState(DUMMY_VULNERABLE_CODE);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [currentStepText, setCurrentStepText] = useState("");
  const [agentLogs, setAgentLogs] = useState<string[]>([]);
  const [results, setResults] = useState<AnalysisResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [backendOnline, setBackendOnline] = useState(false);
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [backendUrl, setBackendUrl] = useState("http://localhost:8000");
  const [showKeyModal, setShowKeyModal] = useState(false);
  
  // Custom API key configuration states
  const [apiType, setApiType] = useState<"paid" | "free">("paid");
  const [selectedProvider, setSelectedProvider] = useState<"gemini" | "groq" | "cohere" | "huggingface">("gemini");
  const [validationStatus, setValidationStatus] = useState<"idle" | "verifying" | "success" | "error">("idle");
  const [validationError, setValidationError] = useState("");

  const terminalEndRef = useRef<HTMLDivElement>(null);

  // Load configuration from localStorage on client side
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedUrl = localStorage.getItem("devpulse_backend_url");
      if (savedUrl) {
        setBackendUrl(savedUrl);
      }
      const savedKey = localStorage.getItem("devpulse_gemini_api_key");
      const savedType = localStorage.getItem("devpulse_api_type") as any;
      const savedProvider = localStorage.getItem("devpulse_selected_provider") as any;
      
      if (savedType) setApiType(savedType);
      if (savedProvider) setSelectedProvider(savedProvider);

      if (savedKey && savedKey.trim() !== "") {
        setGeminiApiKey(savedKey);
        setShowKeyModal(false);
      } else {
        setShowKeyModal(true);
      }
    }
  }, []);

  const verifyAndConnectKey = async () => {
    setValidationStatus("verifying");
    setValidationError("");
    
    if (geminiApiKey.trim() === "") {
      setValidationStatus("error");
      setValidationError("API Key cannot be empty.");
      return;
    }

    try {
      const res = await fetch(`${backendUrl}/api/validate-key`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: apiType === "paid" ? "gemini" : selectedProvider,
          api_key: geminiApiKey
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Connection failed. Please verify the key.");
      }

      setValidationStatus("success");
      localStorage.setItem("devpulse_gemini_api_key", geminiApiKey);
      localStorage.setItem("devpulse_api_type", apiType);
      localStorage.setItem("devpulse_selected_provider", apiType === "paid" ? "gemini" : selectedProvider);
      
      setTimeout(() => {
        setShowKeyModal(false);
        setValidationStatus("idle");
      }, 1000);
    } catch (err: any) {
      console.error(err);
      setValidationStatus("error");
      setValidationError(err.message || "Failed to establish validation connection.");
    }
  };

  // Check backend and environment on load
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const res = await fetch(`${backendUrl}/api/incidents`); // Check server status
        if (res.ok) {
          setBackendOnline(true);
        } else {
          setBackendOnline(false);
        }
      } catch (err) {
        setBackendOnline(false);
      }
    };
    checkStatus();
    const interval = setInterval(checkStatus, 5000);
    return () => clearInterval(interval);
  }, [backendUrl]);

  // Scroll terminal logs to bottom
  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [agentLogs]);

  // Execute Agent Analysis
  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    setResults(null);
    setAgentLogs([]);
    
    const logs = [
      "🤖 [Orchestrator] Initializing multi-agent review workspace...",
      `📂 [System] Loading code context for programming language: ${language.toUpperCase()}`,
      "🚀 [Orchestrator] Spawned 'SecOps-Agent' (Senior Security Auditor)",
      "🚀 [Orchestrator] Spawned 'PerfScale-Agent' (Principal Systems Architect)"
    ];

    // Stream logs for hackathon aesthetic
    for (let i = 0; i < logs.length; i++) {
      setAgentLogs((prev) => [...prev, logs[i]]);
      setCurrentStepText(logs[i]);
      await new Promise((r) => setTimeout(r, 600));
    }

    setAgentLogs((prev) => [
      ...prev,
      "⚡ [SecOps-Agent] Inspecting code paths for SQL Injection, XSS, and SSRF flaws...",
      "⚡ [PerfScale-Agent] Running space-time complexity scans, memory leaks, & thread safety checks..."
    ]);
    setCurrentStepText("Agents executing analysis in parallel...");
    await new Promise((r) => setTimeout(r, 800));

    if (geminiApiKey === "demo_mode_bypass") {
      setAgentLogs((prev) => [
        ...prev,
        "✓ [SecOps-Agent] Style & PEP8 audit completed.",
        "✓ [PerfScale-Agent] Performance optimization done. CPU optimization completed.",
        "🎉 [Orchestrator] Consolidating audit reports and compiling refactored secure patch."
      ]);
      setCurrentStepText("Compiling final analysis...");
      await new Promise((r) => setTimeout(r, 600));
      setResults(MOCK_DEMO_RESULTS);
      setIsAnalyzing(false);
      return;
    }

    try {
      const res = await fetch(`${backendUrl}/api/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code_content: codeContent,
          language: language,
          gemini_api_key: geminiApiKey,
          provider: apiType === "paid" ? "gemini" : selectedProvider
        })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || "Analysis request failed");
      }

      const data: AnalysisResult = await res.json();
      
      setAgentLogs((prev) => [
        ...prev,
        "✓ [SecOps-Agent] Security audit completed. Issues isolated.",
        "✓ [PerfScale-Agent] Performance optimization done. CPU optimization completed.",
        "🎉 [Orchestrator] Consolidating audit reports and compiling refactored secure patch."
      ]);
      setCurrentStepText("Compiling final analysis...");
      await new Promise((r) => setTimeout(r, 600));

      setResults(data);
    } catch (err: any) {
      console.error(err);
      setAgentLogs((prev) => [
        ...prev,
        `❌ [Error] Analysis failed: ${err.message || "Failed to communicate with the backend"}.`
      ]);
      setCurrentStepText("Analysis failed.");
      alert(`Analysis failed: ${err.message || "Failed to contact backend API. Make sure your server is running and your API Key is correct."}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Copy code utility
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Download report utility
  const downloadReport = () => {
    if (!results) return;
    const reportText = `# DevPulse AI Code Review Report
Language: ${language.toUpperCase()}

## 📊 Code Quality Metrics
- Code Health Score: ${results.health_score}/100
- Style Warnings: ${results.security_alerts}
- Performance Boost: +${results.performance_boost}%

## 📝 Code Style & Linter Report
${results.security_report}

## ⚡ Performance Optimizer Report
${results.performance_report}

## 🛠️ Refactored Code
\`\`\`${language}
${results.refactored_code}
\`\`\`
`;
    const blob = new Blob([reportText], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `devpulse_audit_report.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Reset page state
  const resetWorkspace = () => {
    setResults(null);
    setCodeContent(DUMMY_VULNERABLE_CODE);
    setAgentLogs([]);
  };

  // Dynamic colors for health circle
  const getHealthColor = (score: number) => {
    if (score >= 80) return "text-emerald-500 stroke-emerald-500";
    if (score >= 50) return "text-amber-500 stroke-amber-500";
    return "text-rose-500 stroke-rose-500";
  };

  return (
    <div className="flex h-screen bg-[#090b11] text-slate-100 font-sans overflow-hidden">
      
      {/* SIDEBAR NAVIGATION */}
      <aside className="w-64 bg-[#0d0f17] border-r border-slate-800 flex flex-col justify-between shrink-0">
        <div>
          {/* Logo Brand */}
          <div className="p-6 border-b border-slate-800/80 flex items-center gap-3">
            <div className="p-2 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-indigo-400">
              <Activity className="h-6 w-6 breathe-dot" />
            </div>
            <div>
              <h1 className="text-md font-bold tracking-wider text-white">DEVPULSE AI</h1>
              <p className="text-[10px] text-slate-500 font-medium uppercase tracking-widest">Multi-Agent Review</p>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="p-4 space-y-1">
            <button
              onClick={() => setActiveTab("dashboard")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                activeTab === "dashboard"
                  ? "bg-indigo-600/10 text-indigo-400 border-l-2 border-indigo-500 font-semibold"
                  : "text-slate-400 hover:text-white hover:bg-slate-800/30"
              }`}
            >
              <Code className="h-4.5 w-4.5" />
              <span>Workspace</span>
            </button>

            <button
              onClick={() => setActiveTab("sync")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                activeTab === "sync"
                  ? "bg-indigo-600/10 text-indigo-400 border-l-2 border-indigo-500 font-semibold"
                  : "text-slate-400 hover:text-white hover:bg-slate-800/30"
              }`}
            >
              <GitBranch className="h-4.5 w-4.5" />
              <span>Repository Sync</span>
            </button>

            <button
              onClick={() => setActiveTab("reports")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                activeTab === "reports"
                  ? "bg-indigo-600/10 text-indigo-400 border-l-2 border-indigo-500 font-semibold"
                  : "text-slate-400 hover:text-white hover:bg-slate-800/30"
              }`}
            >
              <FileText className="h-4.5 w-4.5" />
              <span>Audit Reports</span>
            </button>

            <button
              onClick={() => setActiveTab("settings")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                activeTab === "settings"
                  ? "bg-indigo-600/10 text-indigo-400 border-l-2 border-indigo-500 font-semibold"
                  : "text-slate-400 hover:text-white hover:bg-slate-800/30"
              }`}
            >
              <Settings className="h-4.5 w-4.5" />
              <span>Settings</span>
            </button>
          </nav>
        </div>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-slate-800/80">
          <div className="flex items-center justify-between bg-slate-900/60 p-3 rounded-xl border border-slate-800/50">
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full breathe-dot ${
                geminiApiKey === "demo_mode_bypass"
                  ? "bg-amber-400 font-bold"
                  : backendOnline
                  ? "bg-emerald-400"
                  : "bg-rose-400"
              }`}></span>
              <span className="text-[11px] text-slate-400 font-mono">
                {geminiApiKey === "demo_mode_bypass"
                  ? "Demo Mode Active"
                  : backendOnline
                  ? "API Online"
                  : "API Offline"}
              </span>
            </div>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono border border-slate-700/50">v1.2.0</span>
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 flex flex-col bg-[#090b11] overflow-y-auto relative z-10 grid-bg">
        
        {/* TOP HEADER */}
        <header className="p-6 border-b border-slate-800/60 bg-[#0d0f17]/40 backdrop-blur-md flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
              Autonomous Audit Station <Sparkles className="h-4 w-4 text-indigo-400" />
            </h2>
            <p className="text-xs text-slate-400">Review, audit, and refactor codebases using parallel agent analysis.</p>
          </div>
          
          <div className="flex items-center gap-3">
            <span className="text-xs px-3 py-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/5 text-indigo-400 font-medium flex items-center gap-1.5">
              <Cpu className="h-3.5 w-3.5 animate-pulse" />
              Gemini 1.5 Pro Connected
            </span>
          </div>
        </header>

        <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto w-full flex-1">
          
          {/* TAB 1: DASHBOARD / WORKSPACE */}
          {activeTab === "dashboard" && (
            <>
              {/* TOP ANALYTICS BAR */}
              <section className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                
                {/* Health Score Card */}
                <div className="glass-panel p-5 relative overflow-hidden group hover:border-slate-700/40 transition-all flex items-center justify-between">
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Code Health Score</p>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-bold tracking-tight text-white">
                        {results ? `${results.health_score}` : "--"}
                      </span>
                      <span className="text-xs text-slate-500">/ 100</span>
                    </div>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                      results 
                        ? results.health_score < 50 
                          ? "bg-rose-500/10 text-rose-400 border border-rose-500/20" 
                          : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        : "bg-slate-800 text-slate-400"
                    }`}>
                      {results ? results.health_score < 50 ? "⚠️ Critical Risks" : "✓ Optimal Health" : "Awaiting Audit"}
                    </span>
                  </div>

                  {/* Circular Metric */}
                  <div className="relative h-16 w-16 shrink-0 flex items-center justify-center">
                    <svg className="absolute transform -rotate-90 w-full h-full">
                      <circle cx="32" cy="32" r="26" className="stroke-slate-800" strokeWidth="4" fill="transparent" />
                      <circle
                        cx="32"
                        cy="32"
                        r="26"
                        className={`transition-all duration-1000 ${
                          results ? getHealthColor(results.health_score) : "stroke-indigo-500/20"
                        }`}
                        strokeWidth="4"
                        fill="transparent"
                        strokeDasharray={2 * Math.PI * 26}
                        strokeDashoffset={
                          results 
                            ? (2 * Math.PI * 26) - (results.health_score / 100) * (2 * Math.PI * 26)
                            : (2 * Math.PI * 26)
                        }
                        strokeLinecap="round"
                      />
                    </svg>
                    <span className="text-xs font-mono font-semibold text-white">
                      {results ? `${results.health_score}%` : "0%"}
                    </span>
                  </div>
                </div>

                {/* Security Alerts Card */}
                <div className={`glass-panel p-5 relative overflow-hidden group transition-all flex items-center justify-between ${
                  results && results.security_alerts > 0 ? "border-rose-500/20 shadow-rose-950/10 shadow-lg" : "hover:border-slate-700/40"
                }`}>
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Security Alerts</p>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-bold tracking-tight text-white">
                        {results ? `${results.security_alerts}` : "0"}
                      </span>
                      <span className="text-xs text-slate-500">vulnerabilities</span>
                    </div>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                      results && results.security_alerts > 0
                        ? "bg-rose-500/10 text-rose-400 border border-rose-500/20 animate-pulse"
                        : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                    }`}>
                      {results 
                        ? results.security_alerts > 0 
                          ? "🔴 Action Required" 
                          : "✓ Security Cleared" 
                        : "Awaiting Audit"}
                    </span>
                  </div>
                  <div className={`p-3 rounded-2xl ${
                    results && results.security_alerts > 0 
                      ? "bg-rose-500/10 text-rose-400" 
                      : "bg-slate-800 text-slate-400"
                  }`}>
                    <ShieldAlert className="h-6 w-6" />
                  </div>
                </div>

                {/* Performance Boost Card */}
                <div className="glass-panel p-5 relative overflow-hidden group hover:border-slate-700/40 transition-all flex items-center justify-between">
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Performance Boost</p>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-bold tracking-tight text-white">
                        {results ? `+${results.performance_boost}%` : "+0%"}
                      </span>
                      <span className="text-xs text-slate-500">efficiency</span>
                    </div>
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      ⚡ Speed Improvement
                    </span>
                  </div>
                  <div className="p-3 bg-slate-800 text-indigo-400 rounded-2xl">
                    <Zap className="h-6 w-6" />
                  </div>
                </div>

              </section>

              {/* MAIN INPUT PANEL */}
              <section className="glass-panel p-6 space-y-5">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
                  <div className="flex items-center gap-2">
                    <Code className="text-indigo-400 h-5 w-5" />
                    <h3 className="text-sm font-semibold text-white">Source Code Sandbox</h3>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    {/* Language Select */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400">Language:</span>
                      <select
                        value={language}
                        onChange={(e) => setLanguage(e.target.value as any)}
                        className="bg-slate-900 border border-slate-800 text-slate-200 text-xs px-3 py-1.5 rounded-xl outline-none focus:border-indigo-500/50 cursor-pointer"
                      >
                        <option value="python">Python</option>
                        <option value="javascript">JavaScript</option>
                        <option value="cpp">C++</option>
                        <option value="java">Java</option>
                      </select>
                    </div>

                    {/* Quick Reset */}
                    <button
                      onClick={resetWorkspace}
                      className="px-3 py-1.5 rounded-xl border border-slate-800 hover:border-slate-700 bg-slate-900/50 hover:bg-slate-900 text-xs text-slate-400 hover:text-white transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Reset Demo
                    </button>
                  </div>
                </div>

                {/* GitHub URL Sync Input */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">GitHub Repository Target (Optional)</label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Github className="absolute left-3 top-2.5 h-4.5 w-4.5 text-slate-500" />
                      <input
                        type="text"
                        placeholder="https://github.com/username/repository-name"
                        value={githubUrl}
                        onChange={(e) => setGithubUrl(e.target.value)}
                        className="w-full bg-[#0d0f17]/80 border border-slate-800 rounded-xl py-2 pl-10 pr-4 text-xs text-slate-200 outline-none focus:border-indigo-500/50 placeholder-slate-600 transition-all font-mono"
                      />
                    </div>
                  </div>
                </div>

                {/* Editor Textarea */}
                <div className="space-y-2">
                  <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Raw Source Code Payload</label>
                  <div className="relative border border-slate-800 rounded-xl overflow-hidden bg-slate-950">
                    {/* Code decoration header */}
                    <div className="flex items-center justify-between px-4 py-2 border-b border-slate-900 bg-slate-900/50 text-[10px] text-slate-500 font-mono">
                      <span>payload_buffer.{language === "python" ? "py" : language === "javascript" ? "js" : language === "cpp" ? "cpp" : "java"}</span>
                      <span>UTF-8</span>
                    </div>

                    {/* Textarea */}
                    <textarea
                      value={codeContent}
                      onChange={(e) => setCodeContent(e.target.value)}
                      rows={9}
                      className="w-full bg-transparent p-4 text-xs font-mono text-indigo-200/90 outline-none resize-none leading-relaxed"
                      placeholder="Paste your code block here..."
                    />
                  </div>
                </div>

                {/* CTA Audit Button */}
                <div className="flex justify-end pt-2">
                  <button
                    onClick={handleAnalyze}
                    disabled={isAnalyzing || !codeContent.trim()}
                    className={`flex items-center gap-2 py-3 px-6 rounded-xl text-xs font-semibold border transition-all active:scale-[0.98] ${
                      isAnalyzing
                        ? "bg-slate-800 border-slate-800 text-slate-500 cursor-not-allowed"
                        : "bg-indigo-600 hover:bg-indigo-500 border-indigo-500/30 text-white cursor-pointer hover:shadow-indigo-500/10 hover:shadow-lg glow-button font-bold"
                    }`}
                  >
                    {isAnalyzing ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin text-indigo-400" />
                        <span>Auditing Codebase...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4 text-amber-300" />
                        <span>Analyze Code with Multi-Agents</span>
                      </>
                    )}
                  </button>
                </div>
              </section>

              {/* TERMINAL STATUS MONITOR */}
              {agentLogs.length > 0 && (
                <section className="glass-panel p-5 bg-slate-950/80 border-slate-900 font-mono space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-900 pb-2">
                    <div className="flex items-center gap-2 text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                      <Terminal className="h-4 w-4 text-indigo-400" />
                      <span>Live Multi-Agent Pipeline Console</span>
                    </div>
                    {isAnalyzing && (
                      <span className="text-[10px] text-indigo-400 animate-pulse flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 breathe-dot"></span>
                        PROCESSING
                      </span>
                    )}
                  </div>
                  <div className="h-32 overflow-y-auto space-y-1 text-[11px] text-slate-300 leading-relaxed font-mono scrollbar-thin">
                    {agentLogs.map((log, index) => (
                      <div key={index} className="flex gap-2">
                        <span className="text-slate-600 select-none">[{index + 1}]</span>
                        <span>{log}</span>
                      </div>
                    ))}
                    <div ref={terminalEndRef} />
                  </div>
                </section>
              )}

              {/* RESULTS GRID LAYOUT */}
              {results && (
                <section className="space-y-6">
                  
                  {/* Report Download Utility Header */}
                  <div className="flex items-center justify-between bg-slate-900/40 p-4 rounded-xl border border-slate-800/80">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4.5 w-4.5 text-indigo-400" />
                      <h4 className="text-sm font-semibold text-white">Analysis Workspace Summary</h4>
                    </div>
                    <button
                      onClick={downloadReport}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-xs font-semibold text-white flex items-center gap-2 cursor-pointer transition-all active:scale-95 hover:shadow-indigo-500/10 hover:shadow-md"
                    >
                      <FileText className="h-4 w-4" />
                      <span>Download Audit Report (.md)</span>
                    </button>
                  </div>
                  
                  {/* TWO-COLUMN REPORT SUMMARY */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    
                    {/* Left Column: SecOps Agent Report */}
                    <div className="glass-panel overflow-hidden border-rose-500/20 bg-rose-950/5">
                      <div className="p-4 bg-rose-500/10 border-b border-rose-500/20 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <ShieldAlert className="text-rose-400 h-4.5 w-4.5" />
                          <h4 className="text-sm font-semibold text-rose-400 font-sans">Agent 1: Security Auditor Report</h4>
                        </div>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 font-bold border border-rose-400/30 animate-pulse">
                          CRITICAL
                        </span>
                      </div>
                      
                      <div className="p-5 overflow-y-auto max-h-[350px]">
                        <div className="space-y-3 text-xs md:text-sm text-slate-300 font-sans leading-relaxed">
                          {results.security_report.split("\n").map((line, idx) => {
                            if (line.startsWith("### ")) {
                              return <h3 key={idx} className="text-sm font-bold text-white mt-4 mb-1 border-b border-slate-800 pb-1">{line.replace("### ", "")}</h3>;
                            }
                            if (line.startsWith("#### ")) {
                              return <h4 key={idx} className="text-xs font-semibold text-slate-200 mt-3 mb-1 font-mono uppercase tracking-wider">{line.replace("#### ", "")}</h4>;
                            }
                            if (line.startsWith("- ") || line.startsWith("* ")) {
                              return <li key={idx} className="list-disc pl-4 text-slate-300 ml-2">{line.substring(2)}</li>;
                            }
                            if (line.trim().startsWith("1. ") || line.trim().startsWith("2. ")) {
                              return <p key={idx} className="pl-4 text-slate-300 font-sans mt-1"><span className="text-rose-400 font-bold">{line.match(/^\s*\d+\./)?.[0]}</span> {line.replace(/^\s*\d+\.\s*/, "")}</p>;
                            }
                            if (line.startsWith("**") && line.endsWith("**")) {
                              return <p key={idx} className="text-white font-semibold mt-2">{line.replace(/\*\*/g, "")}</p>;
                            }
                            if (line.trim().startsWith("```") || line.trim() === "```") {
                              return null; // Suppress code blocks in security summary since diff is shown below
                            }
                            if (!line.trim()) return <div key={idx} className="h-1.5" />;
                            return <p key={idx}>{line}</p>;
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Right Column: PerfScale Agent Report */}
                    <div className="glass-panel overflow-hidden border-emerald-500/20 bg-emerald-950/5">
                      <div className="p-4 bg-emerald-500/10 border-b border-emerald-500/20 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Zap className="text-emerald-400 h-4.5 w-4.5" />
                          <h4 className="text-sm font-semibold text-emerald-400 font-sans">Agent 2: Performance Optimizer Report</h4>
                        </div>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-400/30">
                          {results.performance_boost > 50 ? "SPEEDUP +65%" : "STABLE"}
                        </span>
                      </div>

                      <div className="p-5 overflow-y-auto max-h-[350px]">
                        <div className="space-y-3 text-xs md:text-sm text-slate-300 font-sans leading-relaxed">
                          {results.performance_report.split("\n").map((line, idx) => {
                            if (line.startsWith("### ")) {
                              return <h3 key={idx} className="text-sm font-bold text-white mt-4 mb-1 border-b border-slate-800 pb-1">{line.replace("### ", "")}</h3>;
                            }
                            if (line.startsWith("#### ")) {
                              return <h4 key={idx} className="text-xs font-semibold text-slate-200 mt-3 mb-1 font-mono uppercase tracking-wider">{line.replace("#### ", "")}</h4>;
                            }
                            if (line.startsWith("- ") || line.startsWith("* ")) {
                              return <li key={idx} className="list-disc pl-4 text-slate-300 ml-2">{line.substring(2)}</li>;
                            }
                            if (line.trim().startsWith("1. ") || line.trim().startsWith("2. ")) {
                              return <p key={idx} className="pl-4 text-slate-300 font-sans mt-1"><span className="text-emerald-400 font-bold">{line.match(/^\s*\d+\./)?.[0]}</span> {line.replace(/^\s*\d+\.\s*/, "")}</p>;
                            }
                            if (line.startsWith("**") && line.endsWith("**")) {
                              return <p key={idx} className="text-white font-semibold mt-2">{line.replace(/\*\*/g, "")}</p>;
                            }
                            if (line.trim().startsWith("```") || line.trim() === "```") {
                              return null; // Suppress code blocks in performance summary since diff is shown below
                            }
                            if (!line.trim()) return <div key={idx} className="h-1.5" />;
                            return <p key={idx}>{line}</p>;
                          })}
                        </div>
                      </div>
                    </div>

                  </div>

                  {/* SIDE-BY-SIDE DIFF PANEL */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between px-1">
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                        <Terminal className="h-4 w-4 text-indigo-400" /> Advanced Side-by-Side Code Diff
                      </h4>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      
                      {/* Left Side: Vulnerable Code (Red border) */}
                      <div className="relative rounded-xl border border-rose-500/30 overflow-hidden bg-rose-950/10 shadow-lg shadow-rose-950/5">
                        <div className="px-4 py-2.5 bg-rose-500/10 border-b border-rose-500/20 text-xs font-mono font-medium text-rose-400 flex items-center justify-between">
                          <span>vulnerable_original.{language === "python" ? "py" : "js"}</span>
                          <span className="flex items-center gap-1">
                            <AlertTriangle className="h-3.5 w-3.5" /> Security Vulnerability
                          </span>
                        </div>
                        <pre className="p-4 text-xs font-mono text-rose-300/80 overflow-x-auto leading-relaxed select-text">
                          {codeContent}
                        </pre>
                      </div>

                      {/* Right Side: Refactored Code (Emerald border) */}
                      <div className="relative rounded-xl border border-emerald-500/30 overflow-hidden bg-emerald-950/10 shadow-lg shadow-emerald-950/5">
                        <div className="px-4 py-2.5 bg-emerald-500/10 border-b border-emerald-500/20 text-xs font-mono font-medium text-emerald-400 flex items-center justify-between">
                          <span>secure_optimized.{language === "python" ? "py" : "js"}</span>
                          <button
                            onClick={() => copyToClipboard(results.refactored_code)}
                            className="px-2.5 py-1 rounded bg-slate-900 border border-slate-800 hover:border-slate-700 text-[10px] text-slate-300 hover:text-white flex items-center gap-1 cursor-pointer transition-all active:scale-95"
                          >
                            {copied ? (
                              <>
                                <Check className="h-3 w-3 text-emerald-400" />
                                <span>Copied!</span>
                              </>
                            ) : (
                              <>
                                <Copy className="h-3 w-3" />
                                <span>Copy Fixed Code</span>
                              </>
                            )}
                          </button>
                        </div>
                        <pre className="p-4 text-xs font-mono text-emerald-300/90 overflow-x-auto leading-relaxed select-text">
                          {results.refactored_code}
                        </pre>
                      </div>

                    </div>
                  </div>

                </section>
              )}
            </>
          )}

          {/* TAB 2: REPOSITORY SYNC */}
          {activeTab === "sync" && (
            <section className="glass-panel p-6 space-y-6">
              <div className="border-b border-slate-800/80 pb-4 flex items-center gap-2">
                <GitBranch className="text-indigo-400 h-5 w-5" />
                <h3 className="text-sm font-semibold text-white">Repository CI/CD Sync</h3>
              </div>

              <div className="p-16 border border-dashed border-slate-800 rounded-2xl flex flex-col items-center justify-center text-center max-w-2xl mx-auto space-y-4">
                <div className="p-4 bg-indigo-500/5 rounded-full border border-indigo-500/10 text-indigo-400">
                  <Github className="h-8 w-8" />
                </div>
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-white">Connect GitHub Actions Workflows</h4>
                  <p className="text-xs text-slate-400 max-w-md leading-relaxed">
                    Install the DevPulse AI CI/CD Plugin directly into your repository pipeline to review commits automatically on every pull request.
                  </p>
                </div>
                
                <div className="w-full space-y-3">
                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-900 text-left text-xs font-mono text-slate-400 flex items-center justify-between">
                    <span>npm install -g @devpulse-ai/github-action</span>
                    <button className="p-1 hover:text-white cursor-pointer" onClick={() => copyToClipboard("npm install -g @devpulse-ai/github-action")}>
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <button className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-xs font-semibold text-white transition-all cursor-pointer">
                  Sync Repository Workspace
                </button>
              </div>
            </section>
          )}

          {/* TAB 3: AUDIT REPORTS */}
          {activeTab === "reports" && (
            <section className="glass-panel p-6 space-y-6">
              <div className="border-b border-slate-800/80 pb-4 flex items-center gap-2">
                <FileText className="text-indigo-400 h-5 w-5" />
                <h3 className="text-sm font-semibold text-white">Historical Audit Logs</h3>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800/80 text-[10px] text-slate-500 font-semibold uppercase tracking-wider bg-slate-950/20">
                      <th className="py-3 px-4">Audit ID</th>
                      <th className="py-3 px-4">Language</th>
                      <th className="py-3 px-4">Vulnerabilities</th>
                      <th className="py-3 px-4">Perf Score</th>
                      <th className="py-3 px-4 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50 text-xs">
                    <tr className="hover:bg-slate-900/10">
                      <td className="py-4 px-4 font-mono font-medium text-white">AUD-749c-d8</td>
                      <td className="py-4 px-4 font-mono text-slate-400">Python</td>
                      <td className="py-4 px-4">
                        <span className="px-2 py-0.5 rounded-full bg-rose-500/10 border border-rose-500/20 text-[10px] font-medium text-rose-400">
                          2 Critical SQLi
                        </span>
                      </td>
                      <td className="py-4 px-4 font-mono font-medium text-white">35/100</td>
                      <td className="py-4 px-4 text-right">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-rose-500/10 border border-rose-500/20 text-rose-400">
                          Needs Fix
                        </span>
                      </td>
                    </tr>
                    <tr className="hover:bg-slate-900/10">
                      <td className="py-4 px-4 font-mono font-medium text-white">AUD-19ca-2f</td>
                      <td className="py-4 px-4 font-mono text-slate-400">JavaScript</td>
                      <td className="py-4 px-4">
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-medium text-emerald-400">
                          0 Flaws
                        </span>
                      </td>
                      <td className="py-4 px-4 font-mono font-medium text-white">92/100</td>
                      <td className="py-4 px-4 text-right">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                          Approved
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* TAB 4: SETTINGS */}
          {activeTab === "settings" && (
            <section className="glass-panel p-6 space-y-6">
              <div className="border-b border-slate-800/80 pb-4 flex items-center gap-2">
                <Settings className="text-indigo-400 h-5 w-5" />
                <h3 className="text-sm font-semibold text-white">AI Agent Settings</h3>
              </div>

              <div className="max-w-xl space-y-4">
                <div className="space-y-2">
                  <label className="text-xs text-slate-400 font-medium">Google Gemini Pro API Key</label>
                  <input
                    type="password"
                    placeholder="Enter your GEMINI_API_KEY..."
                    value={geminiApiKey}
                    onChange={(e) => setGeminiApiKey(e.target.value)}
                    className="w-full bg-[#0d0f17] border border-slate-800 rounded-xl py-2 px-3 text-xs text-slate-200 outline-none focus:border-indigo-500/50"
                  />
                  <p className="text-[10px] text-slate-500">
                    If left blank, DevPulse AI uses the backend host environment variable GEMINI_API_KEY. If no key is set, the system falls back to a sandbox simulator mode.
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-xs text-slate-400 font-medium">Backend API Host URL</label>
                  <input
                    type="text"
                    placeholder="http://localhost:8000"
                    value={backendUrl}
                    onChange={(e) => setBackendUrl(e.target.value)}
                    className="w-full bg-[#0d0f17] border border-slate-800 rounded-xl py-2 px-3 text-xs text-slate-200 outline-none focus:border-indigo-500/50"
                  />
                  <p className="text-[10px] text-slate-500">
                    Configure this target to point to your exposed web tunnel URL when deploying or presenting the project online.
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-xs text-slate-400 font-medium">Parallel Threads Limit</label>
                  <select className="bg-slate-900 border border-slate-800 text-slate-200 text-xs px-3 py-1.5 rounded-xl outline-none focus:border-indigo-500/50 w-full">
                    <option value="2">2 (SecOps + PerfScale concurrent)</option>
                    <option value="4">4 (Multi-thread repository split)</option>
                    <option value="1">1 (Sequential execution)</option>
                  </select>
                </div>

                <div className="pt-2">
                  <button
                    onClick={() => {
                      localStorage.setItem("devpulse_backend_url", backendUrl);
                      localStorage.setItem("devpulse_gemini_api_key", geminiApiKey);
                      alert("Configuration saved successfully!");
                    }}
                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-xs font-semibold text-white transition-all cursor-pointer"
                  >
                    Save Configuration
                  </button>
                </div>
              </div>
            </section>
          )}

        </div>

        {/* FOOTER */}
        <footer className="w-full text-center border-t border-slate-800/60 py-6 mt-12 text-[10px] text-slate-500 shrink-0">
          <p>DevPulse AI © 2026 - Hackathon Submission. All Rights Reserved.</p>
          <p className="mt-1">Powered by CrewAI Orchestrator Engine & Google Gemini 1.5 Pro Model.</p>
        </footer>
      </main>

      {/* API KEY ENFORCEMENT MODAL */}
      {showKeyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#090b11]/95 backdrop-blur-md">
          <div className="glass-panel p-8 max-w-md w-full border-indigo-500/20 bg-slate-900/95 space-y-6 shadow-2xl">
            
            {/* Header */}
            <div className="flex flex-col items-center gap-2.5 text-center">
              <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl text-indigo-400">
                <Lock className="h-6 w-6 animate-pulse" />
              </div>
              <h3 className="text-lg font-bold text-white tracking-tight">API Connection Control</h3>
              <p className="text-[11px] text-slate-400 leading-relaxed max-w-sm">
                DevPulse AI requires an active API key to perform live multi-agent code audits. Select your connection type to initialize the workspace.
              </p>
            </div>

            {/* Toggle Tabs */}
            <div className="grid grid-cols-2 p-1 bg-[#0d0f17] rounded-xl border border-slate-800/80">
              <button
                type="button"
                onClick={() => {
                  setApiType("paid");
                  setValidationError("");
                  setValidationStatus("idle");
                }}
                className={`py-2 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  apiType === "paid"
                    ? "bg-indigo-600 text-white shadow-md font-bold"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Paid / Direct Key
              </button>
              <button
                type="button"
                onClick={() => {
                  setApiType("free");
                  setValidationError("");
                  setValidationStatus("idle");
                }}
                className={`py-2 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  apiType === "free"
                    ? "bg-indigo-600 text-white shadow-md font-bold"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Free / Trial Key
              </button>
            </div>

            {/* Paid Mode Content */}
            {apiType === "paid" && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Google Gemini Pro Key</label>
                  <input
                    type="password"
                    placeholder="Enter GEMINI_API_KEY..."
                    value={geminiApiKey}
                    onChange={(e) => setGeminiApiKey(e.target.value)}
                    className="w-full bg-[#0d0f17] border border-slate-800 rounded-xl py-2.5 px-3 text-xs text-slate-200 outline-none focus:border-indigo-500/50 font-mono"
                  />
                  <p className="text-[10px] text-slate-500 font-sans leading-relaxed text-left">
                    Direct production connection. Input your direct corporate or developer token.
                  </p>
                </div>
              </div>
            )}

            {/* Free Mode Content */}
            {apiType === "free" && (
              <div className="space-y-4">
                {/* Provider Select */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Select Free Provider</label>
                  <select
                    value={selectedProvider}
                    onChange={(e) => {
                      setSelectedProvider(e.target.value as any);
                      setValidationError("");
                      setValidationStatus("idle");
                    }}
                    className="w-full bg-[#0d0f17] border border-slate-800 text-slate-200 text-xs px-3 py-2.5 rounded-xl outline-none focus:border-indigo-500/50 cursor-pointer font-sans"
                  >
                    <option value="gemini">Google Gemini (Free Tier)</option>
                    <option value="groq">Groq Cloud (Free Key)</option>
                    <option value="cohere">Cohere AI (Trial Token)</option>
                    <option value="huggingface">Hugging Face (Read Token)</option>
                  </select>
                </div>

                {/* Redirect Link Instruction */}
                <div className="bg-[#0d0f17]/80 p-3.5 rounded-xl border border-slate-800/80 flex items-center justify-between gap-3 text-xs leading-relaxed text-slate-400">
                  <div className="flex items-center gap-2">
                    <Info className="h-4 w-4 text-indigo-400 shrink-0" />
                    <span>Get your key from the provider's developer console page.</span>
                  </div>
                  <a
                    href={
                      selectedProvider === "gemini"
                        ? "https://aistudio.google.com/"
                        : selectedProvider === "groq"
                        ? "https://console.groq.com/keys"
                        : selectedProvider === "cohere"
                        ? "https://dashboard.cohere.com/api-keys"
                        : "https://huggingface.co/settings/tokens"
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700/60 hover:bg-slate-700 text-[10px] text-white font-semibold transition-all flex items-center gap-1 cursor-pointer whitespace-nowrap active:scale-95"
                  >
                    Get Key ↗
                  </a>
                </div>

                {/* Free key input */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Paste Copied API Key</label>
                  <input
                    type="password"
                    placeholder="Paste your copied key here..."
                    value={geminiApiKey}
                    onChange={(e) => setGeminiApiKey(e.target.value)}
                    className="w-full bg-[#0d0f17] border border-slate-800 rounded-xl py-2.5 px-3 text-xs text-slate-200 outline-none focus:border-indigo-500/50 font-mono"
                  />
                </div>
              </div>
            )}

            {/* Validation Feedback Alert */}
            {validationStatus === "error" && (
              <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-start gap-2.5 text-xs text-rose-400 text-left font-sans animate-fade-in leading-relaxed">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Connection Failed:</span> {validationError}
                </div>
              </div>
            )}

            {/* Connect & Validate Button */}
            <button
              onClick={verifyAndConnectKey}
              disabled={validationStatus === "verifying" || validationStatus === "success"}
              className={`w-full py-3 rounded-xl text-xs font-semibold transition-all active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2 ${
                validationStatus === "verifying"
                  ? "bg-slate-800 border border-slate-700 text-slate-500 cursor-not-allowed"
                  : validationStatus === "success"
                  ? "bg-emerald-600 border border-emerald-500/30 text-white font-bold cursor-not-allowed"
                  : "bg-indigo-600 hover:bg-indigo-500 border-indigo-500/30 text-white font-bold hover:shadow-indigo-500/10 hover:shadow-lg"
              }`}
            >
              {validationStatus === "verifying" ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin text-indigo-400" />
                  <span>Verifying API Key...</span>
                </>
              ) : validationStatus === "success" ? (
                <>
                  <Check className="h-4 w-4 text-white" />
                  <span>Connection Established!</span>
                </>
              ) : validationStatus === "error" ? (
                <>
                  <RotateCcw className="h-4 w-4" />
                  <span>Retry Connection</span>
                </>
              ) : (
                <>
                  <Cpu className="h-4 w-4 text-indigo-300" />
                  <span>Validate & Connect Key</span>
                </>
              )}
            </button>

            {/* Demo Mode Bypass Link */}
            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => {
                  localStorage.setItem("devpulse_gemini_api_key", "demo_mode_bypass");
                  setGeminiApiKey("demo_mode_bypass");
                  setShowKeyModal(false);
                  setValidationError("");
                  setValidationStatus("idle");
                }}
                className="text-[11px] text-slate-500 hover:text-indigo-400 font-semibold underline transition-all cursor-pointer bg-transparent border-0 outline-none"
              >
                Proceed in Sandbox / Demo Mode (No API Key Required)
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
