# pi-context-meter

**Your model has no idea how full its context is, and it will state a number anyway.**

Pi never tells the model the window size or the token count, so any percentage it says — "I'm at
about 5% context", "nearly out of context" — is invented. This extension injects the measured
figure before every turn, and challenges the model when it quotes something else.

## What it fixes

Three failures, in order of how much they cost:

**Fabricated figures.** A model that says "few percent left" is guessing, and the guess is often
confidently wrong in both directions: it declares itself nearly out of context and compacts early,
or claims plenty of headroom and gets truncated mid-task.

**Stale running totals.** A model tracking usage turn-by-turn accumulates a number that only goes
up. Context compaction makes real usage go *down*, so after a compaction the remembered total is
not just imprecise, it points the wrong way. The extension marks the memory stale on compaction
and on model switch (a different model means a different window), and says so explicitly.

**Unchallenged claims.** When a turn asserts a percentage that differs from the measurement by more
than 5 points, the next turn's injection names both numbers, so the disagreement lands in front of
the model and does not get repeated as fact.

## What it looks like

Before each turn the model receives:

```text
CONTEXT (measured by context-meter at this turn's start, not estimated): 41,908 / 200,000 tokens
= 21.0% used, 158,092 remaining. This is the only authoritative context figure in this transcript.
Quote it, or call context_status for a newer one; never derive a percentage by subtracting from a
figure you remember.
```

After a compaction:

```text
HISTORY WAS COMPACTED (or the model changed) since your previous measurement. Every context figure
you remember from earlier in this session is stale: compaction replaces raw history with a summary,
so real usage can be much SMALLER than your running total. Discard the old number.
```

When a claim is challenged:

```text
MEASUREMENT DISPUTE: last turn you asserted 5.0% context, while the measurement was 38.4% used.
Quote measurements, not memory.
```

And when nothing is measurable — right after a compaction, before the provider has returned usage
for the new history — it says that, and tells the model to state no number at all.

## Install

```bash
pi install npm:pi-context-meter
```

Start pi as usual. No configuration, no keys, no model requirement: the numbers come from the same
usage the host already reports (`context_status`).

## Why percentages alone are not enough

`used / window` is a ratio, and ratios hide the thing you actually act on: remaining tokens. A 50%
full 32k window and a 50% full 200k window need different decisions, so the injection carries
tokens used, window size, percent, and tokens remaining. Quote the figure, do not re-derive it —
subtracting a remembered percentage from a remembered window is how invented numbers get a
decorative decimal point.

## How it works

Four hooks, no state on disk:

| Event | Behaviour |
| --- | --- |
| `before_agent_start` | Reads `getContextUsage()`, injects the measured line |
| `session_before_compact` | Marks the last measurement stale |
| `model_select` | Marks it stale — the window changed |
| `message_end` | Detects a context claim in the assistant's text, challenges it next turn if it disagrees |

A figure quoted from the injected line (or from a fresh `context_status`) is treated as a
measurement, not a claim, so the extension does not argue with its own numbers.

## Compatibility

Built against the pi extension API (`@earendil-works/pi-coding-agent`, declared as a peer
dependency and never bundled). TypeScript source, loaded by pi directly.

## License

MIT
