"""Reject stale CI approvals after the owner's temporary risk window expires."""

from datetime import datetime, timedelta, timezone
import hashlib
import json


def check_security_window(platform, now=None):
    """Check before building and again before cutover, even for cached images."""
    policy = platform / "security-exception.json"
    if not policy.exists():
        return
    exception = json.loads(policy.read_text())
    if exception is None:
        return
    if (exception["advisory"] != "https://github.com/advisories/GHSA-fc5q-39xc-vjpf"
            or exception["package"] != "picomatch" or exception["version"] != "4.0.7"):
        raise ValueError("Unreviewed security exception")
    approved = datetime.strptime(exception["approvedAt"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    expires = datetime.strptime(exception["expiresAt"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    current = now if now is not None else datetime.now(timezone.utc)
    if not timedelta(0) < expires - approved <= timedelta(days=30):
        raise ValueError("Security exception exceeds thirty days")
    if not approved <= current < expires:
        raise ValueError("Security exception is inactive or expired")
    checksum = hashlib.sha256((platform / "package-lock.json").read_bytes()).hexdigest()
    if checksum != exception["lockfileSha256"]:
        raise ValueError("Dependency lock changed; reassess the security exception")
