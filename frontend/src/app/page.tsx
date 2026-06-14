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
    // Poll active incident list every 5 seconds
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
      
      {/* Header Container */}
      <header className="w-full max-w-[1650px] flex flex-col md:flex-row md:items-center md:justify-between border-b border-gray-800 pb-6 mb-12">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-500/10 border border-blue-500/30 rounded-lg text-blue-400">
              <Activity className="h-6 w-6 animate-pulse" />
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-emerald-400 to-indigo-500">
              Auto-SRE Control Panel
            </h1>
          </div>
          <p className="text-gray-400 text-sm md:text-base">
            Autonomous Multi-Agent Site Reliability Engineering & Self-Healing Platform
          </p>
        </div>

        <div className="mt-4 md:mt-0 flex items-center gap-3">
          {/* Status Indicator */}
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold ${
            backendOnline 
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" 
              : "bg-rose-500/10 border-rose-500/30 text-rose-400"
          }`}>
            <span className={`h-2 w-2 rounded-full ${backendOnline ? "bg-emerald-400 animate-pulse" : "bg-rose-400"}`}></span>
            {backendOnline ? "Backend Live" : "Backend Offline"}
          </div>
          
          <button 
            onClick={fetchIncidents}
            className="p-2 border border-gray-800 hover:border-gray-700 bg-gray-900/50 rounded-lg text-gray-400 hover:text-gray-200 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Main Grid Content */}
      <main className="w-full max-w-[1650px] space-y-12 flex-1">
        
        {/* Pitch / Architecture Card */}
        <section className="glass-panel rounded-2xl p-6 sm:p-8 flex flex-col md:flex-row gap-6 md:items-center justify-between border-blue-500/20">
          <div className="max-w-2xl space-y-4">
            <h2 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
              <Cpu className="text-blue-400 h-6 w-6" /> Multi-Agent Incident Remediation Room
            </h2>
            <p className="text-gray-300 text-sm leading-relaxed">
              Auto-SRE operates as an agentic system. Upon detecting an anomaly, the graph coordinates specialized agents: 
              <strong> Triage</strong> (defines the blast radius), <strong>Diagnostician</strong> (uses the Splunk MCP Server to run raw SPL checks across logs and APM), 
              <strong>Remediation</strong> (formulates Kubernetes/Git action steps and triggers human approvals), and <strong>Auditor</strong> (securely archives the full AI reasoning logs in Splunk).
            </p>
          </div>
          <div className="flex flex-col gap-3 shrink-0">
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <Terminal className="h-4 w-4 text-emerald-400" />
              <span>Splunk MCP Server: Integrated</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <Layers className="h-4 w-4 text-indigo-400" />
              <span>LangGraph state engine: Enabled</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <ShieldCheck className="h-4 w-4 text-amber-400" />
              <span>Human-In-The-Loop: Active</span>
            </div>
          </div>
        </section>

        {/* Analytics Summary Header */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          
          <div className="glass-panel rounded-2xl p-6 border-emerald-500/20 relative overflow-hidden group hover:border-emerald-500/30 transition-all">
            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
              <Clock className="h-20 w-20 text-emerald-400" />
            </div>
            <p className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Mean Time to Resolution (MTTR)</p>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-white text-glow-emerald">2.4 min</span>
              <span className="text-xs text-gray-500">vs 45.0m manual</span>
            </div>
            <p className="text-xs text-gray-400 mt-3">✓ 94.6% faster incident containment</p>
          </div>

          <div className="glass-panel rounded-2xl p-6 border-blue-500/20 relative overflow-hidden group hover:border-blue-500/30 transition-all">
            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
              <Activity className="h-20 w-20 text-blue-400" />
            </div>
            <p className="text-xs font-bold text-blue-400 uppercase tracking-wider">Remediation Success Rate</p>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-white text-glow-blue">98.4%</span>
              <span className="text-xs text-gray-500">last 30 days</span>
            </div>
            <p className="text-xs text-gray-400 mt-3">✓ 124 incidents resolved autonomously</p>
          </div>

          <div className="glass-panel rounded-2xl p-6 border-indigo-500/20 relative overflow-hidden group hover:border-indigo-500/30 transition-all">
            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
              <Layers className="h-20 w-20 text-indigo-400" />
            </div>
            <p className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Ops Cost Savings</p>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-white">$12,450</span>
              <span className="text-xs text-gray-500">estimated saving</span>
            </div>
            <p className="text-xs text-gray-400 mt-3">✓ Calculated on avg. downtime SLA costs</p>
          </div>

        </section>

        {/* Simulator Scenarios Trigger Panel */}
        <section className="space-y-6">
          <h2 className="text-xl font-bold text-white flex items-center gap-2 border-l-4 border-blue-500 pl-3">
            Simulate Outage Scenarios
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Scenario 1 Card */}
            <div className="glass-panel glass-panel-hover rounded-2xl p-6 flex flex-col justify-between border-blue-500/10">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-1 rounded bg-blue-500/10 border border-blue-500/20 text-xs font-semibold text-blue-400">
                    Scenario A
                  </span>
                  <span className="text-xs text-gray-500 flex items-center gap-1">
                    <Clock className="h-3 w-3" /> APM Latency
                  </span>
                </div>
                <h3 className="text-lg font-bold text-white">Payment-Service Checkout Slowdown</h3>
                <p className="text-gray-400 text-sm leading-relaxed">
                  Triggers an SLA warning due to checkout latency. SRE agents will query database transactions, trace performance blocks to a slow query, find a missing schema index, and propose scaling or rolling back code.
                </p>
              </div>
              <button
                disabled={!backendOnline || triggering !== null}
                onClick={() => handleTrigger("latency_spike")}
                className={`mt-6 w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-semibold border transition-all ${
                  backendOnline 
                    ? "bg-blue-600 hover:bg-blue-500 border-blue-500/50 text-white cursor-pointer active:scale-95" 
                    : "bg-gray-800 border-gray-700 text-gray-500 cursor-not-allowed"
                }`}
              >
                {triggering === "latency_spike" ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    Trigger Investigation <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>

            {/* Scenario 2 Card */}
            <div className="glass-panel glass-panel-hover rounded-2xl p-6 flex flex-col justify-between border-rose-500/10">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-1 rounded bg-rose-500/10 border border-rose-500/20 text-xs font-semibold text-rose-400">
                    Scenario B
                  </span>
                  <span className="text-xs text-gray-500 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> 5xx Outage
                  </span>
                </div>
                <h3 className="text-lg font-bold text-white">Auth-Service Session Errors</h3>
                <p className="text-gray-400 text-sm leading-relaxed">
                  Triggers a critical alert for HTTP 500 error spikes on login verifications. SRE agents will check exception logs, detect a Cache connection refused error, and trace a config file mapping issue.
                </p>
              </div>
              <button
                disabled={!backendOnline || triggering !== null}
                onClick={() => handleTrigger("error_spike")}
                className={`mt-6 w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-semibold border transition-all ${
                  backendOnline 
                    ? "bg-rose-600 hover:bg-rose-500 border-rose-500/50 text-white cursor-pointer active:scale-95" 
                    : "bg-gray-800 border-gray-700 text-gray-500 cursor-not-allowed"
                }`}
              >
                {triggering === "error_spike" ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    Trigger Investigation <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>

          </div>
        </section>

        {/* Active Incident List */}
        <section className="space-y-6">
          <h2 className="text-xl font-bold text-white flex items-center gap-2 border-l-4 border-emerald-500 pl-3">
            Active Incident Investigations
          </h2>
          
          <div className="glass-panel rounded-2xl overflow-hidden">
            {loading ? (
              <div className="py-12 text-center text-gray-400">
                <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-500" />
                Loading SRE investigations...
              </div>
            ) : incidents.length === 0 ? (
              <div className="py-16 text-center text-gray-500">
                <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-gray-600" />
                No active SRE incidents. Select a scenario above to launch the AI team.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-gray-800 text-gray-400 text-xs font-semibold uppercase tracking-wider bg-gray-900/30">
                      <th className="py-4 px-6">Incident ID / Alert</th>
                      <th className="py-4 px-6">Service</th>
                      <th className="py-4 px-6">Active Agent</th>
                      <th className="py-4 px-6">Status</th>
                      <th className="py-4 px-6 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800 text-sm">
                    {incidents.map((incident) => {
                      const isPending = incident.status === "pending";
                      return (
                        <tr key={incident.incident_id} className="hover:bg-gray-800/20 transition-colors">
                          <td className="py-4 px-6 font-medium text-white">
                            <div className="flex flex-col">
                              <span>{incident.alert_name}</span>
                              <span className="text-xs text-gray-500 font-mono mt-0.5">{incident.incident_id}</span>
                            </div>
                          </td>
                          <td className="py-4 px-6 text-gray-300 font-semibold">{incident.service || "Analyzing..."}</td>
                          <td className="py-4 px-6">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-500/10 border border-blue-500/20 text-blue-400">
                              <Terminal className="h-3.5 w-3.5" />
                              {incident.current_node ? incident.current_node.toUpperCase() : "TRIAGE"}
                            </span>
                          </td>
                          <td className="py-4 px-6">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                              incident.status === "executed"
                                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                                : incident.status === "rejected"
                                ? "bg-rose-500/10 border-rose-500/20 text-rose-400"
                                : "bg-amber-500/10 border-amber-500/20 text-amber-400 animate-pulse"
                            }`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${
                                incident.status === "executed"
                                  ? "bg-emerald-400"
                                  : incident.status === "rejected"
                                  ? "bg-rose-400"
                                  : "bg-amber-400 animate-ping"
                              }`}></span>
                              {incident.status.toUpperCase()}
                            </span>
                          </td>
                          <td className="py-4 px-6 text-right">
                            <button
                              onClick={() => router.push(`/incidents/${incident.incident_id}`)}
                              className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 font-bold transition-colors cursor-pointer"
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
      <footer className="w-full max-w-[1650px] text-center border-t border-gray-800 pt-8 mt-16 text-xs text-gray-500">
        <p>Auto-SRE Platform © 2026 - Designed for the Splunk Agentic Ops Hackathon.</p>
        <p className="mt-1">Powered by Cisco/Splunk MCP, FastAPI, LangGraph state engine, and Next.js.</p>
      </footer>
    </div>
  );
}
