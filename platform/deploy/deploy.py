"""Root-operated Linux release runner; configuration and backups stay off Git."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess

from check_release import next_release
from release_transaction import publish, recover


def run(*args, **options):
    """Capture output so Compose configuration and credentials never reach logs."""
    result = subprocess.run(args, text=True, stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, timeout=1800, check=False, **options)
    if result.returncode:
        raise RuntimeError(f"{args[0]} failed ({result.returncode}): {result.stderr[-2000:]}")
    return result.stdout.strip()


def durable_write(path, content):
    """Rename and fsync both file and directory before the next cutover step."""
    temporary = path.with_suffix(".tmp")
    with temporary.open("w") as output:
        os.chmod(temporary, 0o600)
        output.write(content)
        output.flush()
        os.fsync(output.fileno())
    temporary.replace(path)
    sync_directory(path.parent)


def sync_directory(path):
    descriptor = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def revision(value):
    if not isinstance(value, str) or not re.fullmatch(r"[0-9a-f]{40}", value):
        raise ValueError("Expected a full Git revision")
    return value


def digest(path):
    checksum = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            checksum.update(chunk)
    return checksum.hexdigest()


def storage_layout(config):
    return {name: [mount for mount in service.get("volumes", []) if mount["type"] == "volume"]
            for name, service in config["services"].items()}


class Host:
    def __init__(self, repository):
        self.repository = repository
        self.project = "rebito"
        self.root = Path("/opt/rebito")
        self.private = Path("/etc/rebito")
        self.state = Path("/var/lib/rebito")

    def load(self):
        state = json.loads((self.state / "release.json").read_text())
        for key in ("current", "previous", "failed"):
            if key in state:
                revision(state[key])
        revision(state["current"])
        if "pending" in state:
            revision(state["pending"]["candidate"])
            if state["pending"]["phase"] not in ("stopping", "backed_up"):
                raise ValueError("Unknown recovery phase")
        return state

    def save(self, state):
        durable_write(self.state / "release.json", json.dumps(state) + "\n")

    def checkout(self, sha):
        return self.root / "releases" / revision(sha)

    def compose(self, sha, *args):
        return run("docker", "compose", "-p", self.project, "--env-file",
                   str(self.private / "app.env"), "-f",
                   str(self.checkout(sha) / "platform/compose.yaml"), "-f",
                   str(self.private / "compose.prod.yaml"), *args,
                   env={**os.environ, "REBITO_IMAGE": f"rebito-app:{sha}"})

    def prepare(self, sha, current):
        git = ("git", "--git-dir", str(self.root / "source.git"))
        run(*git, "fetch", "origin", "refs/heads/main:refs/heads/main")
        if run(*git, "rev-parse", "refs/heads/main") != sha:
            raise ValueError("Fetched main differs from the admitted revision")
        target = self.checkout(sha)
        if not target.exists():
            run(*git, "worktree", "add", "--detach", str(target), sha, umask=0o022)
        if run("git", "-C", str(target), "rev-parse", "HEAD") != sha:
            raise ValueError("Checkout does not match its release directory")
        if run("git", "-C", str(target), "status", "--porcelain"):
            raise ValueError("Deployment checkout contains local changes")
        before = json.loads(self.compose(current, "config", "--format", "json"))
        after = json.loads(self.compose(sha, "config", "--format", "json"))
        if before["services"]["database"]["image"] != after["services"]["database"]["image"]:
            raise ValueError("Database image changes require a separate migration review")
        if before.get("volumes") != after.get("volumes") or storage_layout(before) != storage_layout(after):
            raise ValueError("Storage layout changes require a separate migration review")
        self.check_space()
        run("docker", "build", "--tag", f"rebito-app:{sha}", "--label",
            f"org.opencontainers.image.revision={sha}", "--label",
            f"org.opencontainers.image.source=https://github.com/{self.repository}",
            str(target / "platform"))

    def maintenance(self, enabled):
        marker = self.state / "maintenance"
        if enabled:
            durable_write(marker, "Deployment in progress\n")
        else:
            marker.unlink(missing_ok=True)
            sync_directory(marker.parent)

    def stop(self, sha):
        # Stopping the app first drains writes before PostgreSQL shuts down.
        self.compose(sha, "stop", "--timeout", "60", "app")
        self.compose(sha, "stop", "--timeout", "60", "database")
        for service in ("app", "database"):
            identifier = self.compose(sha, "ps", "--all", "--quiet", service)
            info = json.loads(run("docker", "inspect", identifier))[0]["State"]
            if info["Running"]:
                raise RuntimeError(f"{service} is still running")

    def start(self, sha):
        self.compose(sha, "up", "-d", "--no-build", "--pull", "never",
                     "--wait", "--wait-timeout", "180")

    def volume(self, kind):
        if kind not in ("database", "saves"):
            raise ValueError("Unknown deployment volume")
        name = self.project + "_" + kind
        info = json.loads(run("docker", "volume", "inspect", name))[0]
        if info["Name"] != name or info.get("Labels", {}).get("com.docker.compose.project") != self.project:
            raise ValueError("Volume is not owned by this deployment")
        path = Path(info["Mountpoint"])
        if path.is_symlink() or path.name != "_data" or path.parent.name != name:
            raise ValueError("Unexpected Docker volume location")
        return path

    def check_space(self):
        used = sum(int(run("du", "-sb", str(self.volume(kind))).split()[0])
                   for kind in ("database", "saves"))
        if shutil.disk_usage(self.state).free < used + 3 * 1024 ** 3:
            raise RuntimeError("Insufficient space for a consistent backup and build")

    def backup(self, name, current):
        for service in ("app", "database"):
            identifier = self.compose(current, "ps", "--all", "--quiet", service)
            info = json.loads(run("docker", "inspect", identifier))[0]["State"]
            if info["Running"] or info["ExitCode"] != 0:
                raise RuntimeError(f"{service} did not shut down cleanly for backup")
        self.check_space()
        directory = self.state / "backups" / revision(name)
        directory.mkdir(parents=True, exist_ok=False, mode=0o700)
        checksums = {}
        for kind in ("database", "saves"):
            archive = directory / (kind + ".tar")
            run("tar", "--numeric-owner", "-cpf", str(archive), "-C", str(self.volume(kind)), ".")
            with archive.open("rb") as captured:
                os.fsync(captured.fileno())
            checksums[kind] = digest(archive)
        durable_write(directory / "sha256.json", json.dumps(checksums))
        durable_write(directory / "revision", current + "\n")
        sync_directory(directory.parent)

    def restore(self, name, current):
        directory = self.state / "backups" / revision(name)
        if (directory / "revision").read_text().strip() != current:
            raise ValueError("Backup does not match the previous release")
        # Archives are private, host-generated captures, never user uploads.
        for kind in ("database", "saves"):
            run("tar", "-tf", str(directory / (kind + ".tar")))
        checksums = json.loads((directory / "sha256.json").read_text())
        for kind in ("database", "saves"):
            if digest(directory / (kind + ".tar")) != checksums[kind]:
                raise ValueError("Backup checksum mismatch")
        for kind in ("database", "saves"):
            destination = self.volume(kind)
            for child in destination.iterdir():
                if child.is_dir() and not child.is_symlink():
                    shutil.rmtree(child)
                else:
                    child.unlink()
            run("tar", "--numeric-owner", "-xpf", str(directory / (kind + ".tar")),
                "-C", str(destination))
        run("sync")

    def cleanup(self):
        state = self.load()
        if state.get("pending"):
            return
        keep = {state.get(key) for key in ("current", "previous", "failed")}
        for directory in (self.root / "releases").iterdir():
            if re.fullmatch(r"[0-9a-f]{40}", directory.name) and directory.name not in keep:
                run("git", "--git-dir", str(self.root / "source.git"), "worktree",
                    "remove", str(directory))
        backups = self.state / "backups"
        if backups.exists():
            for directory in backups.iterdir():
                if re.fullmatch(r"[0-9a-f]{40}", directory.name) and directory.name not in keep:
                    shutil.rmtree(directory)
        images = run("docker", "image", "ls", "rebito-app", "--format", "{{.Tag}}")
        for tag in images.splitlines():
            if re.fullmatch(r"[0-9a-f]{40}", tag) and tag not in keep:
                run("docker", "image", "rm", f"rebito-app:{tag}")


def deploy_admitted(host, candidate):
    """Retry preparation outages later; only a failed cutover blocks a revision."""
    current = host.load()["current"]
    host.prepare(candidate, current)
    if next_release(host.repository, current) != candidate:
        raise ValueError("Main or checks changed during preparation")
    publish(host, candidate)
    host.cleanup()


def main():
    import fcntl  # Linux-only locking; pure policy tests also run on Windows.

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("repository", help="Public GitHub owner/repository")
    parser.add_argument("--retry", action="store_true", help="Retry the failed main revision")
    args = parser.parse_args()
    os.umask(0o077)
    host = Host(args.repository)
    with (host.state / "deployment.lock").open("w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        state = host.load()
        if state.get("pending") or (host.state / "maintenance").exists():
            recover(host)
            state = host.load()
        host.cleanup()
        candidate = next_release(args.repository, state["current"])
        if not candidate or candidate == state.get("failed") and not args.retry:
            print("No admitted update")
            return
        if args.retry:
            state.pop("failed", None)
            host.save(state)
            backup = host.state / "backups" / candidate
            if backup.exists():
                shutil.rmtree(backup)
        deploy_admitted(host, candidate)
        print("Published " + candidate)


if __name__ == "__main__":
    main()
