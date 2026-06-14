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
  AlertTriangle, 
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
  List,
  Volume2,
  VolumeX
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
  
  const keywords = /\b(index|sourcetype|stats|eval|where|fields|dedup|table|sort|rex|timechart|rename|search|transaction|head|tail|top|limit|as|by)\b/gi;
  const aggFunctions = /\b(count|sum|avg|min|max|dc|values|list)\b(?=\s*\()/gi;
  const booleanOps = /\b(AND|OR|NOT)\b/g;
  
  const tokens = query.split(/("[^"]*"|'[^']*'|\||!=|>=|<=|=|>|<|\s+)/);
  
  return tokens.map((token, idx) => {
    if (!token) return null;
    
    // String literals
    if ((token.startsWith('"') && token.endsWith('"')) || (token.startsWith("'") && token.endsWith("'"))) {
      return <span key={idx} className="text-cyan-400 font-medium">{token}</span>;
    }
    
    // Pipe operator
    if (token === '|') {
      return <span key={idx} className="text-amber-500 font-semibold mx-1">{token}</span>;
    }
    
    // Assignment/Comparison operators
    if (['=', '!=', '>', '<', '>=', '<='].includes(token)) {
      return <span key={idx} className="text-amber-400 font-medium">{token}</span>;
    }
    
    // Whitespace
    if (/^\s+$/.test(token)) {
      return <span key={idx}>{token}</span>;
    }
    
    // Keywords & commands
    const trimmed = token.trim();
    if (keywords.test(trimmed)) {
      keywords.lastIndex = 0; // reset regex index
      return <span key={idx} className="text-fuchsia-400 font-semibold">{token}</span>;
    }
    
    // Aggregate metrics functions
    if (aggFunctions.test(trimmed)) {
      aggFunctions.lastIndex = 0; // reset
      return <span key={idx} className="text-purple-400 font-medium">{token}</span>;
    }
    
    // Boolean operators
    if (booleanOps.test(trimmed)) {
      booleanOps.lastIndex = 0; // reset
      return <span key={idx} className="text-orange-400 font-semibold">{token}</span>;
    }

    // Number literals
    if (/^\d+(\.\d+)?$/.test(trimmed)) {
      return <span key={idx} className="text-emerald-400 font-mono">{token}</span>;
    }

    // General token
    return <span key={idx} className="text-slate-350">{token}</span>;
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
  const slackEndRef = useRef<HTMLDivElement>(null);

  // New Voice Assistant State
  const [isSpeaking, setIsSpeaking] = useState(false);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // New Slack ChatOps State
  const [slackMessages, setSlackMessages] = useState<any[]>([]);
  const [slackInput, setSlackInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);

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

  // Scroll to bottom of Slack chat whenever messages are added
  useEffect(() => {
    slackEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [slackMessages, isTyping]);

  // Initialize Speech Synthesis
  useEffect(() => {
    synthRef.current = window.speechSynthesis;
    return () => {
      synthRef.current?.cancel();
    };
  }, []);

  // Initialize Slack Chat logs
  useEffect(() => {
    if (state && slackMessages.length === 0) {
      const initial = [
        {
          role: "bot",
          name: "Auto-SRE Bot",
          time: "12:05 PM",
          content: `CRITICAL ALERT: ${state.alert_name}\nService: ${state.service || "Evaluating..."}\nSymptoms: ${state.symptoms}\nTriage node completed. Transitioned to DIAGNOSE node.`
        }
      ];
      if (state.diagnosis) {
        initial.push({
          role: "diag",
          name: "Diagnostician Agent",
          time: "12:06 PM",
          content: `Root Cause Analysis Complete:\n${state.diagnosis}`
        });
      }
      setSlackMessages(initial);
    }
  }, [state]);

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

  // SRE Speech Synthesis Trigger
  const toggleSpeech = () => {
    if (!state?.diagnosis) return;
    if (isSpeaking) {
      synthRef.current?.cancel();
      setIsSpeaking(false);
    } else {
      synthRef.current?.cancel();
      // Remove markdown characters for cleaner TTS readout
      const cleanText = state.diagnosis.replace(/[`*#]/g, "");
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);
      utteranceRef.current = utterance;
      setIsSpeaking(true);
      synthRef.current?.speak(utterance);
    }
  };

  // Slack Message Send & Simulated Bot Reply
  const handleSendSlackMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!slackInput.trim()) return;
    
    const userMsg = {
      role: "user",
      name: "SRE Operator",
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      content: slackInput
    };
    
    setSlackMessages(prev => [...prev, userMsg]);
    const inputVal = slackInput.toLowerCase();
    setSlackInput("");
    setIsTyping(true);
    
    setTimeout(() => {
      setIsTyping(false);
      let replyContent = "";
      if (inputVal.includes("status") || inputVal.includes("cpu") || inputVal.includes("health")) {
        replyContent = `Auto-SRE System Status Check:\n- Targeted Service: ${state?.service}\n- Current Healing State: ${state?.remediation_status.toUpperCase()}\n- Executed Node: ${state?.current_node.toUpperCase()}\n- Telemetry feed: Online (Active)`;
      } else if (inputVal.includes("logs") || inputVal.includes("errors") || inputVal.includes("query")) {
        replyContent = `Splunk Index Query Ingestion Logs:\n${state?.splunk_queries.length ? state.splunk_queries.map((q, idx) => `[Search #${idx+1}]: ${q}`).join("\n") : "No searches logged."}`;
      } else if (inputVal.includes("help") || inputVal.includes("commands")) {
        replyContent = `Auto-SRE ChatOps commands available:\n- \`status\` / \`health\` - View current service health and load details\n- \`logs\` / \`query\` - View generated Splunk queries\n- \`remediate\` - View proposed recovery recommendation options`;
      } else if (inputVal.includes("remediate") || inputVal.includes("fix") || inputVal.includes("approve")) {
        replyContent = `Proposed Remediation Recommendations:\n${state?.proposed_remediation?.options ? state.proposed_remediation.options.map((o, idx) => `Option ${idx+1}: ${o.title} (${o.value})`).join("\n") : "No active remedies proposed."}`;
      } else {
        replyContent = `Received SRE command request: "${inputVal}". I am monitoring the active LangGraph execution. Type \`help\` to see SRE bot commands.`;
      }
      
      setSlackMessages(prev => [...prev, {
        role: "bot",
        name: "Auto-SRE Bot",
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        content: replyContent
      }]);
    }, 1200);
  };

  if (!state) {
    return (
      <div className="min-h-screen bg-[#070709] flex flex-col items-center justify-center text-gray-400">
        <div className="h-10 w-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-xs font-medium tracking-wider uppercase">Loading SRE Investigation Desk...</p>
      </div>
    );
  }

  // Determine scenario details for rendering
  const isLatencyScenario = state.alert_name.toLowerCase().includes("latency");
  const isThrottlingScenario = state.alert_name.toLowerCase().includes("throttling") || state.service === "api-gateway";
  const currentAgent = state.current_node ? state.current_node.toUpperCase() : "TRIAGE";
  const isExecuted = state.remediation_status === "executed";

  // Simple text formatter to handle bold, inline code, and bullet lists in agent outputs
  const formatText = (text: string) => {
    if (!text) return "";
    return text.split("\n").map((line, idx) => {
      if (line.startsWith("# ")) return <h1 key={idx} className="text-lg font-semibold text-white mt-4 mb-2">{line.replace("# ", "")}</h1>;
      if (line.startsWith("### ")) return <h3 key={idx} className="text-sm font-semibold text-gray-200 mt-3 mb-1">{line.replace("### ", "")}</h3>;
      if (line.startsWith("## ")) return <h2 key={idx} className="text-base font-semibold text-white mt-4 mb-2">{line.replace("## ", "")}</h2>;
      
      if (line.startsWith("- ") || line.startsWith("* ")) {
        return (
          <li key={idx} className="ml-4 list-disc text-gray-300 my-1 text-xs sm:text-sm">
            {line.substring(2)}
          </li>
        );
      }
      
      return <p key={idx} className="text-gray-300 my-1 leading-relaxed text-xs sm:text-sm">{line}</p>;
    });
  };

  // Database Performance Comparison Widget
  const renderDbPerformanceComparison = () => {
    if (!isLatencyScenario || !isExecuted) return null;
    return (
      <div className="glass-panel p-5 space-y-4">
        <h3 className="text-xs font-semibold text-white uppercase tracking-wider border-b border-white/5 pb-2 flex items-center gap-1.5 text-emerald-400">
          <Activity className="h-4 w-4 text-emerald-400" /> Database Index Optimization Speed
        </h3>
        <div className="grid grid-cols-2 gap-4 text-center">
          <div className="bg-rose-950/10 border border-rose-500/10 rounded-xl p-3">
            <span className="text-[10px] text-gray-500 font-semibold uppercase block">Before Index</span>
            <span className="text-xl font-bold text-rose-400 font-mono">575.0ms</span>
            <span className="text-[9px] text-gray-400 block mt-1">Full Table Scan</span>
          </div>
          <div className="bg-emerald-950/10 border border-emerald-500/10 rounded-xl p-3">
            <span className="text-[10px] text-gray-500 font-semibold uppercase block">After Index</span>
            <span className="text-xl font-bold text-emerald-400 font-mono">2.1ms</span>
            <span className="text-[9px] text-gray-400 block mt-1">Index Lookup</span>
          </div>
        </div>
        <div className="bg-emerald-500/5 border border-emerald-500/15 rounded-xl p-3 text-center">
          <span className="text-[10px] text-gray-400 block">Performance Speedup Factor</span>
          <span className="text-2xl font-bold text-white text-glow-emerald">273x Faster</span>
          <span className="text-[9px] text-emerald-400 block mt-0.5">🚀 Latency reduced by 99.63%</span>
        </div>
      </div>
    );
  };

  // Agent Execution timeline (Gantt Chart representation)
  const renderAgentTimeline = () => {
    const nodes = [
      { id: "triage", label: "Triage", desc: "Map Blast Radius", tokens: "150 tokens" },
      { id: "diagnose", label: "Diagnose", desc: "Query Telemetry", tokens: "1,850 tokens" },
      { id: "remediate", label: "Remediate", desc: "Self-Healing Actions", tokens: "1,200 tokens" },
      { id: "audit", label: "Audit", desc: "Log Splunk Index", tokens: "850 tokens" }
    ];

    const getNodeStatus = (nodeId: string) => {
      const activeNode = state.current_node.toLowerCase();
      const order = ["triage", "diagnose", "remediate", "audit"];
      const activeIdx = order.indexOf(activeNode);
      const nodeIdx = order.indexOf(nodeId);

      if (state.remediation_status === "executed" && nodeId === "audit") {
        return "completed";
      }
      if (nodeIdx < activeIdx) return "completed";
      if (nodeIdx === activeIdx) return "running";
      return "pending";
    };

    return (
      <div className="glass-panel p-4 space-y-3">
        <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Multi-Agent Execution Timeline</h3>
        <div className="grid grid-cols-4 gap-2 relative">
          {nodes.map((node) => {
            const status = getNodeStatus(node.id);
            let bgStyle = "bg-white/5 border-white/5 text-gray-500";
            let lineStyle = "bg-gray-800";
            
            if (status === "completed") {
              bgStyle = "bg-emerald-500/10 border-emerald-500/30 text-emerald-400";
              lineStyle = "bg-emerald-500/50";
            } else if (status === "running") {
              bgStyle = "bg-blue-500/10 border-blue-500/40 text-blue-450 animate-pulse";
              lineStyle = "bg-blue-500/20";
            }

            return (
              <div key={node.id} className="relative z-10">
                <div className={`p-3 rounded-xl border ${bgStyle} transition-all space-y-1`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-white block">{node.label}</span>
                    <span className="text-[8px] font-mono opacity-80">{node.tokens}</span>
                  </div>
                  <span className="text-[9px] block text-gray-400 truncate">{node.desc}</span>
                  <span className={`text-[8px] uppercase font-bold block ${
                    status === "completed" ? "text-emerald-400" : (status === "running" ? "text-blue-400" : "text-gray-600")
                  }`}>{status}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // SVG Metrics Chart Generator
  const renderMetricsChart = () => {
    let values = [];
    if (isLatencyScenario) {
      values = isExecuted ? [610, 640, 650, 630, 655, 645, 660, 650, 240, 140, 120, 115] : [610, 640, 650, 630, 655, 645, 660, 650];
    } else if (isThrottlingScenario) {
      values = isExecuted ? [92, 94, 98, 97, 99, 98, 98.5, 96, 50, 31, 26, 25.4] : [92, 94, 98, 97, 99, 98, 98.5, 96];
    } else {
      values = isExecuted ? [31, 34, 33, 35, 34, 36, 35, 34, 18, 5, 0.6, 0.2] : [31, 34, 33, 35, 34, 36, 35, 34];
    }

    const maxVal = isLatencyScenario ? 700 : 100;
    const unit = isLatencyScenario ? "ms" : "%";
    const title = isLatencyScenario ? "Checkout Response Latency" : (isThrottlingScenario ? "API-Gateway CPU Load" : "Auth-Service 5xx Rate");
    const accentHex = isLatencyScenario ? "#0071e3" : (isThrottlingScenario ? "#ff9500" : "#ff3b30");

    const pointsCount = values.length;
    const pointsString = values.map((val, idx) => {
      const x = (idx / (pointsCount - 1)) * 380 + 10;
      const y = 85 - (val / maxVal) * 70;
      return `${x},${y}`;
    }).join(" ");

    const areaPoints = `${10},85 ${pointsString} ${10 + (pointsCount - 1) * (380 / (pointsCount - 1))},85`;
    const currentVal = values[values.length - 1];

    return (
      <div className="glass-panel p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-white/5 pb-2">
          <span className="flex items-center gap-1.5 text-xs font-semibold uppercase text-gray-400">
            <Activity className="h-4 w-4" /> Live {title}
          </span>
          <span className={`text-xs font-semibold font-mono px-2 py-0.5 rounded-full ${
            isExecuted ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"
          }`}>
            Current: {currentVal}{unit}
          </span>
        </div>
        
        {/* SVG Polyline Chart */}
        <div className="relative h-24 bg-black/35 rounded-xl border border-white/5 p-2 overflow-hidden">
          <svg className="w-full h-full" viewBox="0 0 400 100" preserveAspectRatio="none">
            <line x1="10" y1="15" x2="390" y2="15" stroke="rgba(255,255,255,0.015)" strokeWidth="1" />
            <line x1="10" y1="50" x2="390" y2="50" stroke="rgba(255,255,255,0.015)" strokeWidth="1" />
            <line x1="10" y1="85" x2="390" y2="85" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />

            <defs>
              <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={accentHex} stopOpacity="0.12" />
                <stop offset="100%" stopColor={accentHex} stopOpacity="0.0" />
              </linearGradient>
            </defs>
            <polygon points={areaPoints} fill="url(#chartGrad)" />

            <polyline
              fill="none"
              stroke={accentHex}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={pointsString}
            />
          </svg>
        </div>
        <div className="flex justify-between text-[9px] text-gray-500 font-mono">
          <span>Outage Detected</span>
          {isExecuted && <span className="text-emerald-400 font-semibold">✓ Remediated & Healed</span>}
          <span>Real-time</span>
        </div>
      </div>
    );
  };

  // GitHub Diff Viewer Generator
  const renderGitDiff = () => {
    if (!state.diagnosis) return null;

    let fileName = "";
    let diffLines = [];
    if (isLatencyScenario) {
      fileName = "db/queries.py";
      diffLines = [
        { type: 'header', text: '--- a/db/queries.py' },
        { type: 'header', text: '+++ b/db/queries.py' },
        { type: 'info', text: '@@ -12,2 +12,2 @@' },
        { type: 'deletion', text: '-     query = "SELECT * FROM payment_methods"' },
        { type: 'addition', text: '+     query = "SELECT * FROM payment_methods WHERE status = \'active\'"' },
      ];
    } else if (isThrottlingScenario) {
      fileName = "k8s/gateway-deployment.yaml";
      diffLines = [
        { type: 'header', text: '--- a/k8s/gateway-deployment.yaml' },
        { type: 'header', text: '+++ b/k8s/gateway-deployment.yaml' },
        { type: 'info', text: '@@ -10,2 +10,2 @@' },
        { type: 'deletion', text: '-            cpu: "2.0"' },
        { type: 'addition', text: '+            cpu: "0.5"' },
      ];
    } else {
      fileName = "config/production.json";
      diffLines = [
        { type: 'header', text: '--- a/config/production.json' },
        { type: 'header', text: '+++ b/config/production.json' },
        { type: 'info', text: '@@ -4,2 +4,2 @@' },
        { type: 'deletion', text: '-     "redis_host": "redis-cache",' },
        { type: 'addition', text: '+     "redis_host": "redis-cache-v2",' },
      ];
    }

    return (
      <div className="glass-panel p-5 font-mono text-[11px] space-y-2">
        <div className="flex items-center justify-between border-b border-white/5 pb-2 mb-1 text-gray-500">
          <span className="flex items-center gap-1.5 font-sans font-bold uppercase text-[9px] text-gray-400">
            <GitBranch className="h-3.5 w-3.5" /> Root-Cause Git Diff
          </span>
          <span className="text-[10px]">{isLatencyScenario ? "commit 8f3b2cd" : (isThrottlingScenario ? "commit 9a2d3e" : "commit 1c9a4ef")}</span>
        </div>
        <div className="text-gray-400 mb-1">File: <span className="text-white font-semibold">{fileName}</span></div>
        <div className="bg-[#0c0c0e] rounded-xl border border-white/5 overflow-hidden divide-y divide-white/2">
          {diffLines.map((line, idx) => {
            let bg = "bg-transparent text-gray-400";
            if (line.type === 'header') bg = "bg-white/5 text-gray-400 font-semibold";
            if (line.type === 'info') bg = "bg-blue-950/15 text-blue-405";
            if (line.type === 'deletion') bg = "bg-rose-950/20 text-rose-400 border-l-2 border-rose-500 pl-2";
            if (line.type === 'addition') bg = "bg-emerald-950/20 text-emerald-400 border-l-2 border-emerald-500 pl-2";
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
      
      {/* Premium Apple Navigation Header */}
      <nav className="w-full flex items-center justify-between border-b border-white/5 pb-4 mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push("/")}
            className="p-2 border border-white/5 hover:border-white/10 bg-white/5 hover:bg-white/10 rounded-xl text-gray-400 hover:text-white transition-all cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-base font-semibold text-white flex items-center gap-1.5">
              <span className="text-gray-400 font-normal">SRE Room</span> #{incidentId.substring(0, 8)}
            </h1>
            <p className="text-[10px] text-gray-500 font-mono uppercase">Status: {state.remediation_status}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 text-[10px] text-gray-400 border border-white/5 bg-white/2 px-3 py-1.5 rounded-full">
            <span className={`h-1.5 w-1.5 rounded-full breathe-dot ${wsConnected ? "bg-emerald-400" : "bg-rose-400"}`}></span>
            {wsConnected ? "Telemetry Socket Connected" : "Connecting..."}
          </div>
          
          <div className="bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] font-semibold px-2.5 py-1.5 rounded-xl flex items-center gap-1">
            <Layers className="h-3.5 w-3.5" />
            {currentAgent}
          </div>
        </div>
      </nav>

      {/* Main Layout Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1">
        
        {/* Left Pane - Topology & Agent Terminal (8/12 Columns) */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          
          {/* Topology Map */}
          <div className="glass-panel p-6 border-white/5 relative overflow-hidden">
            <div className="absolute top-4 left-4 flex items-center gap-1.5">
              <Server className="h-4 w-4 text-blue-400" />
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Topology Map</span>
            </div>
            
            {/* SVG Network Map */}
            <div className="h-44 flex items-center justify-center mt-5">
              <svg width="100%" height="100%" viewBox="0 0 600 150" className="max-w-xl">
                <defs>
                  {/* Glowing Node Filter */}
                  <filter id="svgGlowBlue" x="-30%" y="-30%" width="160%" height="160%">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                  <filter id="svgGlowGreen" x="-30%" y="-30%" width="160%" height="160%">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                  <filter id="svgGlowRose" x="-30%" y="-30%" width="160%" height="160%">
                    <feGaussianBlur stdDeviation="4" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                  <filter id="svgGlowAmber" x="-30%" y="-30%" width="160%" height="160%">
                    <feGaussianBlur stdDeviation="4" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>

                  {/* Gradients */}
                  <radialGradient id="gradBlue" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#3b82f6" />
                    <stop offset="100%" stopColor="#1d4ed8" />
                  </radialGradient>
                  <radialGradient id="gradGreen" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#10b981" />
                    <stop offset="100%" stopColor="#047857" />
                  </radialGradient>
                  <radialGradient id="gradRose" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#f43f5e" />
                    <stop offset="100%" stopColor="#be123c" />
                  </radialGradient>
                  <radialGradient id="gradAmber" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#f59e0b" />
                    <stop offset="100%" stopColor="#b45309" />
                  </radialGradient>
                </defs>

                {/* API Gateway -> payment-service */}
                <line x1="100" y1="75" x2="250" y2="75" stroke="#1f2937" strokeWidth="3" />
                <line 
                  x1="100" y1="75" x2="250" y2="75" 
                  stroke={isExecuted ? "#10b981" : (isLatencyScenario ? "#f59e0b" : "#10b981")} 
                  strokeWidth="1.5" 
                  strokeDasharray="5,5" 
                >
                  <animate attributeName="stroke-dashoffset" values="30;0" dur="1.5s" repeatCount="indefinite" />
                </line>

                {/* payment-service -> auth-service */}
                <line x1="250" y1="75" x2="400" y2="75" stroke="#1f2937" strokeWidth="3" />
                <line 
                  x1="250" y1="75" x2="400" y2="75" 
                  stroke={isExecuted ? "#10b981" : (isLatencyScenario ? "#3b82f6" : "#f43f5e")} 
                  strokeWidth="1.5" 
                  strokeDasharray="5,5" 
                >
                  <animate attributeName="stroke-dashoffset" values="30;0" dur="1.5s" repeatCount="indefinite" />
                </line>

                {/* Target Database lines */}
                {isLatencyScenario && (
                  <>
                    <line x1="250" y1="75" x2="520" y2="75" stroke="#1f2937" strokeWidth="3" />
                    <line 
                      x1="250" y1="75" x2="520" y2="75" 
                      stroke={isExecuted ? "#10b981" : "#f59e0b"} 
                      strokeWidth="1.5" 
                      strokeDasharray="5,5" 
                    >
                      <animate attributeName="stroke-dashoffset" values="30;0" dur="1.2s" repeatCount="indefinite" />
                    </line>
                  </>
                )}

                {/* Target Redis Cache lines */}
                {!isLatencyScenario && !isThrottlingScenario && (
                  <>
                    <line x1="400" y1="75" x2="520" y2="75" stroke="#1f2937" strokeWidth="3" />
                    <line 
                      x1="400" y1="75" x2="520" y2="75" 
                      stroke={isExecuted ? "#10b981" : "#f43f5e"} 
                      strokeWidth="1.5" 
                      strokeDasharray="5,5" 
                    >
                      <animate attributeName="stroke-dashoffset" values="30;0" dur="1.2s" repeatCount="indefinite" />
                    </line>
                  </>
                )}
                
                {/* Node 1: API Gateway */}
                <g transform="translate(100, 75)">
                  <circle 
                    r="24" 
                    fill={isThrottlingScenario ? (isExecuted ? "url(#gradGreen)" : "url(#gradAmber)") : "url(#gradBlue)"} 
                    stroke={isThrottlingScenario ? (isExecuted ? "#10b981" : "#f59e0b") : "#3b82f6"} 
                    strokeWidth="2" 
                    filter={isThrottlingScenario ? (isExecuted ? "url(#svgGlowGreen)" : "url(#svgGlowAmber)") : "url(#svgGlowBlue)"} 
                  />
                  <foreignObject x="-10" y="-10" width="20" height="20" className="pointer-events-none">
                    <Server className="h-5 w-5 text-white" />
                  </foreignObject>
                  <text y="38" textAnchor="middle" fill="#9ca3af" fontSize="9" fontWeight="bold" className="font-mono">api-gateway</text>
                </g>

                {/* Node 2: payment-service */}
                <g transform="translate(250, 75)">
                  {isLatencyScenario ? (
                    <>
                      <circle 
                        r="26" 
                        fill={isExecuted ? "url(#gradGreen)" : "url(#gradAmber)"} 
                        stroke={isExecuted ? "#10b981" : "#f59e0b"} 
                        strokeWidth="2" 
                        filter={isExecuted ? "url(#svgGlowGreen)" : "url(#svgGlowAmber)"}
                      />
                      <foreignObject x="-10" y="-10" width="20" height="20" className="pointer-events-none">
                        <Layers className={`h-5 w-5 text-white ${isExecuted ? "" : "animate-bounce"}`} />
                      </foreignObject>
                    </>
                  ) : (
                    <>
                      <circle r="26" fill="url(#gradGreen)" stroke="#10b981" strokeWidth="1.5" filter="url(#svgGlowGreen)" />
                      <foreignObject x="-10" y="-10" width="20" height="20" className="pointer-events-none">
                        <Layers className="h-5 w-5 text-white" />
                      </foreignObject>
                    </>
                  )}
                  <text y="40" textAnchor="middle" fill="#ffffff" fontSize="9" fontWeight="bold" className="font-mono">payment-service</text>
                </g>

                {/* Node 3: auth-service */}
                <g transform="translate(400, 75)">
                  {!isLatencyScenario && !isThrottlingScenario ? (
                    <>
                      <circle 
                        r="26" 
                        fill={isExecuted ? "url(#gradGreen)" : "url(#gradRose)"} 
                        stroke={isExecuted ? "#10b981" : "#f43f5e"} 
                        strokeWidth="2" 
                        filter={isExecuted ? "url(#svgGlowGreen)" : "url(#svgGlowRose)"}
                      />
                      <foreignObject x="-10" y="-10" width="20" height="20" className="pointer-events-none">
                        <ShieldAlert className={`h-5 w-5 text-white ${isExecuted ? "" : "animate-bounce"}`} />
                      </foreignObject>
                    </>
                  ) : (
                    <>
                      <circle r="26" fill="url(#gradBlue)" stroke="#3b82f6" strokeWidth="1.5" filter="url(#svgGlowBlue)" />
                      <foreignObject x="-10" y="-10" width="20" height="20" className="pointer-events-none">
                        <ShieldAlert className="h-5 w-5 text-white" />
                      </foreignObject>
                    </>
                  )}
                  <text y="40" textAnchor="middle" fill="#ffffff" fontSize="9" fontWeight="bold" className="font-mono">auth-service</text>
                </g>

                {/* Node 4: Database / Cache */}
                <g transform="translate(520, 75)">
                  {isLatencyScenario ? (
                    <>
                      <circle 
                        r="24" 
                        fill={isExecuted ? "url(#gradGreen)" : "url(#gradAmber)"} 
                        stroke={isExecuted ? "#10b981" : "#f59e0b"} 
                        strokeWidth="1.5" 
                        filter={isExecuted ? "url(#svgGlowGreen)" : "url(#svgGlowAmber)"}
                      />
                      <foreignObject x="-10" y="-10" width="20" height="20" className="pointer-events-none">
                        <Database className="h-5 w-5 text-white" />
                      </foreignObject>
                      <text y="38" textAnchor="middle" fill="#9ca3af" fontSize="9" fontWeight="bold" className="font-mono">postgres-db</text>
                    </>
                  ) : (
                    <>
                      <circle 
                        r="24" 
                        fill={isExecuted ? "url(#gradGreen)" : "url(#gradRose)"} 
                        stroke={isExecuted ? "#10b981" : "#f43f5e"} 
                        strokeWidth="1.5" 
                        filter={isExecuted ? "url(#svgGlowGreen)" : "url(#svgGlowRose)"}
                      />
                      <foreignObject x="-10" y="-10" width="20" height="20" className="pointer-events-none">
                        <Database className="h-5 w-5 text-white" />
                      </foreignObject>
                      <text y="38" textAnchor="middle" fill="#9ca3af" fontSize="9" fontWeight="bold" className="font-mono">{isThrottlingScenario ? "postgres-db" : "redis-cache"}</text>
                    </>
                  )}
                </g>
              </svg>
            </div>
          </div>

          {/* Navigation Tab Header for Left Pane */}
          <div className="flex border-b border-white/5">
            <button
              onClick={() => setActiveTab("terminal")}
              className={`py-3 px-5 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition-all cursor-pointer ${
                activeTab === "terminal" 
                  ? "border-blue-500 text-blue-400 font-bold" 
                  : "border-transparent text-gray-400 hover:text-gray-250"
              }`}
            >
              <Terminal className="h-4 w-4" /> Agent Console
            </button>
            
            <button
              onClick={() => setActiveTab("splunk")}
              className={`py-3 px-5 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition-all cursor-pointer ${
                activeTab === "splunk" 
                  ? "border-blue-500 text-blue-400 font-bold" 
                  : "border-transparent text-gray-400 hover:text-gray-250"
              }`}
            >
              <Search className="h-4 w-4" /> Splunk MCP Logs ({state.splunk_queries.length})
            </button>

            <button
              onClick={() => setActiveTab("audit")}
              className={`py-3 px-5 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition-all cursor-pointer ${
                activeTab === "audit" 
                  ? "border-blue-500 text-blue-400 font-bold" 
                  : "border-transparent text-gray-400 hover:text-gray-250"
              }`}
            >
              <FileText className="h-4 w-4" /> Audit index=sre_audit ({state.audit_logs.length})
            </button>

            <button
              onClick={() => setActiveTab("slack")}
              className={`py-3 px-5 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition-all cursor-pointer ${
                activeTab === "slack" 
                  ? "border-blue-500 text-blue-400 font-bold" 
                  : "border-transparent text-gray-400 hover:text-gray-250"
              }`}
            >
              <MessageSquare className="h-4 w-4 text-purple-400" /> ChatOps Simulation
            </button>
          </div>

          {/* Tab Content 1: Terminal Console */}
          {activeTab === "terminal" && (
            <div className="glass-panel flex-1 flex flex-col h-[480px] overflow-hidden relative">
              <div className="terminal-scanline"></div>
              {/* Terminal header */}
              <div className="bg-[#0b0b0e] px-4 py-2 flex items-center justify-between border-b border-white/5 text-[10px] font-mono text-gray-500">
                <span>LANGGRAPH ACTIVE NODE PROCESS LOGGER</span>
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 breathe-dot"></span>
                  STREAMING
                </span>
              </div>
              
              {/* Timeline integration inside Console */}
              <div className="p-4 border-b border-white/5">
                {renderAgentTimeline()}
              </div>
              
              {/* Terminal Messages Output */}
              <div className="flex-1 p-5 overflow-y-auto space-y-5 font-mono text-xs sm:text-sm">
                
                {/* Alert Warning Box */}
                <div className="p-3.5 rounded-xl bg-rose-500/5 border border-rose-500/10 text-rose-400 flex items-start gap-3">
                  <AlertCircle className="h-4.5 w-4.5 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-white text-xs sm:text-sm">Ingested Incident Trigger</h3>
                    <p className="text-[11px] text-rose-400/80 mt-0.5">{state.alert_name} (Symptoms: {state.symptoms})</p>
                  </div>
                </div>

                {state.messages.map((msg, index) => {
                  const isTriage = msg.name === "TriageAgent";
                  const isDiagnose = msg.name === "DiagnosticianAgent";
                  const isRemediate = msg.name === "RemediationAgent";
                  const isAudit = msg.name === "AuditorAgent";
                  const isUser = msg.role === "user";

                  let accentColor = "text-blue-450 bg-blue-500/5 border-blue-500/10";
                  if (isDiagnose) accentColor = "text-indigo-400 bg-indigo-500/5 border-indigo-500/10";
                  if (isRemediate) accentColor = "text-amber-400 bg-amber-500/5 border-amber-500/10";
                  if (isAudit) accentColor = "text-emerald-400 bg-emerald-500/5 border-emerald-500/10";
                  if (isUser) accentColor = "text-purple-400 bg-purple-500/5 border-purple-500/10";

                  return (
                    <div key={index} className="space-y-1.5 border-l border-white/5 pl-3 py-0.5">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${accentColor}`}>
                          {msg.name || "Agent"}
                        </span>
                        <span className="text-gray-500 text-[10px]">t+{index * 15}s</span>
                      </div>
                      <div className="text-gray-300 pl-0.5">
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
            <div className="glass-panel flex-1 p-5 space-y-4 h-[480px] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-white/5 pb-2">
                <h3 className="text-xs font-semibold text-white uppercase tracking-wider">Splunk Processing Language (SPL) Queries</h3>
                <span className="text-[10px] bg-white/5 text-gray-400 px-2 py-0.5 rounded-full">Splunk Enterprise API</span>
              </div>

              {state.splunk_queries.length === 0 ? (
                <div className="py-20 text-center text-gray-500 text-xs font-mono">
                  No Splunk searches executed yet.
                </div>
              ) : (
                <div className="space-y-3 font-mono text-[11px]">
                  {state.splunk_queries.map((query, idx) => (
                    <div key={idx} className="bg-black/35 border border-white/5 rounded-xl p-3.5 relative group">
                      <div className="flex items-center justify-between text-gray-500 mb-2 border-b border-white/2 pb-1">
                        <span>Query #{idx + 1}</span>
                        <button
                          onClick={() => copyToClipboard(query, idx)}
                          className="text-blue-400 hover:text-blue-300 p-0.5 hover:bg-white/5 rounded transition-all flex items-center gap-1 cursor-pointer"
                        >
                          <Copy className="h-3 w-3" />
                          {copiedQueryIndex === idx ? "Copied!" : "Copy"}
                        </button>
                      </div>
                      <pre className="whitespace-pre-wrap leading-relaxed text-slate-350">{highlightSPL(query)}</pre>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tab Content 3: Splunk Audit Trail */}
          {activeTab === "audit" && (
            <div className="glass-panel flex-1 p-5 space-y-4 h-[480px] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-white/5 pb-2">
                <h3 className="text-xs font-semibold text-white uppercase tracking-wider">Splunk Audit Index Entries</h3>
                <span className="text-[10px] bg-emerald-500/5 border border-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full">index=sre_audit</span>
              </div>

              {state.audit_logs.length === 0 ? (
                <div className="py-20 text-center text-gray-500 text-xs font-mono">
                  Waiting for incident resolution to log audit trail...
                </div>
              ) : (
                <div className="space-y-3 font-mono text-[11px]">
                  {state.audit_logs.map((log, idx) => (
                    <div key={idx} className="bg-black/35 border border-white/5 rounded-xl p-3.5 space-y-2">
                      <div className="flex items-center justify-between text-gray-500 border-b border-white/2 pb-1">
                        <span className="text-emerald-400 font-semibold text-xs">Audit Event #{idx + 1}</span>
                        <span>{log.timestamp}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 py-0.5 text-gray-400">
                        <div><strong>Origin:</strong> {log.agent}</div>
                        <div><strong>Execution:</strong> {log.status}</div>
                        <div><strong>Tokens:</strong> {log.tokens_used}</div>
                      </div>
                      <div className="text-white bg-black/60 p-2.5 rounded-lg border border-white/5 whitespace-pre-wrap leading-relaxed">
                        {log.action}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tab Content 4: ChatOps Slack Simulator */}
          {activeTab === "slack" && (
            <div className="glass-panel flex-1 border-white/5 h-[480px] overflow-hidden flex flex-row">
              {/* Slack Workspace Sidebar */}
              <div className="w-48 bg-[#160c18] border-r border-[#26152a] flex flex-col shrink-0 text-slate-350 select-none hidden sm:flex">
                <div className="p-3 border-b border-[#26152a] flex items-center justify-between hover:bg-[#201123] cursor-pointer transition-colors group">
                  <div className="flex flex-col">
                    <span className="font-bold text-white text-xs flex items-center gap-1">
                      Splunk Ops Workspace
                    </span>
                  </div>
                </div>
                
                <div className="flex-1 py-3 overflow-y-auto space-y-1">
                  <div className="px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Channels</div>
                  <div className="px-2.5 py-1 text-slate-400 bg-white/5 font-semibold text-xs rounded mx-1.5 flex items-center gap-1.5 cursor-pointer">
                    <Hash className="h-3.5 w-3.5 shrink-0" />
                    <span>ops-war-room</span>
                  </div>
                  <div className="px-2.5 py-1 text-slate-400 font-medium text-xs hover:bg-white/2 rounded mx-1.5 flex items-center gap-1.5 cursor-pointer">
                    <Hash className="h-3.5 w-3.5 shrink-0" />
                    <span>alerts-sre</span>
                  </div>
                  <div className="px-2.5 py-1 text-slate-400 font-medium text-xs hover:bg-white/2 rounded mx-1.5 flex items-center gap-1.5 cursor-pointer">
                    <Hash className="h-3.5 w-3.5 shrink-0" />
                    <span>general</span>
                  </div>
                </div>
              </div>

              {/* Slack Chat Area */}
              <div className="flex-1 flex flex-col bg-[#1d1021] text-xs">
                {/* Channel Header */}
                <div className="p-3 border-b border-[#2d1b32] flex items-center justify-between bg-[#190e1c] shrink-0 text-slate-300">
                  <div className="flex items-center gap-1">
                    <Hash className="h-4 w-4 font-bold text-white" />
                    <span className="font-bold text-white">ops-war-room</span>
                  </div>
                  <span className="text-[10px] text-slate-400">War-Room active | 4 agents online</span>
                </div>

                {/* Slack messages */}
                <div className="flex-1 p-4 overflow-y-auto space-y-4">
                  {slackMessages.map((msg, i) => {
                    const isBot = msg.role === "bot";
                    const isDiag = msg.role === "diag";
                    const isUser = msg.role === "user";
                    
                    let bgAvatar = "bg-rose-600";
                    if (isDiag) bgAvatar = "bg-indigo-600";
                    if (isUser) bgAvatar = "bg-purple-600";

                    return (
                      <div key={i} className="flex gap-2.5 items-start">
                        <div className={`h-8 w-8 rounded text-white flex items-center justify-center font-bold font-sans text-xs uppercase shrink-0 ${bgAvatar}`}>
                          {msg.name.substring(0, 3)}
                        </div>
                        <div className="space-y-1 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-white text-xs">{msg.name}</span>
                            <span className="text-[10px] text-slate-400">{msg.time}</span>
                          </div>
                          
                          <div className="p-3 bg-[#26152c] rounded-lg border border-[#3c1f44] text-slate-200 max-w-lg space-y-2">
                            {isBot && msg.content.includes("CRITICAL ALERT") && (
                              <div className="font-semibold text-rose-400 flex items-center gap-1">
                                <AlertTriangle className="h-3.5 w-3.5" /> CRITICAL ALERT
                              </div>
                            )}
                            <p className="text-[11px] whitespace-pre-wrap leading-relaxed">
                              {msg.content}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Typing Indicator */}
                  {isTyping && (
                    <div className="flex gap-2.5 items-start">
                      <div className="h-8 w-8 rounded bg-rose-600 text-white flex items-center justify-center font-bold font-sans text-xs uppercase shrink-0">
                        BOT
                      </div>
                      <div className="space-y-1">
                        <span className="font-bold text-white text-xs">Auto-SRE Bot</span>
                        <div className="p-2 bg-[#26152c] rounded-lg border border-[#3c1f44] text-slate-400 text-[10px] animate-pulse">
                          Bot is typing...
                        </div>
                      </div>
                    </div>
                  )}
                  
                  <div ref={slackEndRef} />
                </div>

                {/* Slack Footer Inputs - Hooked up to Form */}
                <form onSubmit={handleSendSlackMessage} className="p-3 border-t border-[#2d1b32] bg-[#190e1c] flex items-center gap-2 shrink-0">
                  <input
                    type="text"
                    value={slackInput}
                    onChange={(e) => setSlackInput(e.target.value)}
                    placeholder="Type a command (help, status, logs, remediate)..."
                    className="flex-1 bg-[#26152b] border border-[#3a1f42] rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                  />
                  <button type="submit" className="p-2.5 bg-[#5e316a] hover:bg-[#6f3a7d] text-white rounded-xl cursor-pointer">
                    <Send className="h-3.5 w-3.5" />
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>

        {/* Right Pane - APM Graphs & Remediation Decisions (4/12 Columns) */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          
          {/* APM Graph Widget */}
          {renderMetricsChart()}

          {/* Real-time DB Performance Speedup comparison card */}
          {renderDbPerformanceComparison()}

          {/* Root-cause Commit diff */}
          {renderGitDiff()}

          {/* Remediation Decision Board */}
          <div className="glass-panel p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-white/5 pb-2">
              <h2 className="text-xs font-semibold text-white uppercase tracking-wider">
                Remediation Action Room
              </h2>
              {state.diagnosis && (
                <button
                  onClick={toggleSpeech}
                  className={`p-1.5 rounded-lg border transition-all cursor-pointer flex items-center gap-1 text-[10px] ${
                    isSpeaking 
                      ? "bg-rose-500/10 border-rose-500/30 text-rose-400" 
                      : "bg-white/5 border-white/5 text-gray-400 hover:text-white"
                  }`}
                  title="Toggle Voice Assistant Speech"
                >
                  {isSpeaking ? <VolumeX className="h-3.5 w-3.5 animate-pulse" /> : <Volume2 className="h-3.5 w-3.5" />}
                  {isSpeaking ? "Stop Voice" : "Voice RCA"}
                </button>
              )}
            </div>
            
            {state.remediation_status === "pending" ? (
              <div className="space-y-4">
                <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/10 text-amber-400 text-xs leading-relaxed space-y-1">
                  <p className="font-semibold text-white flex items-center gap-1">
                    <ShieldAlert className="h-3.5 w-3.5" /> Authorization Needed
                  </p>
                  <p className="text-[11px] text-amber-400/80">
                    Remediation actions require engineer confirmation before being dispatched to targets.
                  </p>
                </div>

                {state.proposed_remediation.options && state.proposed_remediation.options.map((opt, i) => (
                  <div key={i} className="bg-black/35 rounded-xl border border-white/5 p-4 flex flex-col justify-between space-y-3">
                    <div>
                      <h4 className="font-semibold text-white text-xs">{opt.title}</h4>
                      <p className="text-gray-400 text-[10px] mt-1 font-mono break-all">{opt.value}</p>
                    </div>
                    <button
                      onClick={() => handleAction("approve", opt)}
                      className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs py-2 px-3 rounded-xl transition-all cursor-pointer active:scale-98"
                    >
                      Approve Remediation
                    </button>
                  </div>
                ))}

                <button
                  onClick={() => handleAction("reject")}
                  className="w-full border border-rose-500/20 bg-rose-500/5 hover:bg-rose-500/10 text-rose-400 text-xs font-bold py-2 px-3 rounded-xl transition-all cursor-pointer active:scale-98"
                >
                  Reject Options & Suspend
                </button>
              </div>
            ) : (
              <div className="py-6 text-center text-gray-500 space-y-3">
                {state.remediation_status === "executed" ? (
                  <>
                    <CheckCircle className="h-10 w-10 text-emerald-400 mx-auto" />
                    <div>
                      <h3 className="font-semibold text-white text-xs">Remediation Executed</h3>
                      <p className="text-[10px] text-gray-500 mt-1">Actions successfully pushed. Telemetry returned to normal.</p>
                    </div>
                  </>
                ) : (
                  <>
                    <XCircle className="h-10 w-10 text-rose-400 mx-auto" />
                    <div>
                      <h3 className="font-semibold text-white text-xs">Remediation Suspended</h3>
                      <p className="text-[10px] text-gray-500 mt-1">The proposed solutions were rejected. Operator holds controls.</p>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
          
        </div>

      </div>
    </div>
  );
}
