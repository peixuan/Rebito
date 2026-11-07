import { type DisplayText, message } from "../../shared/messages.ts";
import { type Context, choices, type EditorRecord, numberField } from "./fields.ts";
import { personNames, portNames } from "./names.ts";

export function personOffset({ base }: Context, id: number) {
  return base + 0x62c + id * 50;
}
export function personName(context: Context, id: number): DisplayText {
  const marker = context.bytes[context.base + 0x11cb];
  if (id === 60 && marker === 0xba) return message("koukai2.rudolph");
  if (id === 60 && marker === 0xe4) return message("koukai2.robertus");
  return personNames[id] ?? message("koukai2.unknownPerson", { id });
}
export function roster(context: Context) {
  return context.bytes.subarray(context.base + 0x2177, context.base + 0x2195);
}
export function affiliationFields(context: Context, id: number) {
  const key = `person.${id}`;
  const offset = personOffset(context, id);
  return [
    numberField(
      `${key}.status`,
      message("koukai2.affiliationState"),
      message("koukai2.affiliation"),
      offset + 0x12,
      1,
      255,
      {
        help: message("koukai2.affiliationHelp"),
      },
    ),
    numberField(
      `${key}.port`,
      message("koukai2.port"),
      message("koukai2.affiliation"),
      offset + 0x13,
      1,
      255,
      {
        choices: [...choices(portNames), { value: 255, label: message("koukai2.atSea") }],
      },
    ),
    numberField(
      `${key}.role`,
      message("koukai2.affiliationExtra"),
      message("koukai2.affiliation"),
      offset + 0x14,
      1,
      255,
      {
        help: message("koukai2.affiliationExtraHelp"),
      },
    ),
  ];
}
export function personStatus(context: Context, id: number): DisplayText {
  const state = context.bytes[personOffset(context, id) + 0x12];
  return state === 255
    ? message("koukai2.unemployed")
    : state === 254
      ? message("koukai2.hidden")
      : roster(context).includes(id)
        ? message("koukai2.crewMember")
        : message("koukai2.captain");
}
export function personRecords(context: Context): EditorRecord[] {
  return personNames.map((_, id) => {
    const key = `person.${id}`;
    const offset = personOffset(context, id);
    const fields = (
      [
        ["leadership", message("koukai2.leadership")],
        ["navigation", message("koukai2.navigation")],
        ["knowledge", message("koukai2.knowledge")],
        ["intuition", message("koukai2.intuition")],
        ["courage", message("koukai2.courage")],
        ["swordsmanship", message("koukai2.swordsmanship")],
        ["charm", message("koukai2.charm")],
        ["luck", message("koukai2.luck")],
      ] as const
    ).map(([name, label], index) =>
      numberField(`${key}.${name}`, label, message("koukai2.abilities"), offset + 2 + index, 1),
    );
    for (const [name, label, relative, size] of [
      ["navigation_level", message("koukai2.navigationLevel"), 0xa, 1],
      ["battle_level", message("koukai2.battleLevel"), 0xb, 1],
      ["navigation_experience", message("koukai2.navigationExperience"), 0xc, 2],
      ["battle_experience", message("koukai2.battleExperience"), 0xe, 2],
      ["age", message("koukai2.age"), 0x10, 1],
      ["loyalty", message("koukai2.loyalty"), 0x11, 1],
    ] as const)
      fields.push(
        numberField(`${key}.${name}`, label, message("koukai2.levels"), offset + relative, size),
      );
    for (const [index, [name, label]] of (
      [
        ["surveying", message("koukai2.surveying")],
        ["cartography", message("koukai2.cartography")],
        ["gunnery", message("koukai2.gunnery")],
        ["accounting", message("koukai2.accounting")],
        ["negotiation", message("koukai2.negotiation")],
      ] as const
    ).entries())
      fields.push(
        numberField(`${key}.${name}`, label, message("koukai2.skills"), offset + 0x16, 1, 1, {
          boolean: true,
          mask: 1 << (4 - index),
          shift: 4 - index,
        }),
      );
    fields.push(
      numberField(
        `${key}.country`,
        message("koukai2.nationality"),
        message("koukai2.status"),
        offset + 0x17,
        1,
        6,
        {
          choices: choices([
            message("koukai2.portugal"),
            message("koukai2.spain"),
            message("koukai2.ottoman"),
            message("koukai2.england"),
            message("koukai2.italy"),
            message("koukai2.netherlands"),
            message("koukai2.pirate"),
          ]),
          mask: 7,
          writeOr: 0x60,
          preserveBits: false,
        },
      ),
    );
    if (id < 6)
      fields.push(
        numberField(
          `${key}.title`,
          message("koukai2.title"),
          message("koukai2.status"),
          context.base + 0x5c3 + id * 14,
          1,
          9,
          {
            choices: choices(
              id === 5
                ? [
                    message("koukai2.noTitle"),
                    message("koukai2.patrician"),
                    message("koukai2.inspector"),
                    message("koukai2.prefect"),
                    message("koukai2.governor"),
                    message("koukai2.prince"),
                    message("koukai2.greatPrince"),
                    message("koukai2.lord"),
                    message("koukai2.chancellor"),
                    message("koukai2.grandChancellor"),
                  ]
                : [
                    message("koukai2.noTitle"),
                    message("koukai2.squire"),
                    message("koukai2.esquire"),
                    message("koukai2.knight"),
                    message("koukai2.baronet"),
                    message("koukai2.baron"),
                    message("koukai2.viscount"),
                    message("koukai2.count"),
                    message("koukai2.marquis"),
                    message("koukai2.duke"),
                  ],
            ),
          },
        ),
      );
    fields.push(...affiliationFields(context, id));
    return {
      id: key,
      label: personName(context, id),
      summary: personStatus(context, id),
      fields,
      tags: roster(context).includes(id) ? ["companion"] : [],
    };
  });
}
