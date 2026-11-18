"""Expiry remains a deployment gate after CI and cached builds have succeeded."""

from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch

from deploy import Host, deploy_admitted
from security_window import check_security_window


class SecurityWindowTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.platform = Path(self.temporary.name)
        self.lock = b"reviewed lock fixture"
        (self.platform / "package-lock.json").write_bytes(self.lock)
        self.exception = {
            "advisory": "https://github.com/advisories/GHSA-fc5q-39xc-vjpf",
            "package": "picomatch", "version": "4.0.7",
            "approvedAt": "2026-11-18T03:13:54Z", "expiresAt": "2026-12-18T03:13:54Z",
            "lockfileSha256": hashlib.sha256(self.lock).hexdigest(),
        }
        self.now = datetime(2026, 11, 19, tzinfo=timezone.utc)

    def write(self, value):
        (self.platform / "security-exception.json").write_text(json.dumps(value))

    def test_active_approval_and_removal(self):
        check_security_window(self.platform, self.now)
        self.write(None)
        check_security_window(self.platform, self.now)
        self.write(self.exception)
        check_security_window(self.platform, self.now)

    def test_rejects_expiry_future_approval_and_extended_window(self):
        for change in [
            {"expiresAt": "2026-11-19T00:00:00Z"},
            {"approvedAt": "2026-11-20T00:00:00Z"},
            {"expiresAt": "2026-12-19T03:13:54Z"},
            {"expiresAt": "2026-11-18T03:13:54Z"},
            {"expiresAt": "invalid"},
            {"expiresAt": "2026-12-18T03:13:54"},
            {"package": "other"}, {"version": "4.0.6"},
            {"advisory": "https://example.test"}, {"lockfileSha256": "changed"},
        ]:
            with self.subTest(change=change), self.assertRaises(ValueError):
                self.write({**self.exception, **change})
                check_security_window(self.platform, self.now)

    def test_invalid_policy_fails_closed(self):
        for content in ["{", "{}", "[]"]:
            (self.platform / "security-exception.json").write_text(content)
            with self.subTest(content=content), self.assertRaises((ValueError, KeyError, TypeError)):
                check_security_window(self.platform, self.now)

    def test_expired_checkout_is_rejected_before_building(self):
        host = Host("owner/repo")
        candidate = "b" * 40
        with patch("deploy.run", side_effect=["", candidate, candidate, ""]) as command, \
                patch.object(host, "checkout", return_value=self.platform), \
                patch.object(host, "check_security_window", side_effect=ValueError("expired")), \
                patch.object(host, "compose") as compose, self.assertRaises(ValueError):
            host.prepare(candidate, "a" * 40)
        compose.assert_not_called()
        self.assertFalse(any(call.args[0] == "docker" for call in command.call_args_list))

    def test_expiry_after_build_never_stops_the_running_release(self):
        host = Mock(repository="owner/repo")
        host.load.return_value = {"current": "a" * 40}
        host.check_security_window.side_effect = ValueError("expired after build")
        candidate = "b" * 40
        with patch("deploy.next_release", return_value=candidate), \
                patch("deploy.publish") as publish, self.assertRaises(ValueError):
            deploy_admitted(host, candidate)
        host.prepare.assert_called_once_with(candidate, "a" * 40)
        host.check_security_window.assert_called_once_with(candidate)
        host.save.assert_not_called()
        publish.assert_not_called()


if __name__ == "__main__":
    unittest.main()
