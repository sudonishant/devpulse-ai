"""Deterministic, offline checks. Does not execute submitted code or claim LLM results."""
import ast
import re


def analyze_local(code: str, language: str) -> dict:
    findings = []
    if language.lower() == "python":
        try:
            tree = ast.parse(code)
        except SyntaxError as exc:
            return _result(code, [f"MEDIUM — Python syntax error at line {exc.lineno}."], "Syntax check failed.")
        nodes = list(ast.walk(tree))
        dynamic_variables = {
            target.id
            for assignment in nodes
            if isinstance(assignment, ast.Assign) and isinstance(assignment.value, (ast.JoinedStr, ast.BinOp))
            for target in assignment.targets if isinstance(target, ast.Name)
        }
        for node in nodes:
            if isinstance(node, ast.Call):
                name = node.func.id if isinstance(node.func, ast.Name) else getattr(node.func, "attr", "")
                if name in {"eval", "exec"}:
                    findings.append(f"HIGH — Dynamic code execution at line {node.lineno}; avoid eval/exec with untrusted input.")
                if name in {"execute", "executemany"} and node.args:
                    if isinstance(node.args[0], (ast.JoinedStr, ast.BinOp)):
                        findings.append(f"HIGH — Dynamic SQL at line {node.lineno}; use parameterized queries.")
                if name == "execute" and node.args and isinstance(node.args[0], ast.Name):
                    variable = node.args[0].id
                    if variable in dynamic_variables:
                        findings.append(f"HIGH — Potential dynamic SQL via {variable} at line {node.lineno}; use parameterized queries.")
    # Report locations only: never include a matched credential in the report.
    for index, line in enumerate(code.splitlines(), 1):
        if re.search(r"(?:api[_-]?key|password|secret|token)\s*=\s*['\"][^'\"]{8,}['\"]", line, re.I):
            findings.append(f"HIGH — Possible hardcoded credential at line {index}; use secret storage and rotate if real.")
    return _result(code, findings, "No performance benchmark was run. No automatic refactor was applied.")


def _result(code: str, findings: list[str], note: str) -> dict:
    return {
        "analysis_mode": "local-static",
        "health_score": max(0, 100 - 15 * len(findings)),
        "security_alerts": len(findings),
        "performance_boost": 0,
        "metrics_note": "Heuristic score, not a security certification. Speedup is unmeasured.",
        "security_report": "## Offline static checks (limited coverage)\n" + ("\n".join(findings) or "No supported pattern found. This does NOT establish that the code is safe."),
        "performance_report": "## Offline mode — no LLM and no benchmark\n" + note,
        "refactored_code": code,
    }
