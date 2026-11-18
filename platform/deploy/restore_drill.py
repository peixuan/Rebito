"""Exercise rollback with real PostgreSQL and save volumes in an isolated project."""

import argparse
import json
import os
from pathlib import Path
import secrets
import socket
import tempfile

from deploy import Host, run
from release_transaction import publish


class DrillHost(Host):
    def __init__(self, directory, platform, image):
        super().__init__("unused/repository")
        self.project = "rebito-deploy-drill-" + secrets.token_hex(4)
        self.state = self.private = directory
        self.platform = platform
        self.image = image
        self.fail = True

    def compose(self, sha, *args):
        return run("docker", "compose", "-p", self.project, "--env-file",
                   str(self.private / "app.env"), "-f", str(self.platform / "compose.yaml"),
                   "-f", str(self.private / "compose.prod.yaml"), *args,
                   env={**os.environ, "REBITO_IMAGE": self.image})

    def sql(self, query):
        return self.compose("", "exec", "-T", "database", "psql", "-U", "retro", "-d",
                            "retro", "-v", "ON_ERROR_STOP=1", "-Atc", query)

    def write_probe(self, content):
        self.compose("", "exec", "-T", "app", "node", "-e",
                     "require('node:fs').writeFileSync('/data/deploy-probe'," +
                     json.dumps(content) + ")")

    def start(self, sha):
        super().start(sha)
        if sha == "b" * 40 and self.fail:
            self.fail = False
            self.sql("UPDATE deploy_probe SET value = 'changed by candidate'")
            self.write_probe("changed by candidate")
            raise RuntimeError("Injected failure after startup mutations")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--platform", type=Path, required=True)
    parser.add_argument("--image", required=True, help="Already-built application image")
    args = parser.parse_args()
    os.umask(0o077)
    with tempfile.TemporaryDirectory(prefix="rebito-deploy-drill-") as temporary:
        directory = Path(temporary)
        with socket.socket() as listener:
            listener.bind(("127.0.0.1", 0))
            port = listener.getsockname()[1]
        settings = {"APP_PORT": str(port), "APP_ORIGIN": f"http://localhost:{port}",
                    "AUTH_SECRET": secrets.token_hex(32), "DATABASE_PASSWORD": secrets.token_hex(32),
                    "POSTGRES_PASSWORD": secrets.token_hex(32)}
        (directory / "app.env").write_text("".join(f"{key}={value}\n" for key, value in settings.items()))
        (directory / "compose.prod.yaml").write_text(
            "services:\n  app:\n    image: ${REBITO_IMAGE}\n  database:\n    mem_limit: 384m\n")
        host = DrillHost(directory, args.platform.resolve(), args.image)
        old, failed, accepted = "a" * 40, "b" * 40, "c" * 40
        try:
            host.start(old)
            host.sql("CREATE TABLE deploy_probe (value text); INSERT INTO deploy_probe VALUES ('original')")
            host.write_probe("original")
            host.save({"current": old})
            try:
                publish(host, failed)
            except RuntimeError as error:
                if str(error) != "Injected failure after startup mutations":
                    raise
            else:
                raise AssertionError("Injected failure was not observed")
            assert host.load() == {"current": old, "failed": failed}
            assert host.sql("SELECT value FROM deploy_probe") == "original"
            assert (host.volume("saves") / "deploy-probe").read_text() == "original"
            assert not (directory / "maintenance").exists()
            publish(host, accepted)
            assert host.load()["current"] == accepted
            host.compose(accepted, "restart", "app")
            host.start(accepted)
            assert host.sql("SELECT value FROM deploy_probe") == "original"
            assert (host.volume("saves") / "deploy-probe").read_text() == "original"
            print("Real volume rollback, successful cutover and restart persistence passed")
        finally:
            # Only this randomly named drill project is ever removed.
            assert host.project.startswith("rebito-deploy-drill-")
            host.compose(old, "down", "--volumes", "--remove-orphans")


if __name__ == "__main__":
    main()
