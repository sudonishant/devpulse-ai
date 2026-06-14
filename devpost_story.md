# Project Story: Auto-SRE

## About the Project
Auto-SRE is an enterprise-grade, autonomous Site Reliability Engineering (SRE) assistant built for the Splunk Agentic Ops Hackathon 2026. It automatically triages, diagnoses, and remediates application degradations in minutes, shifting the paradigm of incident response.

The core achievement of Auto-SRE is its ability to drastically reduce Mean Time to Resolution (MTTR) using a multi-agent coordinate-state workflow. We can model our performance gain mathematically:

Given an average manual investigation time of \\( T_{\text{manual}} = 45 \\) minutes and our Auto-SRE resolution time of \\( T_{\text{auto}} = 2.4 \\) minutes, the platform successfully achieves a 94.6% reduction in MTTR.

$$ \text{MTTR Reduction} = \left( 1 - \frac{T_{\text{auto}}}{T_{\text{manual}}} \right) \times 100\% = \left( 1 - \frac{2.4\text{ min}}{45\text{ min}} \right) \times 100\% \approx 94.6\% $$

## What Inspired Us
The single largest operational bottleneck for modern enterprise DevOps and SRE teams is manual incident resolution. When a production alert triggers, engineers suffer from alert fatigue and lose valuable time context-switching. They are forced to read raw logs in log aggregators, trace performance drops in APM dashboards, check recent code changes in version control, and coordinate everything in Slack war rooms. We wanted to eliminate this operational nightmare by replacing manual triage with an intelligent, self-healing workflow.

## How We Built Our Project
We built Auto-SRE using a powerful, multi-layered tech stack:
* **Orchestration**: We used LangGraph to create a multi-agent state machine controller.
* **Observability Data**: We utilized Splunk MCP (Model Context Protocol) and Splunk APM.
* **LLMs**: Powered by GPT-4o, Claude 3.5 Sonnet, and Gemini 1.5 Pro.
* **Infrastructure**: A FastAPI backend coordinating via WebSockets with a premium Next.js frontend.

The investigation is driven by four specialized SRE agents that share a dynamic state graph (which tracks the incident ID, blast radius, symptoms, and query history):
1. **Triage Agent**: Intercepts the alert and maps the service topology and dependencies in seconds.
2. **Diagnostician Agent**: Connects to the Splunk MCP server to automatically construct and execute SPL queries against APM and VCS logs.
3. **Remediation Agent**: Formulates a recovery strategy, such as executing an SQL index hotfix or triggering a code rollback.
4. **Auditor Agent**: Archives the complete diagnostic thread and post-mortem report back into Splunk compliance indexes.

## Challenges We Faced
* **Safe Autonomous Execution**: Allowing an AI to execute queries directly against databases is risky. To solve this, we built a custom SPL Guardrails Engine to intercept and evaluate all agent-generated queries for destructive syntax or SQL injection attempts before they hit the Splunk database.
* **Human-in-the-Loop Constraints**: We needed AI speed without sacrificing human safety. We challenged ourselves to build an interactive Slack ChatOps Simulator directly into our UI. The agent dispatches alert details to this simulator, requiring human operators to click interactive buttons to authorize fixes before the Remediation Agent acts.
* **Pitch & Demo Automation**: To demonstrate the platform's full workflow seamlessly, we engineered a custom 4K screen recording script using Playwright. This involved injecting a virtual mouse pointer with concentric ripple click effects and dynamic presentation tickers to highlight the state machine's transitions.

## What We Learned
Building Auto-SRE taught us the immense power of agentic state machines. We learned that by breaking down complex SRE tasks into specialized, distinct agents (Triage, Diagnostician, Remediation, and Auditor), the system becomes highly reliable and avoids hallucination. Furthermore, integrating the Splunk Model Context Protocol (MCP) proved that securely bridging advanced LLMs with live, enterprise observability data is highly effective and represents the future of predictive SRE operations.
