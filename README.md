# pi-context-meter

measured context usage injected every turn, so the model quotes a measurement and not a guess

Your prompt contains no context window size and no token count, so any percentage the model states without measuring is invented. This extension injects the measured figure every turn and marks memory state changes (compaction) so stale running totals are discarded.

## Install

```bash
pi install npm:pi-context-meter
```

Then start pi as usual — the measurement line appears every turn, no configuration.

