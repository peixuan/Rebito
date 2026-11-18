"""Host boundary tests; the separate Linux drill exercises real Docker volumes."""

import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from deploy import Host, revision, storage_layout


SHA = "a" * 40


class HostBoundaryTests(unittest.TestCase):
    def test_storage_layout_preserves_targets_and_ignores_checkout_bind_paths(self):
        volume = {"type": "volume", "source": "saves", "target": "/data"}
        config = {"services": {"app": {"volumes": [volume, {"type": "bind", "source": "/checkout"}]}}}
        self.assertEqual(storage_layout(config), {"app": [volume]})
        self.assertNotEqual(storage_layout(config), {"app": [{**volume, "target": "/other"}]})

    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.host = Host("owner/repo")
        self.host.state = Path(self.temporary.name)
        self.host.root = Path(self.temporary.name) / "source"

    def test_revision_rejects_path_traversal_and_abbreviations(self):
        for value in [None, "", "../release", "a" * 39, "A" * 40, "a" * 41]:
            with self.subTest(value=value), self.assertRaises(ValueError):
                revision(value)
        self.assertEqual(revision(SHA), SHA)

    def test_journal_validates_all_revisions_and_recovery_phase(self):
        for state in [{"current": "../bad"}, {"current": SHA, "failed": "../bad"},
                      {"current": SHA, "pending": {"candidate": SHA, "phase": "unknown"}}]:
            (self.host.state / "release.json").write_text(json.dumps(state))
            with self.subTest(state=state), self.assertRaises(ValueError):
                self.host.load()

    def test_volume_requires_the_exact_project_and_name(self):
        expected = {"Name": "rebito_saves", "Mountpoint": "/volumes/rebito_saves/_data",
                    "Labels": {"com.docker.compose.project": "rebito"}}
        for change in [{"Name": "other_saves"}, {"Labels": {}},
                       {"Mountpoint": "/var/lib/other"}]:
            with self.subTest(change=change), patch("deploy.run", return_value=json.dumps([
                {**expected, **change}
            ])), self.assertRaises(ValueError):
                self.host.volume("saves")
        with self.assertRaises(ValueError):
            self.host.volume("../database")

    def test_mismatched_backup_is_rejected_before_volume_access(self):
        directory = self.host.state / "backups" / SHA
        directory.mkdir(parents=True)
        (directory / "revision").write_text("b" * 40)
        with patch.object(self.host, "volume") as volume, self.assertRaises(ValueError):
            self.host.restore(SHA, SHA)
        volume.assert_not_called()

    def test_disk_guard_includes_both_volumes_and_a_free_space_margin(self):
        with patch.object(self.host, "volume", return_value=Path("/volume")), \
                patch("deploy.run", return_value="1000000000 /volume"), \
                patch("deploy.shutil.disk_usage") as usage:
            usage.return_value.free = 4 * 1024 ** 3
            with self.assertRaises(RuntimeError):
                self.host.check_space()
            usage.return_value.free = 6 * 1024 ** 3
            self.host.check_space()

    def test_backup_refuses_unclean_service_shutdown(self):
        with patch.object(self.host, "compose", return_value="container"), \
                patch("deploy.run", return_value=json.dumps([
                    {"State": {"Running": False, "ExitCode": 137}}
                ])), self.assertRaises(RuntimeError):
            self.host.backup(SHA, SHA)
        self.assertFalse((self.host.state / "backups").exists())

    def test_restore_validates_both_archives_before_deleting_any_files(self):
        directory = self.host.state / "backups" / SHA
        directory.mkdir(parents=True)
        (directory / "revision").write_text(SHA)
        with patch("deploy.run", side_effect=["archive list", RuntimeError("corrupt")]), \
                patch.object(self.host, "volume") as volume, self.assertRaises(RuntimeError):
            self.host.restore(SHA, SHA)
        volume.assert_not_called()

    def test_cleanup_never_runs_during_recovery(self):
        with patch.object(self.host, "load", return_value={"pending": {"phase": "backed_up"}}), \
                patch("deploy.run") as command:
            self.host.cleanup()
        command.assert_not_called()

    def test_modified_backup_bytes_never_reach_volume_deletion(self):
        directory = self.host.state / "backups" / SHA
        directory.mkdir(parents=True)
        (directory / "revision").write_text(SHA)
        (directory / "database.tar").write_bytes(b"modified")
        (directory / "sha256.json").write_text(json.dumps({"database": "invalid"}))
        with patch("deploy.run", return_value="archive list"), \
                patch.object(self.host, "volume") as volume, self.assertRaises(ValueError):
            self.host.restore(SHA, SHA)
        volume.assert_not_called()


if __name__ == "__main__":
    unittest.main()
