"""Exercise release admission against incomplete, stale and untrusted evidence."""

import copy
import unittest

from check_release import CHECKS, GITHUB_ACTIONS_APP, branch_sha, checks_passed, next_release


SHA = "a" * 40
OTHER_SHA = "b" * 40


def branch(sha=SHA):
    return {"name": "main", "protected": True, "commit": {"sha": sha}}


def checks():
    runs = [
        {"id": index, "name": name, "head_sha": SHA,
         "app": {"id": GITHUB_ACTIONS_APP}, "status": "completed", "conclusion": "success"}
        for index, name in enumerate(sorted(CHECKS), 1)
    ]
    return {"total_count": len(runs), "check_runs": runs}


class ReleaseAdmissionTests(unittest.TestCase):
    def test_complete_exact_revision_is_accepted(self):
        replies = iter([branch(), checks(), branch()])
        self.assertEqual(next_release("owner/repo", None, lambda _: next(replies)), SHA)

    def test_unchanged_revision_uses_only_one_request(self):
        paths = []

        def read(path):
            paths.append(path)
            return branch()

        self.assertIsNone(next_release("owner/repo", SHA, read))
        self.assertEqual(paths, ["branches/main"])

    def test_moved_main_cannot_publish_the_old_revision(self):
        replies = iter([branch(), checks(), branch(OTHER_SHA)])
        self.assertIsNone(next_release("owner/repo", None, lambda _: next(replies)))

    def test_missing_failed_cancelled_and_pending_checks_are_rejected(self):
        for status, conclusion in [("queued", None), ("in_progress", None),
                                   ("completed", "failure"), ("completed", "cancelled"),
                                   ("completed", "skipped"), ("completed", "neutral")]:
            with self.subTest(status=status, conclusion=conclusion):
                response = checks()
                response["check_runs"][0].update(status=status, conclusion=conclusion)
                self.assertFalse(checks_passed(SHA, response))
        response = checks()
        response["check_runs"].pop()
        response["total_count"] -= 1
        self.assertFalse(checks_passed(SHA, response))

    def test_a_newer_rerun_invalidates_previous_success(self):
        response = checks()
        rerun = copy.deepcopy(response["check_runs"][0])
        rerun.update(id=100, status="queued", conclusion=None)
        response["check_runs"].insert(0, rerun)
        response["total_count"] += 1
        self.assertFalse(checks_passed(SHA, response))

    def test_another_application_cannot_spoof_a_required_check(self):
        response = checks()
        response["check_runs"][0]["app"]["id"] = 1
        self.assertFalse(checks_passed(SHA, response))

    def test_wrong_revision_and_truncated_results_fail_closed(self):
        response = checks()
        response["check_runs"][0]["head_sha"] = OTHER_SHA
        with self.assertRaises(ValueError):
            checks_passed(SHA, response)
        response = checks()
        response["total_count"] += 1
        with self.assertRaises(ValueError):
            checks_passed(SHA, response)

    def test_invalid_branch_or_repository_is_rejected(self):
        for change in [{"protected": False}, {"name": "develop"}, {"commit": {"sha": "../x"}}]:
            with self.subTest(change=change), self.assertRaises(ValueError):
                branch_sha({**branch(), **change})
        with self.assertRaises(ValueError):
            next_release("owner/repo/../../other", None)

    def test_network_failure_is_not_treated_as_a_success(self):
        def unavailable(_):
            raise TimeoutError("Unavailable")

        with self.assertRaises(TimeoutError):
            next_release("owner/repo", None, unavailable)


if __name__ == "__main__":
    unittest.main()
