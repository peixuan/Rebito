import type { DisplayText } from "../../src/shared/messages.ts";

type Directions = readonly [number, number, number, number];

export interface TouchKey {
  code: number;
  label: DisplayText;
}

/** Track each contact separately so lifting one thumb cannot release another's key. */
export class TouchInput {
  readonly directions: Directions;
  readonly buttons: readonly TouchKey[];
  private readonly send: (code: number, pressed: boolean) => void;
  private readonly contacts = new Map<number, readonly number[]>();

  constructor(
    directions: Directions,
    buttons: readonly TouchKey[],
    send: (code: number, pressed: boolean) => void,
  ) {
    this.directions = directions;
    this.buttons = buttons;
    this.send = send;
  }

  tracks(pointer: number) {
    return this.contacts.has(pointer);
  }

  held() {
    return new Set([...this.contacts.values()].flat());
  }

  update(pointer: number, codes: readonly number[] | null) {
    const before = this.held();
    if (codes === null) this.contacts.delete(pointer);
    else this.contacts.set(pointer, codes);
    const after = this.held();
    for (const code of before) if (!after.has(code)) this.send(code, false);
    for (const code of after) if (!before.has(code)) this.send(code, true);
  }

  clear() {
    const held = this.held();
    this.contacts.clear();
    for (const code of held) this.send(code, false);
  }
}
