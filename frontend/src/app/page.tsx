"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { 
  Activity, 
  AlertTriangle, 
  Clock, 
  ArrowRight, 
  Cpu, 
  Terminal, 
  Layers, 
  ShieldCheck, 
  CheckCircle2, 
  RefreshCw 
} from "lucide-react";

interface Incident {
  incident_id: string;
  alert_name: string;
  service: string;
  status: string;
  current_node: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [backendOnline, setBackendOnline] = useState(false);
  const [triggering, setTriggering] = useState<string | null>(null);

  // Fetch active incidents and check backend status
  const fetchIncidents = async () => {
    try {
      const res = await fetch("http://localhost:8000/api/incidents");
      if (res.ok) {
        const data = await res.json();
        setIncidents(data);
        setBackendOnline(true);
      } else {
        setBackendOnline(false);
      }
    } catch (err) {
      setBackendOnline(false);
      console.error("Failed to connect to backend:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIncidents();
    const interval = setInterval(fetchIncidents, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleTrigger = async (scenario: string) => {
    setTriggering(scenario);
    try {
      const res = await fetch("http://localhost:8000/api/incidents/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario }),
      });
      if (res.ok) {
        const data = await res.json();
        router.push(`/incidents/${data.incident_id}`);
      } else {
        alert("Failed to trigger incident simulator.");
      }
    } catch (err) {
      console.error(err);
      alert("Error contacting the backend API.");
    } finally {
      setTriggering(null);
    }
  };

  return (
    <div className="relative min-h-screen grid-bg flex flex-col items-center px-4 sm:px-6 lg:px-8 py-10 z-10">
      
      {/* Apple-style Navigation Header */}
      <header className="w-full max-w-[1400px] flex flex-col md:flex-row md:items-center md:justify-between border-b border-white/5 pb-6 mb-10">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <div className="p-2 bg-blue-500/10 border border-blue-500/20 rounded-xl text-blue-400">
              <Activity className="h-5 w-5 breathe-dot" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              Auto-SRE Dashboard
            </h1>
          </div>
          <p className="text-gray-400 text-xs md:text-sm">
            Autonomous Incident Remediation & Operations Control Panel
          </p>
        </div>

        <div className="mt-4 md:mt-0 flex items-center gap-3">
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[11px] font-medium transition-all ${
            backendOnline 
              ? "bg-emerald-500/5 border-emerald-500/10 text-emerald-400" 
              : "bg-rose-500/5 border-rose-500/10 text-rose-400"
          }`}>
            <span className={`h-1.5 w-1.5 rounded-full breathe-dot ${backendOnline ? "bg-emerald-400" : "bg-rose-400"}`}></span>
            {backendOnline ? "Platform Connected" : "Platform Disconnected"}
          </div>
          
          <button 
            onClick={fetchIncidents}
            className="p-2 border border-white/5 hover:border-white/10 bg-white/5 hover:bg-white/10 rounded-xl text-gray-400 hover:text-white transition-all cursor-pointer"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Main Grid Content */}
      <main className="w-full max-w-[1400px] space-y-10 flex-1">
        
        {/* Core Architecture Widget */}
        <section className="glass-panel p-6 sm:p-8 flex flex-col md:flex-row gap-6 md:items-center justify-between">
          <div className="max-w-3xl space-y-3">
            <h2 className="text-lg font-medium text-white flex items-center gap-2">
              <Cpu className="text-blue-500 h-5 w-5" /> Orchestrated Multi-Agent Remediation Room
            </h2>
            <p className="text-gray-400 text-xs sm:text-sm leading-relaxed">
              Auto-SRE coordinates independent specialized agents using a LangGraph state graph.
              Upon alerts, <strong>Triage</strong> isolates the system, <strong>Diagnostician</strong> uses 
              Splunk MCP Splunk query tools to find anomalous logs/git commits, <strong>Remediation</strong> plans 
              reconstruction steps (e.g. SQLite database indexing or config reversions), and <strong>Auditor</strong> archives 
              the full AI logs in Splunk.
            </p>
          </div>
          <div className="flex flex-col gap-2.5 shrink-0 border-l border-white/5 pl-0 md:pl-6">
            <div className="flex items-center gap-2 text-[11px] text-gray-400">
              <Terminal className="h-4 w-4 text-emerald-400" />
              <span>Splunk MCP: Activated</span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-gray-400">
              <Layers className="h-4 w-4 text-blue-400" />
              <span>LangGraph Engine: Active</span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-gray-400">
              <ShieldCheck className="h-4 w-4 text-amber-400" />
              <span>Human-In-The-Loop: Guarded</span>
            </div>
          </div>
        </section>

        {/* Analytics Summary widgets */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          
          <div className="glass-panel p-5 relative overflow-hidden group hover:border-white/10 transition-all">
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Mean Time to Resolution (MTTR)</p>
            <div className="mt-2.5 flex items-baseline gap-2">
              <span className="text-2xl font-semibold text-white tracking-tight text-glow-emerald">2.4 min</span>
              <span className="text-xs text-gray-500">vs 45.0m manual</span>
            </div>
            <p className="text-[11px] text-emerald-400 mt-2">✓ 94.6% faster service recovery</p>
          </div>

          <div className="glass-panel p-5 relative overflow-hidden group hover:border-white/10 transition-all">
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Remediation Success Rate</p>
            <div className="mt-2.5 flex items-baseline gap-2">
              <span className="text-2xl font-semibold text-white tracking-tight text-glow-blue">98.4%</span>
              <span className="text-xs text-gray-500">last 30 days</span>
            </div>
            <p className="text-[11px] text-blue-400 mt-2">✓ 124 outages resolved automatically</p>
          </div>

          <div className="glass-panel p-5 relative overflow-hidden group hover:border-white/10 transition-all">
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Cloud Operations Savings</p>
            <div className="mt-2.5 flex items-baseline gap-2">
              <span className="text-2xl font-semibold text-white tracking-tight">$12,450</span>
              <span className="text-xs text-gray-500">estimated saving</span>
            </div>
            <p className="text-[11px] text-gray-400 mt-2">✓ Based on downtime SLA recovery costs</p>
          </div>

        </section>

        {/* Simulator Scenarios Trigger Panel */}
        <section className="space-y-4">
          <h2 className="text-base font-semibold text-gray-300 flex items-center gap-2 pl-1">
            Simulate Outage Scenarios
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Scenario A Card */}
            <div className="glass-panel glass-panel-hover p-6 flex flex-col justify-between border-blue-500/10">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-[10px] font-semibold text-blue-400">
                    Scenario A
                  </span>
                  <span className="text-[10px] text-gray-500 flex items-center gap-1">
                    <Clock className="h-3 w-3" /> APM Latency
                  </span>
                </div>
                <h3 className="text-sm font-semibold text-white">Payment Checkout Latency</h3>
                <p className="text-gray-400 text-xs leading-relaxed">
                  Triggers high checkout latency. SRE agents scan logs, identify a slow query on a non-indexed table, and apply a database index schema hotfix to SQLite.
                </p>
              </div>
              <button
                disabled={!backendOnline || triggering !== null}
                onClick={() => handleTrigger("latency_spike")}
                className={`mt-5 w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-semibold border transition-all ${
                  backendOnline 
                    ? "bg-blue-600 hover:bg-blue-500 border-blue-500/30 text-white cursor-pointer active:scale-95" 
                    : "bg-white/5 border-white/5 text-gray-500 cursor-not-allowed"
                }`}
              >
                {triggering === "latency_spike" ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <>
                    Simulate Outage <ArrowRight className="h-3.5 w-3.5" />
                  </>
                )}
              </button>
            </div>

            {/* Scenario B Card */}
            <div className="glass-panel glass-panel-hover p-6 flex flex-col justify-between border-rose-500/10">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="px-2 py-0.5 rounded-full bg-rose-500/10 border border-rose-500/20 text-[10px] font-semibold text-rose-400">
                    Scenario B
                  </span>
                  <span className="text-[10px] text-gray-500 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> 5xx Errors
                  </span>
                </div>
                <h3 className="text-sm font-semibold text-white">Auth-Service Cache Failures</h3>
                <p className="text-gray-400 text-xs leading-relaxed">
                  Triggers HTTP 500 error spikes on login. Agents analyze cache exceptions, trace a configuration host mismatch, and execute a code/config rollback.
                </p>
              </div>
              <button
                disabled={!backendOnline || triggering !== null}
                onClick={() => handleTrigger("error_spike")}
                className={`mt-5 w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-semibold border transition-all ${
                  backendOnline 
                    ? "bg-rose-600 hover:bg-rose-500 border-rose-500/30 text-white cursor-pointer active:scale-95" 
                    : "bg-white/5 border-white/5 text-gray-500 cursor-not-allowed"
                }`}
              >
                {triggering === "error_spike" ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <>
                    Simulate Outage <ArrowRight className="h-3.5 w-3.5" />
                  </>
                )}
              </button>
            </div>

            {/* Scenario C Card */}
            <div className="glass-panel glass-panel-hover p-6 flex flex-col justify-between border-amber-500/10">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-[10px] font-semibold text-amber-400">
                    Scenario C
                  </span>
                  <span className="text-[10px] text-gray-500 flex items-center gap-1">
                    <Cpu className="h-3 w-3" /> Throttling
                  </span>
                </div>
                <h3 className="text-sm font-semibold text-white">Gateway Resource Starvation</h3>
                <p className="text-gray-400 text-xs leading-relaxed">
                  Triggers severe CPU limits throttling on API-Gateway. Agents diagnose insufficient CPU limits in deployment config and rollback resources to 2.0 cores.
                </p>
              </div>
              <button
                disabled={!backendOnline || triggering !== null}
                onClick={() => handleTrigger("cpu_throttling")}
                className={`mt-5 w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-semibold border transition-all ${
                  backendOnline 
                    ? "bg-amber-600 hover:bg-amber-500 border-amber-500/30 text-white cursor-pointer active:scale-95" 
                    : "bg-white/5 border-white/5 text-gray-500 cursor-not-allowed"
                }`}
              >
                {triggering === "cpu_throttling" ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <>
                    Simulate Outage <ArrowRight className="h-3.5 w-3.5" />
                  </>
                )}
              </button>
            </div>

          </div>
        </section>

        {/* Active Incident List */}
        <section className="space-y-4">
          <h2 className="text-base font-semibold text-gray-300 flex items-center gap-2 pl-1">
            Active SRE Investigations
          </h2>
          
          <div className="glass-panel overflow-hidden">
            {loading ? (
              <div className="py-12 text-center text-gray-400 text-xs font-mono">
                <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-3 text-blue-500" />
                Querying active events...
              </div>
            ) : incidents.length === 0 ? (
              <div className="py-16 text-center text-gray-500 text-xs">
                <CheckCircle2 className="h-10 w-10 mx-auto mb-3 text-gray-600" />
                No active SRE incidents. Select a scenario above to initialize the AI agents.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/5 text-gray-400 text-[10px] font-semibold uppercase tracking-wider bg-white/2">
                      <th className="py-4 px-6">Incident ID / Alert</th>
                      <th className="py-4 px-6">Target Service</th>
                      <th className="py-4 px-6">SRE Agent Node</th>
                      <th className="py-4 px-6">Healing Status</th>
                      <th className="py-4 px-6 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-xs">
                    {incidents.map((incident) => {
                      return (
                        <tr key={incident.incident_id} className="hover:bg-white/2 transition-colors">
                          <td className="py-4 px-6 font-medium text-white">
                            <div className="flex flex-col">
                              <span className="font-semibold">{incident.alert_name}</span>
                              <span className="text-[10px] text-gray-500 font-mono mt-0.5">{incident.incident_id}</span>
                            </div>
                          </td>
                          <td className="py-4 px-6 text-gray-300 font-mono font-medium">{incident.service || "Evaluating..."}</td>
                          <td className="py-4 px-6">
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-blue-500/10 border border-blue-500/20 text-blue-400">
                              <Terminal className="h-3 w-3" />
                              {incident.current_node ? incident.current_node.toUpperCase() : "TRIAGE"}
                            </span>
                          </td>
                          <td className="py-4 px-6">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium ${
                              incident.status === "executed"
                                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                                : incident.status === "rejected"
                                ? "bg-rose-500/10 border-rose-500/20 text-rose-400"
                                : "bg-amber-500/10 border-amber-500/20 text-amber-400"
                            }`}>
                              <span className={`h-1 w-1 rounded-full ${
                                incident.status === "executed"
                                  ? "bg-emerald-400"
                                  : incident.status === "rejected"
                                  ? "bg-rose-400"
                                  : "bg-amber-400 breathe-dot"
                              }`}></span>
                              {incident.status.toUpperCase()}
                            </span>
                          </td>
                          <td className="py-4 px-6 text-right">
                            <button
                              onClick={() => router.push(`/incidents/${incident.incident_id}`)}
                              className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 font-semibold transition-colors cursor-pointer"
                            >
                              Enter Room <ArrowRight className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
        
      </main>
      
      {/* Footer */}
      <footer className="w-full max-w-[1400px] text-center border-t border-white/5 pt-8 mt-12 text-[10px] text-gray-500">
        <p>Auto-SRE Control Desk © 2026 - Splunk Agentic Ops Hackathon Submission.</p>
        <p className="mt-1">Powered by LangGraph Agent State Machine & Splunk Model Context Protocol (MCP).</p>
      </footer>
    </div>
  );
}
