# Devpost Pitch: DevPulse AI (An Autonomous Multi-Agent Code Reviewer & Security Auditor)

## 💡 Inspiration
The developer world is currently flooded with "AI wrappers"—simple single-prompt GPT API integrations that act as glorified linter tools. While they can catch basic syntax errors, they fail catastrophically when it comes to reasoning about complex application architecture, security vulnerabilities, or performance optimization. 

When vulnerable code slips into production, it doesn't just crash an application; it compromises enterprise databases, exposes user data, and racks up thousands of dollars in cloud computing costs. Developers don't need another linter. They need **DevPulse AI**: a dual-layered, autonomous multi-agent defense system. By separating security and performance analysis into specialized autonomous roles, DevPulse AI acts as a digital pair of senior engineers—reviewing, identifying, and refactoring codebases concurrently before a single line is merged.

---

## ⚙️ What it does
DevPulse AI acts as an autonomous code review terminal. Users can paste a raw block of source code or sync a public GitHub Repository URL, select their target language, and trigger a multi-agent audit.

Once executed, two specialized agents process the code in parallel:
1. **SecOps-Agent (Senior Cyber Security Auditor)**: Scans the codebase for OWASP Top 10 vulnerabilities (such as SQL Injections, Cross-Site Scripting (XSS), and Server-Side Request Forgeries), exposes hardcoded secrets/API keys, highlights insecure third-party libraries, and creates cryptographically secure code patches.
2. **PerfScale-Agent (Principal Software Architect)**: Runs static performance profiling, analyzes space-time complexity bottlenecks (like nested $O(N^2)$ loops), flags memory leaks, calculates a code smell score, and provides a low-latency refactored version of the code that reduces CPU cycles.

The dashboard integrates these reports in a beautiful side-by-side Results Grid, topped with visual KPI cards showing a calculated **Code Health Score**, a **Security Alert Count**, and estimated **Performance Speedup percentages**. It also includes an advanced interactive code diff comparison showing the vulnerable code (wrapped in red) next to the fixed code (wrapped in emerald) with a one-click copy utility.

---

## 🛠️ How we built it
We built DevPulse AI using a highly responsive, modern full-stack architecture:
* **The Elite Frontend**: Designed using **Next.js 16**, **React 19**, and **Tailwind CSS v4** to deliver an organic glassmorphic Dark-Mode UI. We integrated custom SVGs for the circular progress metrics and added real-time agent console log streams to make the agentic actions visible.
* **The Multi-Agent Engine**: Engineered using **LangChain** and **CrewAI** paradigms in Python. We leveraged **Google Gemini 1.5 Pro**'s massive 1M token context window, allowing our agents to absorb entire files and dependency chains to make architectural decisions.
* **The Communication Layer**: Designed a high-speed **FastAPI** service running on Uvicorn that accepts payloads, splits execution to run the SRE agents concurrently via `asyncio.gather`, and returns structured analysis payloads to the Next.js frontend in seconds.

---

## 🛑 Challenges we ran into
Our biggest challenge was **handling asynchronous data streaming from multiple agent loops to a live UI**. SRE agent runs can take several seconds to execute. To keep the developer engaged, we built a simulated local pipeline logger. This system tracks agent tasks in real-time, outputting step-by-step console logs to show exactly what each agent is doing (e.g., `[SecOps-Agent] Inspecting code paths for SQL Injection...`).

We also had to ensure the platform remains fully testable offline or when Gemini API keys are missing. We engineered a **high-fidelity local sandbox fallback** that detects missing environment variables and serves pre-compiled, highly detailed mock reviews for our demonstration code snippets without throwing connection exceptions, making our hackathon submission robust and bulletproof.

---

## 🏆 Accomplishments that we're proud of
* **True-Positive Interceptions**: DevPulse AI successfully catches true-positive critical SQL injection attempts in our dummy DB queries and automatically writes parameter-compliant prepared statements.
* **Insane Out-of-the-Box Speed**: Running our parallel agent loops yields a complete security report, architectural analysis, health metrics, and refactored code blocks in **under 15 seconds**.
* **Modern Design Aesthetics**: Created a sleek, developer-first interface that has an elite IDE-like console, glowing CTA buttons, and interactive diff visualizers.

---

## 🚀 What's next for DevPulse AI
DevPulse AI is just getting started. Our roadmap includes:
1. **GitHub Actions CI/CD Plugin**: An automated runner that executes on every pull request, leaving inline security comments on the exact code lines containing vulnerabilities.
2. **Multi-File Context Graphing**: Allowing SRE agents to map function imports across multiple project folders, building a holistic dependency tree to find hidden architectural memory leaks.
3. **IDE Extensions**: Integrating DevPulse AI directly into VS Code and JetBrains IDEs to flag security vulnerabilities and performance bottlenecks as developers write their code.
