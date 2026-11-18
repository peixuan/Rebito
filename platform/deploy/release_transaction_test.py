"""Failure injection for the durable deployment journal and traffic boundary."""

import copy
import unittest

from release_transaction import publish, recover


class Host:
    def __init__(self, fail=None):
        self.state = {"current": "old"}
        self.events = []
        self.fail = fail
        self.data = "original save"
        self.snapshot = None
        self.closed = False

    def event(self, name):
        self.events.append(name)
        if self.fail == name:
            self.fail = None
            raise RuntimeError(name)

    def load(self):
        return copy.deepcopy(self.state)

    def save(self, value):
        self.event("commit" if value["current"] == "new" else "journal")
        self.state = copy.deepcopy(value)

    def maintenance(self, closed):
        self.event("close" if closed else "open")
        self.closed = closed

    def stop(self, revision):
        self.event("stop:" + revision)

    def backup(self, candidate, current):
        self.event("backup")
        self.snapshot = self.data

    def restore(self, candidate, current):
        self.event("restore")
        self.data = self.snapshot

    def start(self, revision):
        if revision == "new":
            assert self.closed
            self.data = "startup mutation"
        self.event("start:" + revision)


class ReleaseTransactionTests(unittest.TestCase):
    def test_success_commits_before_opening_traffic(self):
        host = Host()
        publish(host, "new")
        self.assertEqual(host.state, {"current": "new", "previous": "old"})
        self.assertEqual(host.events, ["journal", "close", "stop:old", "backup",
                                      "journal", "start:new", "commit", "open"])

    def test_failures_before_cutover_preserve_original_data(self):
        for failure in ["close", "stop:old", "backup"]:
            with self.subTest(failure=failure):
                host = Host(failure)
                with self.assertRaises(RuntimeError):
                    publish(host, "new")
                self.assertEqual(host.data, "original save")
                self.assertEqual(host.state, {"current": "old", "failed": "new"})
                self.assertNotIn("restore", host.events)
                self.assertFalse(host.closed)

    def test_startup_and_commit_failure_restore_the_matching_snapshot(self):
        for failure in ["start:new", "commit"]:
            with self.subTest(failure=failure):
                host = Host(failure)
                with self.assertRaises(RuntimeError):
                    publish(host, "new")
                self.assertEqual(host.data, "original save")
                self.assertEqual(host.events[-5:],
                                 ["stop:new", "restore", "start:old", "journal", "open"])

    def test_proxy_failure_after_commit_never_rolls_back(self):
        host = Host("open")
        with self.assertRaises(RuntimeError):
            publish(host, "new")
        self.assertEqual(host.state["current"], "new")
        self.assertNotIn("restore", host.events)
        self.assertFalse(host.closed)

    def test_recovery_failure_keeps_the_journal_and_proxy_closed(self):
        host = Host("restore")
        host.snapshot = "original save"
        host.state["pending"] = {"candidate": "new", "phase": "backed_up"}
        with self.assertRaises(RuntimeError):
            recover(host)
        self.assertTrue(host.closed)
        self.assertIn("pending", host.state)
        recover(host)
        self.assertFalse(host.closed)
        self.assertEqual(host.data, "original save")

    def test_interruption_before_backup_does_not_restore_partial_files(self):
        host = Host()
        host.state["pending"] = {"candidate": "new", "phase": "stopping"}
        recover(host)
        self.assertNotIn("restore", host.events)
        self.assertEqual(host.state, {"current": "old", "failed": "new"})

    def test_failed_or_pending_revision_requires_operator_action(self):
        for state in [{"current": "new"}, {"current": "old", "failed": "new"},
                      {"current": "old", "pending": {}}]:
            host = Host()
            host.state = state
            if "pending" in state:
                host.state["pending"] = {"candidate": "other", "phase": "stopping"}
            with self.subTest(state=state), self.assertRaises(ValueError):
                publish(host, "new")


if __name__ == "__main__":
    unittest.main()
