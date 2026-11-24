import { type DisplayText, message } from "../../shared/messages.ts";
import { EditorError, type EditorField, type EditorView } from "../types.ts";
import type { San3Document } from "./document.ts";
import { inspectSan3Treasures, san3TreasureRecipients } from "./treasures.ts";

/** Shared labels keep ownership previews consistent with the guarded selector. */
export function san3TreasureOwnerLabel(document: San3Document, owner: number): DisplayText {
  if (owner === 0xffff) return message("san3.none");
  if (owner >= 600) return message("san3.eventCustodian");
  return document.officer(owner).name || message("san3.officerRecord", { index: owner + 1 });
}

/** Only the treasure tab requires its full ownership inventory to be valid. */
export function san3TreasureView(
  document: San3Document,
  selected: number,
): Pick<EditorView, "records" | "columns" | "fields"> {
  const inventory = inspectSan3Treasures(document);
  const item = inventory.items[selected];
  if (!Number.isInteger(selected) || !item)
    throw new EditorError("invalid_edit", message("editor.selectRecord"));
  const recipients = san3TreasureRecipients(document);
  const owner = item.owner;
  const ownerLabel = (value: number) => san3TreasureOwnerLabel(document, value);
  const choices = [...new Set([owner ?? 0xffff, 0xffff, ...recipients])].map((value) => ({
    value,
    label: ownerLabel(value),
  }));
  const field: EditorField = {
    key: owner === null ? "context.bookTotal" : `treasure.${selected}.owner`,
    columnId: "owner",
    label: message(owner === null ? "san3.bookTotal" : "san3.treasureOwner"),
    group: message("san3.treasures"),
    value: owner ?? inventory.total,
    min: 0,
    max: 0xffff,
    readonly: owner === null || item.readonly || (owner < 600 && !recipients.includes(owner)),
    help: message(owner === null ? "san3.bookCopiesHelp" : "san3.treasureOwnershipHelp"),
    ...(owner === null ? {} : { choices }),
  };
  return {
    columns: [{ id: "owner", label: message("san3.treasureOwner"), defaultVisible: true }],
    fields: [field],
    records: inventory.items.map((entry) => ({
      id: String(entry.index),
      label: entry.name || message("san3.treasureRecord", { index: entry.index + 1 }),
      summary: entry.readonly ? message("san3.eventCustodian") : "",
      tags: [],
      available: true,
      cells: {
        owner:
          entry.owner === null
            ? message("san3.bookTotalCount", { count: inventory.total })
            : ownerLabel(entry.owner),
      },
    })),
  };
}

/** An unavailable inventory must not block unrelated officer inspection or editing. */
export function san3BookFields(document: San3Document, index: number): EditorField[] {
  document.offset("officers", index);
  try {
    const { copies } = inspectSan3Treasures(document);
    const value = copies[index] ?? 0;
    return [
      {
        key: `book.${index}.copies`,
        columnId: "bookCopies",
        label: message("san3.bookCopies"),
        group: message("san3.treasures"),
        value,
        min: 0,
        max: 7,
        help: message("san3.bookCopiesHelp"),
      },
    ];
  } catch (error) {
    if (error instanceof EditorError) return [];
    throw error;
  }
}
