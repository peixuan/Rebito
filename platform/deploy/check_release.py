"""Select a protected main revision whose GitHub checks have all succeeded."""

import json
import re
import urllib.request


CHECKS = frozenset({
    "application (24)", "application (26)", "commit-policy", "secrets",
    "container", "Analyze (actions)", "Analyze (javascript-typescript)",
})
GITHUB_ACTIONS_APP = 15368


def branch_sha(branch):
    """Reject unprotected branches and malformed revision identifiers."""
    sha = branch.get("commit", {}).get("sha", "")
    if branch.get("name") != "main" or branch.get("protected") is not True:
        raise ValueError("Deployment requires a protected main branch")
    if not isinstance(sha, str) or not re.fullmatch(r"[0-9a-f]{40}", sha):
        raise ValueError("Invalid main revision")
    return sha


def checks_passed(sha, response):
    """Only GitHub Actions checks for this exact revision can authorize a release."""
    runs = response.get("check_runs", [])
    if not isinstance(runs, list) or response.get("total_count") != len(runs):
        raise ValueError("Incomplete check response; refusing deployment")
    latest = {}
    for run in runs:
        name = run.get("name")
        if name not in CHECKS or run.get("app", {}).get("id") != GITHUB_ACTIONS_APP:
            continue
        if run.get("head_sha") != sha:
            raise ValueError("Check revision differs from main")
        identifier = run.get("id")
        if not isinstance(identifier, int) or identifier <= 0:
            raise ValueError("Invalid check identifier")
        if name not in latest or identifier > latest[name]["id"]:
            latest[name] = run
    return latest.keys() == CHECKS and all(
        run.get("status") == "completed" and run.get("conclusion") == "success"
        for run in latest.values()
    )


def next_release(repository, current, read=None):
    """Recheck main after admission; callers also verify the fetched Git revision."""
    if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repository):
        raise ValueError("Invalid GitHub repository")
    if read is None:
        read = lambda path: read_api(repository, path)
    sha = branch_sha(read("branches/main"))
    if sha == current:
        return None
    checks = read(f"commits/{sha}/check-runs?filter=latest&per_page=100")
    if not checks_passed(sha, checks):
        return None
    return sha if branch_sha(read("branches/main")) == sha else None


def read_api(repository, path):
    """Use anonymous HTTPS access; no GitHub credential is needed on the host."""
    request = urllib.request.Request(
        f"https://api.github.com/repos/{repository}/{path}",
        headers={"Accept": "application/vnd.github+json", "User-Agent": "Rebito-CD"},
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        body = response.read(2 * 1024 * 1024 + 1)
    if len(body) > 2 * 1024 * 1024:
        raise ValueError("Oversized GitHub response")
    return json.loads(body)
