// A running tally only goes up, but compaction makes real usage go DOWN: inject a measured figure every turn, and mark memory stale.
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const CUSTOM_TYPE = "context-meter";

interface Measured {
  used: number;
  window: number;
  percent: number;
  at: number;
}

let measured: Measured | null = null;
let stale = false;
let challenged: string | null = null;

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const pct = (used: number, window: number) => (window > 0 ? (used / window) * 100 : 0);

// "35.4% of context", "context ... 5k left", "12% window", "87,101 tokens remaining"
const CLAIM =
  /(\d{1,3}(?:[.,]\d+)?)\s?%\s*(?:of\s*)?(?:the\s*)?(?:my\s*)?context|context\s*(?:window\s*)?(?:is\s*)?(\d{1,3}(?:[.,]\d+)?)\s?%|(\d{1,4}[,\d]{0,6})\s*(?:k|tokens?)\s*(?:left|remaining)/i;

function claimPercent(text: string): number | null {
  const m = CLAIM.exec(text);
  if (!m) return null;
  const direct = m[1] ?? m[2];
  if (direct) return Number.parseFloat(direct.replace(",", "."));
  const tokens = Number.parseInt((m[3] ?? "").replace(/,/g, ""), 10);
  return measured && Number.isFinite(tokens) ? pct(tokens, measured.window) : null;
}

export default function (pi: ExtensionAPI) {
  pi.on("session_before_compact", () => {
    stale = true;
  });

  pi.on("model_select", () => {
    // A different model means a different window: percentages measured on the old one do not transfer.
    stale = true;
  });

  pi.on("before_agent_start", (_event, ctx) => {
    const usage = ctx.getContextUsage();
    measured =
      usage && usage.tokens !== null && usage.percent !== null
        ? { used: usage.tokens, window: usage.contextWindow, percent: usage.percent, at: Date.now() }
        : null;

    const lines: string[] = [];

    if (stale) {
      lines.push(
        "HISTORY WAS COMPACTED (or the model changed) since your previous measurement. Every context figure you " +
          "remember from earlier in this session is stale: compaction replaces raw history with a summary, so real " +
          "usage can be much SMALLER than your running total. Discard the old number.",
      );
      stale = false;
    }

    if (challenged) {
      lines.push(
        `MEASUREMENT DISPUTE: last turn you asserted ${challenged}, while the measurement was ` +
          `${measured ? `${measured.percent.toFixed(1)}% used` : "not measurable"}. Quote measurements, not memory.`,
      );
      challenged = null;
    }

    lines.push(
      measured
        ? `CONTEXT (measured by context-meter at this turn's start, not estimated): ${fmt(measured.used)} / ` +
            `${fmt(measured.window)} tokens = ${measured.percent.toFixed(1)}% used, ` +
            `${fmt(Math.max(0, measured.window - measured.used))} remaining. This is the only authoritative context ` +
            "figure in this transcript. Quote it, or call context_status for a newer one; never derive a percentage " +
            "by subtracting from a figure you remember."
        : "CONTEXT: not measurable at this moment (no provider usage for the current history yet, e.g. just after a " +
            "compaction). Do not state any context number; call context_status if you need one.",
    );

    return {
      message: {
        customType: CUSTOM_TYPE,
        content: [{ type: "text" as const, text: lines.join("\n\n") }],
        display: true,
        details: { measured, source: "context-meter" },
      },
    };
  });

  pi.on("message_end", (event, ctx) => {
    const message = event.message as { role?: string; content?: Array<{ type?: string; text?: string }> };
    if (message?.role !== "assistant" || !Array.isArray(message.content)) return;

    const text = message.content
      .filter((c) => c?.type === "text" && typeof c.text === "string")
      .map((c) => c.text as string)
      .join(" ");

    const claim = claimPercent(text);
    if (claim === null) return;

    // A figure quoted from the injected line (or a fresh context_status) is a measurement, not a claim.
    if (measured && Math.abs(claim - measured.percent) <= 5) return;

    challenged = `${claim.toFixed(1)}% context`;
    ctx.ui.notify(
      `context-meter: this turn asserted ${claim.toFixed(1)}% context, ${
        measured ? `measured is ${measured.percent.toFixed(1)}%` : "no measurement available"
      } — context facts must come from context_status`,
      "warning",
    );
  });
}
