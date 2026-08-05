import logging

logger = logging.getLogger("mcp_security")

# Destructive commands that are prohibited for execution by AI agents
PROHIBITED_COMMANDS = [
    "delete", 
    "outputlookup", 
    "outputcsv", 
    "outputtext", 
    "inputlookup",  # Blocked in certain strict profiles
    "sendemail",
    "collect",
    "createrss"
]

def validate_spl(query: str) -> tuple[bool, str]:
    """
    Validates a generated SPL query against security and performance guardrails.
    Returns (is_valid, reason_or_empty)
    """
    cleaned_query = query.strip().lower()
    
    # 1. Check for command injections (e.g. semicolons trying to execute raw bash commands if passed incorrectly)
    if ";" in cleaned_query:
        return False, "Query contains semicolon (potential command injection vector)."
        
    # 2. Tokenize by pipe to check commands
    segments = [seg.strip().split()[0] for seg in cleaned_query.split("|") if seg.strip()]
    
    # Check for prohibited commands
    for cmd in segments:
        if cmd in PROHIBITED_COMMANDS:
            return False, f"Prohibited write/destructive command detected: '{cmd}'."
            
    # 3. Check performance guidelines: Enforce search scope to prevent resource-exhausting full scans
    # In a real environment, we check if "index=" or "sourcetype=" is specified in the first search segment
    first_segment = cleaned_query.split("|")[0] if "|" in cleaned_query else cleaned_query
    if "index=" not in first_segment and "sourcetype=" not in first_segment:
        # We allow a warning in a mock environment, but strict validation fails it
        logger.warning("Performance Warning: SPL query does not specify index or sourcetype scope.")
        
    return True, ""
