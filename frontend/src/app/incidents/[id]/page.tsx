"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { 
  ArrowLeft, 
  Terminal, 
  Layers, 
  Server, 
  Database, 
  GitBranch, 
  Search, 
  FileText, 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  HelpCircle,
  Copy,
  ChevronRight,
  ShieldAlert,
  Activity,
  MessageSquare,
  Hash,
  Send,
  Smile,
  Paperclip,
  Bold,
  Italic,
  Code,
  List
} from "lucide-react";

interface Message {
  role: string;
  name: string;
  content: string;
}

interface IncidentState {
  incident_id: string;
  alert_name: string;
  service: string;
  symptoms: string;
  messages: Message[];
  splunk_queries: string[];
  diagnosis: string;
  proposed_remediation: {
    options?: any[];
    selected_option?: any;
    action_type?: string;
    target?: string;
    value?: string;
  };
  remediation_status: string;
  current_node: string;
  user_approval_needed: boolean;
  audit_logs: any[];
}

// Custom Splunk SPL syntax highlighting parser
const highlightSPL = (query: string) => {
  if (!query) return "";
  
  // Splunk keyword matching patterns
  const keywords = /\b(index|sourcetype|stats|eval|where|fields|dedup|table|sort|rex|timechart|rename|search|transaction|head|tail|top|limit|as|by)\b/gi;
  const aggFunctions = /\b(count|sum|avg|min|max|dc|values|list)\b(?=\s*\()/gi;
  const booleanOps = /\b(AND|OR|NOT)\b/g;
  
  // Split tokens by quotes, pipes, boolean operators, assignment/comparison operators, and whitespace
  const tokens = query.split(/("[^"]*"|'[^']*'|\||!=|>=|<=|=|>|<|\s+)/);
  
  return tokens.map((token, idx) => {
    if (!token) return null;
    
    // String literals
    if ((token.startsWith('"') && token.endsWith('"')) || (token.startsWith("'") && token.endsWith("'"))) {
      return <span key={idx} className="text-cyan-405 font-semibold">{token}</span>;
    }
    
    // Pipe operator
    if (token === '|') {
      return <span key={idx} className="text-amber-500 font-bold mx-1">{token}</span>;
    }
    
    // Assignment/Comparison operators
    if (['=', '!=', '>', '<', '>=', '<='].includes(token)) {
      return <span key={idx} className="text-amber-400 font-semibold">{token}</span>;
    }
    
    // Whitespace
    if (/^\s+$/.test(token)) {
      return <span key={idx}>{token}</span>;
    }
    
    // Keywords & commands
    const trimmed = token.trim();
    if (keywords.test(trimmed)) {
      keywords.lastIndex = 0; // reset regex index
      return <span key={idx} className="text-fuchsia-400 font-bold">{token}</span>;
    }
    
    // Aggregate metrics functions
    if (aggFunctions.test(trimmed)) {
      aggFunctions.lastIndex = 0; // reset
      return <span key={idx} className="text-purple-400 font-semibold">{token}</span>;
    }
    
    // Boolean operators
    if (booleanOps.test(trimmed)) {
      booleanOps.lastIndex = 0; // reset
      return <span key={idx} className="text-orange-400 font-bold">{token}</span>;
    }

    // Number literals
    if (/^\d+(\.\d+)?$/.test(trimmed)) {
      return <span key={idx} className="text-emerald-400 font-mono">{token}</span>;
    }

    // General token
    return <span key={idx} className="text-slate-300">{token}</span>;
  });
};

export default function IncidentRoomPage() {
  const params = useParams();
  const router = useRouter();
  const incidentId = params.id as string;
  
  const [state, setState] = useState<IncidentState | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [activeTab, setActiveTab] = useState<"terminal" | "splunk" | "audit" | "slack">("terminal");
  const [copiedQueryIndex, setCopiedQueryIndex] = useState<number | null>(null);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  // Local state for Slack ChatOps reactions
  const [reactions, setReactions] = useState({
    thumbsUp: { count: 3, clicked: false },
    eyes: { count: 5, clicked: false },
    fire: { count: 2, clicked: false },
    heart: { count: 1, clicked: false }
  });

  const toggleReaction = (key: keyof typeof reactions) => {
    setReactions(prev => ({
      ...prev,
      [key]: {
        count: prev[key].clicked ? prev[key].count - 1 : prev[key].count + 1,
        clicked: !prev[key].clicked
      }
    }));
  };

  // Connect to WebSocket on mount
  useEffect(() => {
    const ws = new WebSocket(`ws://localhost:8000/ws/incidents/${incidentId}`);

    ws.onopen = () => {
      setWsConnected(true);
      console.log("WebSocket connected");
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "state_update") {
        console.log("State updated:", JSON.stringify(data.state));
        setState(data.state);
      }
    };

    ws.onclose = () => {
      setWsConnected(false);
      console.log("WebSocket disconnected");
    };

    return () => ws.close();
  }, [incidentId]);

  // Scroll to bottom of terminal whenever messages are added
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [state?.messages]);

  const handleAction = async (action: "approve" | "reject", selectedOption?: any) => {
    try {
      const url = `http://localhost:8000/api/incidents/${incidentId}/${action}`;
      const options: RequestInit = {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      };
      
      if (action === "approve" && selectedOption) {
        options.body = JSON.stringify(selectedOption);
      } else if (action === "approve") {
        options.body = JSON.stringify({});
      }

      const res = await fetch(url, options);
      if (!res.ok) {
        alert(`Failed to submit remediation ${action}`);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedQueryIndex(index);
    setTimeout(() => setCopiedQueryIndex(null), 2000);
  };

  if (!state) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center text-gray-400">
        <div className="h-12 w-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-sm font-semibold tracking-wider uppercase">Connecting to SRE Investigation Room...</p>
      </div>
    );
  }

  // Determine scenario details for rendering
  const isLatencyScenario = state.alert_name.toLowerCase().includes("latency");
  const currentAgent = state.current_node ? state.current_node.toUpperCase() : "TRIAGE";
  const isExecuted = state.remediation_status === "executed";

  // Simple text formatter to handle bold, inline code, and bullet lists in agent outputs
  const formatText = (text: string) => {
    if (!text) return "";
    return text.split("\n").map((line, idx) => {
      // Headers
      if (line.startsWith("# ")) return <h1 key={idx} className="text-xl font-bold text-white mt-4 mb-2">{line.replace("# ", "")}</h1>;
      if (line.startsWith("### ")) return <h3 key={idx} className="text-md font-bold text-gray-200 mt-3 mb-1">{line.replace("### ", "")}</h3>;
      if (line.startsWith("## ")) return <h2 key={idx} className="text-lg font-bold text-white mt-4 mb-2">{line.replace("## ", "")}</h2>;
      
      // Bullets
      if (line.startsWith("- ") || line.startsWith("* ")) {
        return (
          <li key={idx} className="ml-4 list-disc text-gray-300 my-1">
            {line.substring(2)}
          </li>
        );
      }
      
      // Regular paragraphs
      return <p key={idx} className="text-gray-300 my-1.5 leading-relaxed">{line}</p>;
    });
  };

  // SVG Metrics Chart Generator
  const renderMetricsChart = () => {
    const isExecuted = state.remediation_status === "executed";
    
    // Choose dataset based on scenario
    const values = isLatencyScenario 
      ? (isExecuted ? [610, 640, 650, 630, 655, 645, 660, 650, 240, 140, 120, 115] : [610, 640, 650, 630, 655, 645, 660, 650])
      : (isExecuted ? [31, 34, 33, 35, 34, 36, 35, 34, 18, 5, 0.6, 0.2] : [31, 34, 33, 35, 34, 36, 35, 34]);

    const maxVal = isLatencyScenario ? 700 : 40;
    const unit = isLatencyScenario ? "ms" : "%";
    const title = isLatencyScenario ? "Response Latency" : "Error Rate";
    const accentHex = isLatencyScenario ? "#f59e0b" : "#f43f5e";

    // Map data to SVG viewBox coordinates (width=400, height=100)
    const pointsCount = values.length;
    const pointsString = values.map((val, idx) => {
      const x = (idx / (pointsCount - 1)) * 380 + 10;
      const y = 85 - (val / maxVal) * 70;
      return `${x},${y}`;
    }).join(" ");

    // For the filled area below line
    const areaPoints = `${10},85 ${pointsString} ${10 + (pointsCount - 1) * (380 / (pointsCount - 1))},85`;
    const currentVal = values[values.length - 1];

    return (
      <div className="glass-panel rounded-2xl p-5 border-gray-800 space-y-4">
        <div className="flex items-center justify-between border-b border-gray-850 pb-2">
          <span className="flex items-center gap-1.5 text-xs font-bold uppercase text-blue-400">
            <Activity className="h-4 w-4" /> Live {title} Telemetry
          </span>
          <span className={`text-xs font-bold font-mono px-2 py-0.5 rounded ${
            isExecuted ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"
          }`}>
            Current: {currentVal}{unit}
          </span>
        </div>
        
        {/* SVG Polyline Chart */}
        <div className="relative h-24 bg-gray-950/40 rounded-xl border border-gray-900/60 p-2 overflow-hidden">
          <svg className="w-full h-full" viewBox="0 0 400 100" preserveAspectRatio="none">
            <line x1="10" y1="15" x2="390" y2="15" stroke="rgba(255,255,255,0.02)" strokeWidth="1" />
            <line x1="10" y1="50" x2="390" y2="50" stroke="rgba(255,255,255,0.02)" strokeWidth="1" />
            <line x1="10" y1="85" x2="390" y2="85" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />

            <defs>
              <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={accentHex} stopOpacity="0.15" />
                <stop offset="100%" stopColor={accentHex} stopOpacity="0.0" />
              </linearGradient>
            </defs>
            <polygon points={areaPoints} fill="url(#chartGrad)" />

            <polyline
              fill="none"
              stroke={accentHex}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={pointsString}
              style={{ filter: "drop-shadow(0px 2px 4px rgba(0,0,0,0.5))" }}
            />
          </svg>
        </div>
        <div className="flex justify-between text-[10px] text-gray-500 font-mono">
          <span>Alert Triggered</span>
          {isExecuted && <span className="text-emerald-400">✓ Remediation Executed</span>}
          <span>Now</span>
        </div>
      </div>
    );
  };

  // GitHub Diff Viewer Generator
  const renderGitDiff = () => {
    if (!state.diagnosis) return null;

    const fileName = isLatencyScenario ? "db/queries.py" : "config/production.json";
    const diffLines = isLatencyScenario ? [
      { type: 'header', text: '--- a/db/queries.py' },
      { type: 'header', text: '+++ b/db/queries.py' },
      { type: 'info', text: '@@ -12,2 +12,2 @@' },
      { type: 'deletion', text: '-     query = "SELECT * FROM payment_methods"' },
      { type: 'addition', text: '+     query = "SELECT * FROM payment_methods WHERE status = \'active\'"' },
    ] : [
      { type: 'header', text: '--- a/config/production.json' },
      { type: 'header', text: '+++ b/config/production.json' },
      { type: 'info', text: '@@ -4,2 +4,2 @@' },
      { type: 'deletion', text: '-     "redis_host": "redis-cache",' },
      { type: 'addition', text: '+     "redis_host": "redis-cache-v2",' },
    ];

    return (
      <div className="glass-panel rounded-2xl p-5 border-gray-800 space-y-3 font-mono text-xs">
        <div className="flex items-center justify-between border-b border-gray-850 pb-2 mb-2 text-gray-400">
          <span className="flex items-center gap-1.5 font-sans font-bold uppercase text-[10px] text-indigo-400">
            <GitBranch className="h-4 w-4" /> Root-Cause Git Commit Diff
          </span>
          <span className="text-gray-500 text-[10px]">{isLatencyScenario ? "commit 8f3b2cd" : "commit 1c9a4ef"}</span>
        </div>
        <div className="text-gray-400 text-[11px] mb-1">File: <span className="text-white font-bold">{fileName}</span></div>
        <div className="bg-gray-950 rounded-lg border border-gray-900 overflow-hidden divide-y divide-gray-955">
          {diffLines.map((line, idx) => {
            let bg = "bg-transparent text-gray-400";
            if (line.type === 'header') bg = "bg-gray-900/60 text-gray-400 font-bold";
            if (line.type === 'info') bg = "bg-blue-950/20 text-blue-400";
            if (line.type === 'deletion') bg = "bg-rose-950/30 text-rose-400 border-l-2 border-rose-500 pl-1";
            if (line.type === 'addition') bg = "bg-emerald-950/30 text-emerald-400 border-l-2 border-emerald-500 pl-1";
            return (
              <div key={idx} className={`py-1.5 px-3 whitespace-pre ${bg}`}>
                {line.text}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="relative min-h-screen grid-bg flex flex-col z-10 px-4 sm:px-6 lg:px-8 py-6">
      
      {/* Top Navigation / Controls */}
      <nav className="w-full flex items-center justify-between border-b border-gray-800 pb-4 mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push("/")}
            className="p-2 border border-gray-800 hover:border-gray-700 bg-gray-950 rounded-lg text-gray-400 hover:text-white transition-colors cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="text-gray-400 font-normal">Incident</span> #{incidentId.substring(0, 8)}
            </h1>
            <p className="text-xs text-gray-500 font-mono">Status: {state.remediation_status.toUpperCase()}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 text-xs text-gray-400 border border-gray-800 bg-gray-950 px-3 py-1.5 rounded-lg">
            <span className={`h-1.5 w-1.5 rounded-full ${wsConnected ? "bg-emerald-400 animate-pulse" : "bg-rose-400"}`}></span>
            {wsConnected ? "Agent Connection Live" : "Reconnecting..."}
          </div>
          
          <div className="bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 animate-pulse">
            <Layers className="h-3.5 w-3.5" />
            {currentAgent} NODE
          </div>
        </div>
      </nav>

      {/* Main Layout Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1">
        
        {/* Left Pane - Topology & Agent Terminal (8/12 Columns) */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          
          {/* Topology Map */}
          <div className="glass-panel rounded-2xl p-6 border-gray-800 relative overflow-hidden">
            <div className="absolute top-4 left-4 flex items-center gap-2">
              <Server className="h-4 w-4 text-blue-400" />
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Environment Network Topology</span>
            </div>
            
            {/* SVG Network Map */}
            <div className="h-48 flex items-center justify-center mt-6">
              <svg width="100%" height="100%" viewBox="0 0 600 150" className="max-w-xl">
                <defs>
                  {/* Glowing Node Filter */}
                  <filter id="svgGlowBlue" x="-30%" y="-30%" width="160%" height="160%">
                    <feGaussianBlur stdDeviation="4" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                  <filter id="svgGlowGreen" x="-30%" y="-30%" width="160%" height="160%">
                    <feGaussianBlur stdDeviation="4" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                  <filter id="svgGlowRose" x="-30%" y="-30%" width="160%" height="160%">
                    <feGaussianBlur stdDeviation="6" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                  <filter id="svgGlowAmber" x="-30%" y="-30%" width="160%" height="160%">
                    <feGaussianBlur stdDeviation="5" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>

                  {/* Gradients */}
                  <radialGradient id="gradBlue" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#60a5fa" />
                    <stop offset="100%" stopColor="#1e3a8a" />
                  </radialGradient>
                  <radialGradient id="gradGreen" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#34d399" />
                    <stop offset="100%" stopColor="#064e3b" />
                  </radialGradient>
                  <radialGradient id="gradRose" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#f87171" />
                    <stop offset="100%" stopColor="#7f1d1d" />
                  </radialGradient>
                  <radialGradient id="gradAmber" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#fbbf24" />
                    <stop offset="100%" stopColor="#78350f" />
                  </radialGradient>
                  <radialGradient id="gradDark" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#374151" />
                    <stop offset="100%" stopColor="#111827" />
                  </radialGradient>
                </defs>

                {/* Connection lines */}
                {/* 1. API Gateway -> payment-service */}
                <line x1="100" y1="75" x2="250" y2="75" stroke="#1f2937" strokeWidth="4" strokeLinecap="round" />
                <line 
                  x1="100" y1="75" x2="250" y2="75" 
                  stroke={isExecuted ? "#10b981" : (isLatencyScenario ? "#f59e0b" : "#10b981")} 
                  strokeWidth="2" 
                  strokeDasharray="6,6" 
                  strokeLinecap="round"
                >
                  <animate attributeName="stroke-dashoffset" values="36;0" dur="1.5s" repeatCount="indefinite" />
                </line>

                {/* 2. payment-service -> auth-service */}
                <line x1="250" y1="75" x2="400" y2="75" stroke="#1f2937" strokeWidth="4" strokeLinecap="round" />
                <line 
                  x1="250" y1="75" x2="400" y2="75" 
                  stroke={isExecuted ? "#10b981" : (isLatencyScenario ? "#3b82f6" : "#f43f5e")} 
                  strokeWidth="2" 
                  strokeDasharray="6,6" 
                  strokeLinecap="round"
                >
                  <animate attributeName="stroke-dashoffset" values="36;0" dur="1.5s" repeatCount="indefinite" />
                </line>

                {/* 3. payment-service -> postgres-db (only active flow in latency scenario) */}
                {isLatencyScenario && (
                  <>
                    <line x1="250" y1="75" x2="520" y2="75" stroke="#1f2937" strokeWidth="4" strokeLinecap="round" />
                    <line 
                      x1="250" y1="75" x2="520" y2="75" 
                      stroke={isExecuted ? "#10b981" : "#f59e0b"} 
                      strokeWidth="2" 
                      strokeDasharray="6,6" 
                      strokeLinecap="round"
                    >
                      <animate attributeName="stroke-dashoffset" values="36;0" dur="1.2s" repeatCount="indefinite" />
                    </line>
                  </>
                )}

                {/* 4. auth-service -> redis-cache (only active flow in error scenario) */}
                {!isLatencyScenario && (
                  <>
                    <line x1="400" y1="75" x2="520" y2="75" stroke="#1f2937" strokeWidth="4" strokeLinecap="round" />
                    <line 
                      x1="400" y1="75" x2="520" y2="75" 
                      stroke={isExecuted ? "#10b981" : "#f43f5e"} 
                      strokeWidth="2" 
                      strokeDasharray="6,6" 
                      strokeLinecap="round"
                    >
                      <animate attributeName="stroke-dashoffset" values="36;0" dur="1.2s" repeatCount="indefinite" />
                    </line>
                  </>
                )}
                
                {/* Node 1: API Gateway (Always healthy) */}
                <g transform="translate(100, 75)">
                  <circle r="26" fill="url(#gradBlue)" stroke="#3b82f6" strokeWidth="2" filter="url(#svgGlowBlue)" />
                  <foreignObject x="-12" y="-12" width="24" height="24" className="pointer-events-none">
                    <Server className="h-6 w-6 text-white" />
                  </foreignObject>
                  <text y="42" textAnchor="middle" fill="#9ca3af" fontSize="9" fontWeight="bold" className="font-mono">api-gateway</text>
                </g>

                {/* Node 2: payment-service */}
                <g transform="translate(250, 75)">
                  {isLatencyScenario ? (
                    <>
                      <circle 
                        r="30" 
                        fill={isExecuted ? "url(#gradGreen)" : "url(#gradAmber)"} 
                        stroke={isExecuted ? "#10b981" : "#f59e0b"} 
                        strokeWidth="2.5" 
                        filter={isExecuted ? "url(#svgGlowGreen)" : "url(#svgGlowAmber)"}
                        className={isExecuted ? "" : "animate-pulse"} 
                      />
                      <foreignObject x="-12" y="-12" width="24" height="24" className="pointer-events-none">
                        <Layers className={`h-6 w-6 text-white ${isExecuted ? "" : "animate-bounce"}`} />
                      </foreignObject>
                    </>
                  ) : (
                    <>
                      <circle r="30" fill="url(#gradGreen)" stroke="#10b981" strokeWidth="2" filter="url(#svgGlowGreen)" />
                      <foreignObject x="-12" y="-12" width="24" height="24" className="pointer-events-none">
                        <Layers className="h-6 w-6 text-white" />
                      </foreignObject>
                    </>
                  )}
                  <text y="45" textAnchor="middle" fill="#ffffff" fontSize="10" fontWeight="bold" className="font-mono">payment-service</text>
                </g>

                {/* Node 3: auth-service */}
                <g transform="translate(400, 75)">
                  {!isLatencyScenario ? (
                    <>
                      <circle 
                        r="30" 
                        fill={isExecuted ? "url(#gradGreen)" : "url(#gradRose)"} 
                        stroke={isExecuted ? "#10b981" : "#f43f5e"} 
                        strokeWidth="2.5" 
                        filter={isExecuted ? "url(#svgGlowGreen)" : "url(#svgGlowRose)"}
                        className={isExecuted ? "" : "animate-pulse"} 
                      />
                      <foreignObject x="-12" y="-12" width="24" height="24" className="pointer-events-none">
                        <ShieldAlert className={`h-6 w-6 text-white ${isExecuted ? "" : "animate-bounce"}`} />
                      </foreignObject>
                    </>
                  ) : (
                    <>
                      <circle r="30" fill="url(#gradBlue)" stroke="#3b82f6" strokeWidth="2" filter="url(#svgGlowBlue)" />
                      <foreignObject x="-12" y="-12" width="24" height="24" className="pointer-events-none">
                        <ShieldAlert className="h-6 w-6 text-white" />
                      </foreignObject>
                    </>
                  )}
                  <text y="45" textAnchor="middle" fill="#ffffff" fontSize="10" fontWeight="bold" className="font-mono">auth-service</text>
                </g>

                {/* Node 4: Database / Cache */}
                <g transform="translate(520, 75)">
                  {isLatencyScenario ? (
                    // Postgres DB Node (Latency target)
                    <>
                      <circle 
                        r="26" 
                        fill={isExecuted ? "url(#gradGreen)" : "url(#gradAmber)"} 
                        stroke={isExecuted ? "#10b981" : "#f59e0b"} 
                        strokeWidth="2" 
                        filter={isExecuted ? "url(#svgGlowGreen)" : "url(#svgGlowAmber)"}
                      />
                      <foreignObject x="-12" y="-12" width="24" height="24" className="pointer-events-none">
                        <Database className="h-6 w-6 text-white" />
                      </foreignObject>
                      <text y="42" textAnchor="middle" fill="#9ca3af" fontSize="9" fontWeight="bold" className="font-mono">postgres-db</text>
                    </>
                  ) : (
                    // Redis Cache Node (Error target)
                    <>
                      <circle 
                        r="26" 
                        fill={isExecuted ? "url(#gradGreen)" : "url(#gradRose)"} 
                        stroke={isExecuted ? "#10b981" : "#f43f5e"} 
                        strokeWidth="2" 
                        filter={isExecuted ? "url(#svgGlowGreen)" : "url(#svgGlowRose)"}
                      />
                      <foreignObject x="-12" y="-12" width="24" height="24" className="pointer-events-none">
                        <Database className="h-6 w-6 text-white" />
                      </foreignObject>
                      <text y="42" textAnchor="middle" fill="#9ca3af" fontSize="9" fontWeight="bold" className="font-mono">redis-cache</text>
                    </>
                  )}
                </g>
              </svg>
            </div>
          </div>

          {/* Navigation Tab Header for Left Pane */}
          <div className="flex border-b border-gray-800">
            <button
              onClick={() => setActiveTab("terminal")}
              className={`py-3 px-6 text-sm font-semibold flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
                activeTab === "terminal" 
                  ? "border-blue-500 text-blue-400" 
                  : "border-transparent text-gray-400 hover:text-gray-200"
              }`}
            >
              <Terminal className="h-4 w-4" /> Agent Terminal Console
            </button>
            
            <button
              onClick={() => setActiveTab("splunk")}
              className={`py-3 px-6 text-sm font-semibold flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
                activeTab === "splunk" 
                  ? "border-blue-500 text-blue-400" 
                  : "border-transparent text-gray-400 hover:text-gray-200"
              }`}
            >
              <Search className="h-4 w-4" /> Splunk MCP Query Logs ({state.splunk_queries.length})
            </button>

            <button
              onClick={() => setActiveTab("audit")}
              className={`py-3 px-6 text-sm font-semibold flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
                activeTab === "audit" 
                  ? "border-blue-500 text-blue-400" 
                  : "border-transparent text-gray-400 hover:text-gray-200"
              }`}
            >
              <FileText className="h-4 w-4" /> Splunk Audit Trail ({state.audit_logs.length})
            </button>

            <button
              onClick={() => setActiveTab("slack")}
              className={`py-3 px-6 text-sm font-semibold flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
                activeTab === "slack" 
                  ? "border-blue-500 text-blue-400" 
                  : "border-transparent text-gray-400 hover:text-gray-200"
              }`}
            >
              <MessageSquare className="h-4 w-4 text-purple-400" /> ChatOps Slack Alert
            </button>
          </div>

          {/* Tab Content 1: Terminal Console */}
          {activeTab === "terminal" && (
            <div className="glass-panel rounded-2xl flex-1 flex flex-col h-[500px] border-gray-800 overflow-hidden relative">
              <div className="terminal-scanline"></div>
              {/* Terminal header */}
              <div className="bg-gray-950 px-4 py-2 flex items-center justify-between border-b border-gray-900 text-xs font-mono text-gray-500">
                <span>TERMINAL STATE LOGGER: INCIDENT_MONITOR_FLOW</span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping"></span>
                  STREAMING
                </span>
              </div>
              
              {/* Terminal Messages Output */}
              <div className="flex-1 p-6 overflow-y-auto space-y-6 font-mono text-sm">
                
                {/* Alert Warning Box */}
                <div className="p-4 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-bold text-white">Alert Trigger Ingested</h3>
                    <p className="text-xs text-rose-400/80 mt-1">{state.alert_name} (Symptoms: {state.symptoms})</p>
                  </div>
                </div>

                {state.messages.map((msg, index) => {
                  // Determine Agent coloring styles
                  const isTriage = msg.name === "TriageAgent";
                  const isDiagnose = msg.name === "DiagnosticianAgent";
                  const isRemediate = msg.name === "RemediationAgent";
                  const isAudit = msg.name === "AuditorAgent";
                  const isUser = msg.role === "user";

                  let accentColor = "text-blue-400 bg-blue-500/10 border-blue-500/20";
                  if (isDiagnose) accentColor = "text-indigo-400 bg-indigo-500/10 border-indigo-500/20";
                  if (isRemediate) accentColor = "text-amber-400 bg-amber-500/10 border-amber-500/20";
                  if (isAudit) accentColor = "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
                  if (isUser) accentColor = "text-purple-400 bg-purple-500/10 border-purple-500/20";

                  return (
                    <div key={index} className="space-y-2 border-l-2 border-gray-800 pl-4 py-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded border ${accentColor}`}>
                          {msg.name || "Agent"}
                        </span>
                        <span className="text-gray-500 text-xs">t+{index * 30}s</span>
                      </div>
                      <div className="text-gray-300 pl-1">
                        {formatText(msg.content)}
                      </div>
                    </div>
                  );
                })}

                <div ref={terminalEndRef} />
              </div>
            </div>
          )}

          {/* Tab Content 2: Splunk Query Log */}
          {activeTab === "splunk" && (
            <div className="glass-panel rounded-2xl flex-1 p-6 border-gray-800 space-y-6 h-[500px] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-gray-800 pb-3">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Queries Generated & Executed by SRE Team</h3>
                <span className="text-xs font-semibold px-2 py-1 bg-gray-800 text-gray-400 rounded-lg">Splunk Index Search API</span>
              </div>

              {state.splunk_queries.length === 0 ? (
                <div className="py-20 text-center text-gray-500 font-mono">
                  No Splunk searches executed yet. Diagnostician Agent will launch queries soon.
                </div>
              ) : (
                <div className="space-y-4 font-mono text-xs">
                  {state.splunk_queries.map((query, idx) => (
                    <div key={idx} className="bg-gray-950 border border-gray-900 rounded-xl p-4 relative group">
                      <div className="flex items-center justify-between text-gray-500 mb-2 border-b border-gray-900 pb-1.5">
                        <span>Search #{idx + 1}</span>
                        <button
                          onClick={() => copyToClipboard(query, idx)}
                          className="text-blue-400 hover:text-blue-300 p-1 hover:bg-gray-900 rounded transition-all flex items-center gap-1 cursor-pointer"
                        >
                          <Copy className="h-3.5 w-3.5" />
                          {copiedQueryIndex === idx ? "Copied!" : "Copy"}
                        </button>
                      </div>
                      <pre className="whitespace-pre-wrap leading-relaxed text-slate-300 font-mono">{highlightSPL(query)}</pre>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tab Content 3: Splunk Audit Trail */}
          {activeTab === "audit" && (
            <div className="glass-panel rounded-2xl flex-1 p-6 border-gray-800 space-y-6 h-[500px] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-gray-800 pb-3">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">AI Operations Audit Trail</h3>
                <span className="text-xs font-semibold px-2 py-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-lg">index=sre_audit</span>
              </div>

              {state.audit_logs.length === 0 ? (
                <div className="py-20 text-center text-gray-500 font-mono">
                  Waiting for Auditor Agent to log final resolution states back into Splunk audit index...
                </div>
              ) : (
                <div className="space-y-4 font-mono text-xs">
                  {state.audit_logs.map((log, idx) => (
                    <div key={idx} className="bg-gray-950 border border-gray-900 rounded-xl p-4 space-y-2">
                      <div className="flex items-center justify-between text-gray-500 border-b border-gray-900 pb-1.5">
                        <span className="text-emerald-400 font-bold">Audit Entry #{idx + 1}</span>
                        <span>{log.timestamp}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 py-1 text-gray-400">
                        <div><strong>Agent Name:</strong> {log.agent}</div>
                        <div><strong>Status:</strong> {log.status}</div>
                        <div><strong>Tokens Ingested:</strong> {log.tokens_used}</div>
                      </div>
                      <div className="text-white bg-gray-900 p-2.5 rounded border border-gray-800 whitespace-pre-wrap leading-relaxed">
                        {log.action}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}          {/* Tab Content 4: Slack ChatOps Simulator */}
          {activeTab === "slack" && (
            <div className="glass-panel rounded-2xl flex-1 border-gray-800 h-[580px] overflow-hidden flex flex-row">
              {/* Slack Workspace Sidebar */}
              <div className="w-60 bg-[#1a111e] border-r border-[#2d1d33] flex flex-col shrink-0 text-slate-300 select-none hidden md:flex">
                {/* Workspace Header */}
                <div className="p-4 border-b border-[#2d1d33] flex items-center justify-between hover:bg-[#2c1b30] cursor-pointer transition-colors group">
                  <div className="flex flex-col">
                    <span className="font-bold text-white text-sm flex items-center gap-1.5">
                      Splunk ChatOps
                      <ChevronRight className="h-3 w-3 rotate-90 text-slate-400 group-hover:text-white" />
                    </span>
                    <span className="text-[10px] text-[#bca0ca] flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
                      nishant (on-call)
                    </span>
                  </div>
                  <div className="h-8 w-8 rounded-lg bg-purple-900/50 border border-purple-500/20 flex items-center justify-center text-purple-300 text-xs font-bold font-sans">
                    S
                  </div>
                </div>
                
                {/* Sidebar Items */}
                <div className="flex-1 overflow-y-auto py-4 space-y-4 text-xs font-sans">
                  {/* Channels Section */}
                  <div className="space-y-0.5">
                    <div className="px-4 py-1 text-[#bca0ca] font-bold uppercase text-[9px] tracking-wider flex items-center justify-between">
                      <span>Channels</span>
                      <span className="text-xs hover:text-white cursor-pointer">+</span>
                    </div>
                    <div className="px-4 py-1.5 bg-[#1164a3]/20 text-white font-bold flex items-center gap-1.5 border-l-4 border-[#1164a3] cursor-pointer">
                      <Hash className="h-3.5 w-3.5 text-[#bca0ca]" />
                      <span>incident-alerts</span>
                      <span className="ml-auto bg-rose-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">1</span>
                    </div>
                    <div className="px-4 py-1.5 flex items-center gap-1.5 hover:bg-[#350d36] hover:text-white cursor-pointer rounded-r-md">
                      <Hash className="h-3.5 w-3.5 text-slate-400" />
                      <span>ops-warroom</span>
                    </div>
                    <div className="px-4 py-1.5 flex items-center gap-1.5 hover:bg-[#350d36] hover:text-white cursor-pointer rounded-r-md">
                      <Hash className="h-3.5 w-3.5 text-slate-400" />
                      <span>deployments</span>
                    </div>
                  </div>

                  {/* Direct Messages Section */}
                  <div className="space-y-0.5">
                    <div className="px-4 py-1 text-[#bca0ca] font-bold uppercase text-[9px] tracking-wider flex items-center justify-between">
                      <span>Direct Messages</span>
                      <span className="text-xs hover:text-white cursor-pointer">+</span>
                    </div>
                    <div className="px-4 py-1.5 flex items-center gap-2 hover:bg-[#350d36] hover:text-white cursor-pointer rounded-r-md">
                      <span className="h-2 w-2 rounded-full bg-emerald-400 shrink-0"></span>
                      <span className="font-bold text-white">Auto-SRE Bot</span>
                      <span className="bg-gray-800 text-[9px] text-gray-400 px-1 py-0.2 rounded font-mono">APP</span>
                    </div>
                    <div className="px-4 py-1.5 flex items-center gap-2 hover:bg-[#350d36] hover:text-white cursor-pointer rounded-r-md">
                      <span className="h-2 w-2 rounded-full bg-emerald-400 shrink-0"></span>
                      <span>pagerduty-bot</span>
                    </div>
                    <div className="px-4 py-1.5 flex items-center gap-2 hover:bg-[#350d36] hover:text-white cursor-pointer rounded-r-md">
                      <span className="h-2 w-2 rounded bg-amber-400 shrink-0"></span>
                      <span>Splunk MCP Server</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Slack Chat Window */}
              <div className="flex-1 bg-[#1a1d21] flex flex-col overflow-hidden text-slate-300 font-sans">
                {/* Chat Header */}
                <div className="h-14 border-b border-gray-800/80 px-6 flex items-center justify-between shrink-0 bg-[#1e2226]">
                  <div className="flex flex-col">
                    <span className="font-bold text-white text-sm flex items-center gap-1.5">
                      <Hash className="h-4 w-4 text-slate-400 shrink-0" />
                      incident-alerts
                    </span>
                    <span className="text-[10px] text-slate-400">
                      ⭐ | 12 members | Auto-SRE operations monitoring & fast validation room.
                    </span>
                  </div>
                </div>

                {/* Messages Stream */}
                <div className="flex-1 p-6 overflow-y-auto space-y-6">
                  
                  {/* Day Divider */}
                  <div className="relative flex items-center justify-center my-2">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-gray-800/50"></div>
                    </div>
                    <span className="relative bg-[#1a1d21] px-3 text-[10px] font-bold uppercase text-slate-400 tracking-wider font-mono">
                      Today
                    </span>
                  </div>

                  {/* Message 1: Alert Trigger */}
                  <div className="flex gap-3 text-sm">
                    <div className="h-9 w-9 rounded-lg bg-red-950 border border-red-500/30 flex items-center justify-center text-red-400 font-bold shrink-0 font-mono">
                      PD
                    </div>
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-xs">pagerduty-bot</span>
                        <span className="bg-gray-800 text-[9px] text-gray-400 px-1 py-0.2 rounded font-mono">APP</span>
                        <span className="text-gray-500 text-[10px]">09:12 AM</span>
                      </div>
                      <div className="text-gray-300 text-xs leading-relaxed">
                        <span className="text-rose-400 font-bold">🚨 CRITICAL INCIDENT TRIGGERED:</span> Outage detected on service <code className="bg-gray-950 px-1.5 py-0.5 rounded border border-gray-800 font-mono text-[11px] text-white">{state.service}</code>. Incident room launched. Escalated to primary on-call: <span className="text-blue-400 font-semibold">@nishant</span>.
                      </div>
                    </div>
                  </div>

                  {/* Message 2: SRE Bot alert */}
                  <div className="flex gap-3 text-sm">
                    <div className="h-9 w-9 rounded-lg bg-purple-900 border border-purple-500/20 flex items-center justify-center text-white font-bold text-sm shrink-0">
                      SRE
                    </div>
                    <div className="space-y-2 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-xs">Auto-SRE Bot</span>
                        <span className="bg-purple-950/40 text-purple-300 text-[9px] px-1 py-0.2 rounded font-mono font-bold border border-purple-500/20">APP</span>
                        <span className="text-gray-500 text-[10px]">09:15 AM</span>
                      </div>
                      
                      {/* Interactive Slack Message Attachment */}
                      <div className={`border-l-4 ${isLatencyScenario ? "border-amber-500" : "border-rose-500"} bg-gray-900/60 p-4 rounded-r-xl border border-y-gray-800/60 border-r-gray-800/60 space-y-3 max-w-xl`}>
                        <div className="font-bold text-white text-sm flex items-center gap-1.5">
                          {isLatencyScenario ? "⚠️ Performance Degradation Alert" : "🔴 Production Service Failure Alert"}
                        </div>
                        <div className="text-xs text-gray-300 space-y-1.5">
                          <div><strong>Incident ID:</strong> <span className="font-mono text-white text-[11px]">{state.incident_id.substring(0, 12)}...</span></div>
                          <div><strong>Service:</strong> <code className="bg-gray-950 px-1.5 py-0.5 rounded border border-gray-850 font-mono text-emerald-400">{state.service}</code></div>
                          <div><strong>Alert Name:</strong> <span className="text-gray-200">{state.alert_name}</span></div>
                          <div><strong>Symptoms:</strong> <span className="text-gray-300">{state.symptoms}</span></div>
                        </div>

                        {state.diagnosis && (
                          <div className="bg-[#1e2226] p-3 rounded-lg border border-gray-800/80 text-[11px] text-gray-400 leading-relaxed font-mono">
                            <span className="text-purple-400 font-bold block mb-1">🤖 AGENT DIAGNOSIS:</span>
                            {state.diagnosis.substring(0, 240)}...
                          </div>
                        )}

                        {state.user_approval_needed && state.proposed_remediation.options ? (
                          <div className="space-y-3 pt-2">
                            <div className="text-[11px] text-amber-400 font-bold flex items-center gap-1.5">
                              <ShieldAlert className="h-3.5 w-3.5" /> Action Required: Authorize remediation to resolve incident
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {state.proposed_remediation.options.map((option: any, oIdx: number) => (
                                <button
                                  key={oIdx}
                                  onClick={() => handleAction("approve", option)}
                                  className="px-3 py-1.5 bg-[#2eb67d] hover:bg-[#259b69] text-white rounded font-bold text-xs cursor-pointer shadow transition-all active:scale-95"
                                >
                                  Approve: {option.title}
                                </button>
                              ))}
                              <button
                                onClick={() => handleAction("reject")}
                                className="px-3 py-1.5 bg-[#e01e5a] hover:bg-[#c1154c] text-white rounded font-bold text-xs cursor-pointer shadow transition-all active:scale-95"
                              >
                                Reject & Escalate
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="pt-2">
                            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                              state.remediation_status === "executed"
                                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                                : (state.remediation_status === "rejected" ? "bg-rose-500/10 border-rose-500/20 text-rose-400" : "bg-blue-500/10 border-blue-500/20 text-blue-400")
                            }`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${state.remediation_status === "executed" ? "bg-emerald-400" : (state.remediation_status === "rejected" ? "bg-rose-400" : "bg-blue-400 animate-pulse")}`}></span>
                              Incident Status: {state.remediation_status.toUpperCase()}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Emoji Reactions Row */}
                      <div className="flex gap-1.5 pt-1.5 select-none">
                        <button 
                          onClick={() => toggleReaction("thumbsUp")}
                          className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-semibold transition-all cursor-pointer ${
                            reactions.thumbsUp.clicked 
                              ? "bg-[#1164a3]/20 border-[#1164a3] text-blue-400" 
                              : "bg-gray-900 border-gray-800 text-slate-400 hover:border-slate-600 hover:text-white"
                          }`}
                        >
                          <span>👍</span>
                          <span className="text-[10px]">{reactions.thumbsUp.count}</span>
                        </button>
                        <button 
                          onClick={() => toggleReaction("eyes")}
                          className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-semibold transition-all cursor-pointer ${
                            reactions.eyes.clicked 
                              ? "bg-[#1164a3]/20 border-[#1164a3] text-blue-400" 
                              : "bg-gray-900 border-gray-800 text-slate-400 hover:border-slate-600 hover:text-white"
                          }`}
                        >
                          <span>👀</span>
                          <span className="text-[10px]">{reactions.eyes.count}</span>
                        </button>
                        <button 
                          onClick={() => toggleReaction("fire")}
                          className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-semibold transition-all cursor-pointer ${
                            reactions.fire.clicked 
                              ? "bg-[#1164a3]/20 border-[#1164a3] text-blue-400" 
                              : "bg-gray-900 border-gray-800 text-slate-400 hover:border-slate-600 hover:text-white"
                          }`}
                        >
                          <span>🔥</span>
                          <span className="text-[10px]">{reactions.fire.count}</span>
                        </button>
                        <button 
                          onClick={() => toggleReaction("heart")}
                          className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-xs font-semibold transition-all cursor-pointer ${
                            reactions.heart.clicked 
                              ? "bg-[#1164a3]/20 border-[#1164a3] text-blue-400" 
                              : "bg-gray-900 border-gray-800 text-slate-400 hover:border-slate-600 hover:text-white"
                          }`}
                        >
                          <span>💚</span>
                          <span className="text-[10px]">{reactions.heart.count}</span>
                        </button>
                      </div>
                    </div>
                  </div>

                </div>

                {/* Message Input Container */}
                <div className="p-4 bg-[#1e2226] border-t border-gray-800/80 shrink-0">
                  <div className="border border-gray-800 rounded-lg bg-gray-950 overflow-hidden focus-within:border-gray-700 transition-colors flex flex-col">
                    {/* Mock Text Toolbar */}
                    <div className="flex gap-3 px-3 py-1.5 border-b border-gray-900 text-slate-400">
                      <Bold className="h-3.5 w-3.5 hover:text-white cursor-pointer" />
                      <Italic className="h-3.5 w-3.5 hover:text-white cursor-pointer" />
                      <Code className="h-3.5 w-3.5 hover:text-white cursor-pointer" />
                      <List className="h-3.5 w-3.5 hover:text-white cursor-pointer" />
                      <span className="text-gray-800">|</span>
                      <Paperclip className="h-3.5 w-3.5 hover:text-white cursor-pointer" />
                      <Smile className="h-3.5 w-3.5 hover:text-white cursor-pointer" />
                    </div>
                    {/* Input field */}
                    <div className="flex items-center px-4 py-2 bg-transparent text-sm">
                      <input 
                        type="text" 
                        placeholder="Reply to Auto-SRE Bot... (Read-Only in Alert Room)" 
                        className="w-full bg-transparent border-none outline-none text-slate-300 placeholder-slate-500 py-1"
                        disabled
                      />
                      <button className="p-1 text-slate-600 cursor-not-allowed ml-2 shrink-0">
                        <Send className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Right Pane - Action, Remediation & Approvals (4/12 Columns) */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Action Center Card */}
          <div className="glass-panel rounded-2xl p-6 border-gray-800 space-y-6">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 border-b border-gray-800 pb-3">
              <Layers className="h-4 w-4 text-blue-400" /> SRE Action Center
            </h2>

            {/* Current Phase Tracker */}
            <div className="space-y-4">
              <h3 className="text-xs font-semibold text-gray-400 uppercase">Remediation Status</h3>
              
              <div className="flex items-center gap-3 bg-gray-900/40 p-4 rounded-xl border border-gray-800">
                {state.remediation_status === "executed" && (
                  <>
                    <CheckCircle className="h-8 w-8 text-emerald-400 shrink-0" />
                    <div>
                      <h4 className="font-bold text-white">System Recovered</h4>
                      <p className="text-xs text-gray-400">Self-healing remediation applied and audited.</p>
                    </div>
                  </>
                )}
                {state.remediation_status === "rejected" && (
                  <>
                    <XCircle className="h-8 w-8 text-rose-400 shrink-0" />
                    <div>
                      <h4 className="font-bold text-white">Action Denied</h4>
                      <p className="text-xs text-gray-400">Remediation rejected by SRE operator.</p>
                    </div>
                  </>
                )}
                {state.remediation_status === "pending" && !state.user_approval_needed && (
                  <>
                    <div className="h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin shrink-0"></div>
                    <div>
                      <h4 className="font-bold text-white">Investigating Logs...</h4>
                      <p className="text-xs text-gray-400">Triage & Diagnostician agents analyzing Splunk.</p>
                    </div>
                  </>
                )}
                {state.remediation_status === "pending" && state.user_approval_needed && (
                  <>
                    <ShieldAlert className="h-8 w-8 text-amber-500 shrink-0 animate-bounce" />
                    <div>
                      <h4 className="font-bold text-white">Confirmation Required</h4>
                      <p className="text-xs text-gray-400">Waiting for operator approval of proposed fix.</p>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* PagerDuty On-Call Integration Panel */}
            <div className="border-t border-gray-850 pt-4 space-y-2.5">
              <h3 className="text-xs font-semibold text-gray-400 uppercase">On-Call Escalation (PagerDuty)</h3>
              <div className="flex items-center justify-between text-xs bg-gray-950/50 p-3 rounded-lg border border-gray-900">
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-full bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400 font-bold text-[10px]">
                    N
                  </div>
                  <span className="text-white font-medium">Nishant (Primary On-Call)</span>
                </div>
                <span className="text-emerald-400 font-bold font-mono">ACKNOWLEDGED</span>
              </div>
            </div>

            {/* Proposed Remediation Plan */}
            {state.proposed_remediation.options && (
              <div className="bg-gray-950 p-4 rounded-xl border border-gray-900 space-y-3 font-mono text-xs">
                <h4 className="font-bold text-gray-400 uppercase tracking-wider text-[10px]">Active Options Count: {state.proposed_remediation.options.length}</h4>
                <div className="space-y-1.5 text-gray-400">
                  <div><strong>Remedy A:</strong> {state.proposed_remediation.options[0].action_type}</div>
                  <div><strong>Remedy B:</strong> {state.proposed_remediation.options[1]?.action_type || "N/A"}</div>
                </div>
              </div>
            )}

            {/* Human-in-the-Loop Approval Block */}
            {state.user_approval_needed && state.proposed_remediation.options && (
              <div className="p-5 border rounded-2xl glow-border-amber bg-amber-500/5 space-y-4">
                <div className="flex items-start gap-2.5">
                  <ShieldAlert className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-bold text-white">Authorize Safe Remediation</h3>
                    <p className="text-xs text-gray-400 mt-1">
                      Remediation Agent requires human authorization. Select one of the compiled recovery plans below:
                    </p>
                  </div>
                </div>

                <div className="space-y-3 pt-1">
                  {state.proposed_remediation.options.map((option: any, oIdx: number) => {
                    const isSql = option.action_type === "execute_sql";
                    return (
                      <button
                        key={oIdx}
                        onClick={() => handleAction("approve", option)}
                        className="w-full text-left p-3 rounded-xl border border-gray-800 hover:border-blue-500/50 bg-gray-950/70 hover:bg-gray-900 transition-all group flex flex-col cursor-pointer"
                      >
                        <span className="text-xs font-bold text-white group-hover:text-blue-400 transition-colors">
                          {option.title}
                        </span>
                        {isSql ? (
                          <code className="mt-2 text-[9px] text-emerald-400 bg-gray-950 p-2 rounded border border-gray-900 whitespace-pre-wrap select-all font-mono">
                            {option.value}
                          </code>
                        ) : (
                          <span className="mt-1 text-[10px] text-gray-400 font-mono">
                            revert: {option.target}
                          </span>
                        )}
                      </button>
                    );
                  })}

                  <button
                    onClick={() => handleAction("reject")}
                    className="w-full py-2.5 px-4 bg-rose-600/10 hover:bg-rose-600/20 text-rose-400 hover:text-rose-300 rounded-xl font-semibold text-xs border border-rose-500/20 cursor-pointer active:scale-95 transition-all text-center"
                  >
                    Reject Plans (Cancel Incident)
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Live Telemetry Chart */}
          {renderMetricsChart()}

          {/* Diagnostic Information Card */}
          <div className="glass-panel rounded-2xl p-6 border-gray-800 space-y-4">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2 border-b border-gray-800 pb-3">
              <ChevronRight className="h-4 w-4 text-blue-400" /> Alert Blast Radius
            </h2>
            
            <div className="space-y-3 text-xs leading-relaxed text-gray-400">
              <div>
                <strong className="text-gray-300">Target Alert:</strong>
                <p className="mt-1 text-white bg-gray-950 p-2 rounded border border-gray-900 font-mono">{state.alert_name}</p>
              </div>
              <div>
                <strong className="text-gray-300">Symptoms:</strong>
                <p className="mt-1 text-gray-300">{state.symptoms}</p>
              </div>
              <div>
                <strong className="text-gray-300">Root-Cause Analysis (RCA):</strong>
                <p className="mt-1 text-gray-300 leading-relaxed bg-gray-950/50 p-3 rounded-lg border border-gray-800">
                  {state.diagnosis || "Triage & Diagnostician agents are actively scanning logs to isolate root cause. Monitor the terminal stream for progress."}
                </p>
              </div>
            </div>
          </div>

          {/* Git Diff Root Cause Viewer */}
          {renderGitDiff()}

        </div>

      </div>
    </div>
  );
}
