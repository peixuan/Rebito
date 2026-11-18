"""Crash-recoverable cutover; the proxy stays closed until a release is committed."""


def recover(host):
    """Restore only an unpublished attempt, never a release that accepted traffic."""
    state = host.load()
    pending = state.get("pending")
    if pending:
        host.maintenance(True)
        host.stop(pending["candidate"])
        if pending["phase"] == "backed_up":
            host.restore(pending["candidate"], state["current"])
        host.start(state["current"])
        state["failed"] = pending["candidate"]
        del state["pending"]
        host.save(state)
    else:
        host.start(state["current"])
    host.maintenance(False)


def publish(host, candidate):
    """Build/admission precede this function; all data mutation follows a backup."""
    state = host.load()
    if state.get("pending"):
        raise ValueError("Recover the interrupted deployment first")
    if candidate in (state["current"], state.get("failed")):
        raise ValueError("Revision already deployed or awaiting operator retry")
    state["pending"] = {"candidate": candidate, "phase": "stopping"}
    host.save(state)
    try:
        host.maintenance(True)
        host.stop(state["current"])
        host.backup(candidate, state["current"])
        state["pending"]["phase"] = "backed_up"
        host.save(state)
        host.start(candidate)
        # Commit before opening traffic. Recovery must never undo accepted saves.
        host.save({"current": candidate, "previous": state["current"]})
        host.maintenance(False)
    except Exception:
        recover(host)
        raise
