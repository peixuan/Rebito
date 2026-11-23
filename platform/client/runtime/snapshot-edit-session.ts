/** A captured revision is editable only until playback or a state load can advance it. */
export class SnapshotEditSession {
  private generation = 0;
  private revision: string | null = null;

  invalidate(): void {
    this.revision = null;
    this.generation++;
  }

  beginCapture(): number {
    this.invalidate();
    return this.generation;
  }

  /** A late capture cannot reopen an editing session after a conflict or restart. */
  acceptCapture(ticket: number, revision: string): boolean {
    if (ticket !== this.generation || !revision) return false;
    this.revision = revision;
    return true;
  }

  matches(revision: string | null): boolean {
    return revision !== null && revision === this.revision;
  }
}
