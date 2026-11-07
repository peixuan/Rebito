import { message } from "../../shared/messages.ts";
import { type Context, type EditorRecord, numberField } from "./fields.ts";

export function mainRecords({ base, hero }: Context): EditorRecord[] {
  const fields = [
    numberField(
      "money",
      message("koukai2.money"),
      message("koukai2.assets"),
      base + 0x60a,
      4,
      600_000_000,
    ),
  ];
  for (const [index, [key, label]] of (
    [
      ["trade_fame", message("koukai2.tradeFame")],
      ["piracy_fame", message("koukai2.piracyFame")],
      ["adventure_fame", message("koukai2.adventureFame")],
    ] as const
  ).entries())
    fields.push(
      numberField(key, label, message("koukai2.fame"), base + 0x5b6 + hero * 14 + index * 2, 2),
    );
  for (const [index, [key, label]] of [
    ["portugal", message("koukai2.portugal")],
    ["spain", message("koukai2.spain")],
    ["ottoman", message("koukai2.ottoman")],
    ["england", message("koukai2.england")],
    ["italy", message("koukai2.italy")],
    ["netherlands", message("koukai2.netherlands")],
  ].entries())
    fields.push(
      numberField(
        `contribution_${key}`,
        message("koukai2.countryContribution", { country: label ?? "" }),
        message("koukai2.contribution"),
        base + 0x5bc + hero * 14 + index,
        1,
        100,
        { min: -100, bias: 100 },
      ),
    );
  fields.push(
    numberField(
      "date.year",
      message("koukai2.year"),
      message("koukai2.gameTime"),
      base + 6,
      1,
      1580,
      {
        min: 1501,
        bias: -1501,
        help: message("koukai2.dateHelp"),
      },
    ),
    numberField(
      "date.month",
      message("koukai2.month"),
      message("koukai2.gameTime"),
      base + 7,
      1,
      12,
      { min: 1, bias: -1 },
    ),
    numberField("date.day", message("koukai2.day"), message("koukai2.gameTime"), base + 8, 1, 31, {
      min: 1,
      bias: -1,
    }),
    numberField(
      "date.time",
      message("koukai2.time"),
      message("koukai2.gameTime"),
      base + 9,
      1,
      71,
      {
        choices: Array.from({ length: 72 }, (_, value) => ({
          value,
          label: `${String(Math.floor(value / 3)).padStart(2, "0")}:${String((value % 3) * 20).padStart(2, "0")}`,
        })),
      },
    ),
  );
  return [{ id: "main", label: message("koukai2.main"), fields }];
}
