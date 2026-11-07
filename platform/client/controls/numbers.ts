import { MessageError, message } from "../../src/shared/messages.ts";
export interface NumberSpec {
  min: number;
  max: number;
  multiplier?: number;
  divisor?: number;
}
export function displayNumber(value: number, spec: NumberSpec): string {
  return String((value * (spec.multiplier ?? 1)) / (spec.divisor ?? 1));
}
/** Normalize only edited text; untouched out-of-range values must survive. */
export function normalizeNumber(text: string, spec: NumberSpec) {
  const input = text.trim();
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(input))
    throw new MessageError(message("controls.enterNumber"));
  const requested = (Number(input) * (spec.divisor ?? 1)) / (spec.multiplier ?? 1);
  const rounded = Math.round(requested);
  const raw = Math.max(spec.min, Math.min(spec.max, rounded)) || 0;
  return { raw, text: displayNumber(raw, spec), adjusted: requested !== raw };
}
