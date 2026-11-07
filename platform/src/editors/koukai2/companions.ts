import { MessageError, message } from "../../shared/messages.ts";
import { type Changes, type Context, choices, type EditorRecord, numberField } from "./fields.ts";
import { personNames } from "./names.ts";
import { affiliationFields, personName, personOffset, personStatus, roster } from "./persons.ts";

export function companionRecords(context: Context): EditorRecord[] {
  const members = [
    ...choices(personNames).map((item) => ({ ...item, label: personName(context, item.value) })),
    { value: 255, label: message("common.empty") },
  ];
  return [...roster(context)].map((id, index) => {
    const key = `companion.${index}`;
    const fields = [
      numberField(
        `${key}.member`,
        message("koukai2.companionMember"),
        message("koukai2.companion"),
        context.base + 0x2177 + index,
        1,
        255,
        {
          choices: members,
          help: message("koukai2.companionHelp"),
        },
      ),
      numberField(
        `${key}.salary`,
        message("koukai2.salary"),
        message("koukai2.companion"),
        context.base + 0x2195 + index,
        1,
        255,
        {
          multiplier: 10,
        },
      ),
    ];
    if (id < 120)
      fields.push(
        numberField(
          `person.${id}.loyalty`,
          message("koukai2.loyalty"),
          message("koukai2.companion"),
          personOffset(context, id) + 0x11,
          1,
        ),
      );
    return {
      id: key,
      label: message("koukai2.companionSlot", { index: index + 1 }),
      fields,
      summary:
        id < 120
          ? personName(context, id)
          : id === 255
            ? message("common.empty")
            : message("koukai2.invalidPerson"),
      actions:
        id < 120 ? [{ id: "companions.apply_all", label: message("koukai2.applyCrew") }] : [],
    };
  });
}
export function sailorRecords(context: Context): EditorRecord[] {
  return personNames.flatMap((_, id) => {
    if (id === context.hero) return [];
    const actions = [
      {
        id: "person.dismiss",
        label: message("koukai2.dismiss"),
        help: message("koukai2.dismissHelp"),
      },
    ];
    if (!roster(context).includes(id))
      actions.unshift({
        id: "person.recruit",
        label: message("koukai2.recruit"),
        help: message("koukai2.recruitHelp"),
      });
    if (context.bytes[personOffset(context, id) + 0x12] !== 254)
      actions.push({
        id: "person.hide",
        label: message("koukai2.hideSailor"),
        help: message("koukai2.hideSailorHelp"),
      });
    return [
      {
        id: `person.${id}`,
        label: personName(context, id),
        summary: personStatus(context, id),
        fields: affiliationFields(context, id),
        actions,
      },
    ];
  });
}
function recordIndex(record: string, prefix: string, count: number): number {
  const id = Number(record.slice(prefix.length));
  if (!Number.isInteger(id) || id < 0 || id >= count || record !== `${prefix}${id}`)
    throw new MessageError(message("editor.selectRecord"));
  return id;
}
export function personAction(context: Context, action: string, record: string): Changes {
  const members = roster(context);
  const result: Changes = {};
  if (action === "companions.apply_all") {
    const index = recordIndex(record, "companion.", 30);
    const id = members[index] ?? 255;
    if (id >= 120) throw new MessageError(message("koukai2.selectCompanion"));
    const salary = context.bytes[context.base + 0x2195 + index] ?? 0;
    const loyalty = context.bytes[personOffset(context, id) + 0x11] ?? 0;
    members.forEach((member, position) => {
      if (member < 120) {
        result[`companion.${position}.salary`] = salary;
        result[`person.${member}.loyalty`] = loyalty;
      }
    });
    return result;
  }
  if (!["person.recruit", "person.dismiss", "person.hide"].includes(action))
    throw new MessageError(message("koukai2.unknownPersonAction"));
  const id = recordIndex(record, "person.", 120);
  if (id === context.hero) throw new MessageError(message("koukai2.heroAffiliation"));
  const key = `person.${id}`;
  const position = members.indexOf(id);
  if (action === "person.recruit") {
    if (position >= 0) throw new MessageError(message("koukai2.alreadyRecruited"));
    const free = members.indexOf(255);
    if (free < 0) throw new MessageError(message("koukai2.rosterFull"));
    return {
      [`companion.${free}.member`]: id,
      [`${key}.status`]: [0, 10, 30, 50, 40, 20][context.hero] ?? 0,
      [`${key}.port`]: 255,
      [`${key}.role`]: 6,
    };
  }
  let port = 0;
  if (action === "person.dismiss") {
    port = context.bytes[personOffset(context, id) + 0x13] ?? 255;
    if (port >= 100) throw new MessageError(message("koukai2.selectDismissalPort"));
  }
  result[`${key}.status`] = action === "person.dismiss" ? 255 : 254;
  result[`${key}.port`] = port;
  result[`${key}.role`] = 0;
  // Match the original editor: remove the first matching roster entry only.
  if (position >= 0) result[`companion.${position}.member`] = 255;
  return result;
}
