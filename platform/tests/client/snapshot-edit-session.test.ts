import { expect, it } from "vitest";
import { computed, reactive, ref } from "vue";
import { SnapshotEditSession } from "../../client/runtime/snapshot-edit-session.ts";

it("requires a completed capture of the exact revision and updates reactive consumers", () => {
  const session = reactive(new SnapshotEditSession());
  const head = ref<string | null>("original");
  const eligible = computed(() => session.matches(head.value));
  expect(eligible.value).toBe(false);
  const ticket = session.beginCapture();
  expect(eligible.value).toBe(false);
  expect(session.acceptCapture(ticket, "original")).toBe(true);
  expect(eligible.value).toBe(true);
  head.value = "another-device";
  expect(eligible.value).toBe(false);
  head.value = null;
  expect(eligible.value).toBe(false);
});

it("rejects an earlier capture completion after a conflict, restart or newer capture", async () => {
  const session = new SnapshotEditSession();
  const oldTicket = session.beginCapture();
  let finish: (revision: string) => void = () => {};
  const upload = new Promise<string>((resolve) => {
    finish = resolve;
  });
  const completion = upload.then((revision) => session.acceptCapture(oldTicket, revision));
  session.invalidate();
  const currentTicket = session.beginCapture();
  expect(session.acceptCapture(currentTicket, "current")).toBe(true);
  finish("old");
  expect(await completion).toBe(false);
  expect(session.matches("current")).toBe(true);
  expect(session.matches("old")).toBe(false);
});

it("keeps failed capture and load retries closed until a fresh capture succeeds", () => {
  const session = new SnapshotEditSession();
  session.acceptCapture(session.beginCapture(), "before");
  const failedCapture = session.beginCapture();
  expect(session.matches("before")).toBe(false);
  expect(session.acceptCapture(failedCapture, "")).toBe(false);
  session.acceptCapture(failedCapture, "captured");
  // A load acknowledgement may change unrelated state even while playback stays paused.
  session.invalidate();
  session.invalidate();
  expect(session.matches("captured")).toBe(false);
  expect(session.acceptCapture(failedCapture, "edited")).toBe(false);
  session.acceptCapture(session.beginCapture(), "recaptured");
  expect(session.matches("recaptured")).toBe(true);
});
