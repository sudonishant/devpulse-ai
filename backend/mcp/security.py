"""Fail-closed read-only subset, NOT a general SPL parser or a sandbox."""
import re

READ_ONLY = {"search", "stats", "sort", "table", "head", "fields", "where", "eval", "dedup", "rename", "timechart", "top", "tail"}


def validate_spl(query: str) -> tuple[bool, str]:
    if not query.strip() or len(query) > 4096:
        return False, "Query must be nonempty and at most 4096 characters."
    if any(char in query for char in (";", "`", "[", "]", "\n", "\r", "\x00")):
        return False, "Macros, subsearches, control characters and multi-statements are unsupported."
    segments = [segment.strip() for segment in query.lower().split("|")]
    if not all(segments):
        return False, "Empty query segment."
    if not re.search(r"\b(?:index|sourcetype)\s*=\s*[\w*-]+", segments[0]):
        return False, "An explicit index or sourcetype is required."
    if re.match(r"(?:search\s+)?(?:index|sourcetype)\s*=", segments[0]) is None:
        return False, "Only scoped searches are permitted."
    for segment in segments[1:]:
        if segment.split()[0] not in READ_ONLY:
            return False, "Command is not in the read-only allowlist."
    return True, ""
