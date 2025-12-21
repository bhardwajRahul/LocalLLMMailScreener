# Prompt Tuning Tool

An automated prompt tuning system that uses Claude Sonnet 4.5 to iteratively improve the email triage system prompt while maintaining security against prompt injection attacks.

## Overview

This tool helps reduce false positives (FP) and false negatives (FN) in email notifications by:
1. Analyzing your labeled email data
2. Having Claude propose prompt modifications
3. Testing those modifications against your dataset
4. Ensuring all changes pass parseltongue (prompt injection) tests
5. Iterating until errors are minimized

## Prerequisites

- Node.js 18+
- Parent project's `.env` configured with local LLM settings
- Anthropic API key
- Labeled email dataset (via backfill)

## Setup

### 1. Install Dependencies

```bash
cd prompt-tuning
npm install
```

### 2. Configure Anthropic API Key

Create `prompt-tuning/.env`:
```
ANTHROPIC_API_KEY=sk-ant-...
```

Or export in your shell:
```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

### 3. Create Configuration Files

Copy the example files:
```bash
cp config.json.example config.json
cp current_prompt.txt.example current_prompt.txt
```

Then copy your production prompt:
```bash
cp ../data/system_prompt.txt current_prompt.txt
```

Edit `config.json` to match your dataset sizes (see Configuration section below).

### 4. Backfill Email Data

The backfill script pulls historical emails from Gmail based on decisions stored in `../data/state.json`:

```bash
npm run backfill
```

This creates JSON files in:
- `notified/` - Emails that triggered notifications
- `notnotified/` - Emails that did not trigger notifications

Each file contains the email content, metadata, and the LLM's original decision.

## Labeling Your Data

After backfill, you must label misclassified emails:

### For False Positives (in `notified/` folder)

These are emails that notified but **should NOT have**. Edit the JSON to add:

```json
{
  "label": "FP",
  "reason": "Why you didn't want to be notified for this email"
}
```

### For False Negatives (in `notnotified/` folder)

These are emails that did NOT notify but **should have**. Edit the JSON to add:

```json
{
  "label": "FN", 
  "reason": "Why you wanted to be notified for this email"
}
```

### Correctly Classified Emails

- Emails in `notified/` without a label are assumed **TP** (True Positive)
- Emails in `notnotified/` without a label are assumed **TN** (True Negative)

## Configuration (config.json)

```json
{
  "max_attempts": 10,
  "model": "claude-sonnet-4-5-20250929",
  "temperature": 0.3,
  "stop_on_zero_errors": true,
  "regression_threshold": 0.1,
  "evaluation": {
    "errors_only": false,
    "max_fp": 23,
    "max_tp": 11,
    "max_tn": 34,
    "max_fn": 0
  }
}
```

### Field Reference

| Field | Description |
|-------|-------------|
| `max_attempts` | **Total** attempts allowed (not per-run). If log shows 5 attempts, next run starts at 6. |
| `model` | Claude model for analysis. Pin to specific version for reproducibility. |
| `temperature` | Claude's creativity (0.0-1.0). Lower = more consistent, higher = more varied approaches. |
| `stop_on_zero_errors` | Stop when FP + FN = 0. Set `false` to always run max_attempts. |
| `regression_threshold` | Warn if errors increase by more than this percentage (0.1 = 10%). |
| `evaluation.errors_only` | If `true`, only evaluate FP/FN labeled emails (faster, but no regression detection). |
| `evaluation.max_fp` | Max FP emails to include in test set. Use `null` for all. |
| `evaluation.max_tp` | Max TP emails to include in test set. Use `null` for all. |
| `evaluation.max_tn` | Max TN emails to include in test set. Use `null` for all. |
| `evaluation.max_fn` | Max FN emails to include in test set. Use `null` for all. |

### Balancing Your Test Set

For balanced evaluation, set limits to match your notified count:

```json
"evaluation": {
  "max_fp": 23,    // All your FPs
  "max_tp": 11,    // All your TPs  
  "max_tn": 34,    // Equal to total notified (23+11)
  "max_fn": 0      // All your FNs (or 0 if none labeled)
}
```

## Running the Tuner

```bash
npm run tune
```

### Command Line Options

```bash
node scripts/tune.js --dry-run    # Show what would be done without running
node scripts/tune.js --once       # Single iteration only
node scripts/tune.js --verbose    # Extra logging
```

## How It Works

### Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PROMPT TUNING FLOW                                │
└─────────────────────────────────────────────────────────────────────────────┘

                              ┌──────────────┐
                              │ START TUNING │
                              └──────┬───────┘
                                     │
                                     ▼
                    ┌────────────────────────────────┐
                    │ Load config.json & check       │
                    │ max_attempts vs attempts_log   │
                    └────────────────┬───────────────┘
                                     │
              ┌──────────────────────┴──────────────────────┐
              │                                             │
              ▼                                             ▼
     ┌─────────────────┐                         ┌──────────────────┐
     │ ATTEMPT 1       │                         │ ATTEMPT 2+       │
     │ (First Run)     │                         │ (Subsequent)     │
     └────────┬────────┘                         └────────┬─────────┘
              │                                           │
              ▼                                           ▼
┌─────────────────────────────┐           ┌─────────────────────────────┐
│ Load labeled FP/FN from     │           │ Load last_eval_results.json │
│ JSON files with:            │           │ with:                       │
│ • User's reason             │           │ • Fresh LLM reasoning from  │
│ • Original LLM reasoning    │           │   previous attempt          │
└─────────────┬───────────────┘           └─────────────┬───────────────┘
              │                                         │
              │    ┌────────────────────────────────────┘
              │    │
              ▼    ▼
     ┌─────────────────────────────────────────────┐
     │         Check for parseltongue failures     │
     │         from previous attempt               │
     │    ┌────────────────────────────────────┐   │
     │    │ If failures exist, Claude receives:│   │
     │    │ • Which tests failed               │   │
     │    │ • LLM's flawed reasoning           │   │
     │    │ • Warning to not repeat mistake    │   │
     │    └────────────────────────────────────┘   │
     └──────────────────────┬──────────────────────┘
                            │
                            ▼
     ┌─────────────────────────────────────────────┐
     │           CALL CLAUDE SONNET 4.5            │
     │                                             │
     │  Receives:                                  │
     │  • Current system prompt                    │
     │  • FP/FN data with reasoning               │
     │  • Full attempts_log history               │
     │  • Parseltongue failure context (if any)   │
     │  • Security-critical guidance              │
     │                                             │
     │  Outputs:                                   │
     │  • Hypothesis                               │
     │  • Proposed changes                         │
     │  • New complete prompt                      │
     └──────────────────────┬──────────────────────┘
                            │
                            ▼
     ┌─────────────────────────────────────────────┐
     │       Log hypothesis & changes to           │
     │       attempts_log.md                       │
     └──────────────────────┬──────────────────────┘
                            │
                            ▼
     ┌─────────────────────────────────────────────┐
     │       Save previous prompt to               │
     │       prompt_vN.txt (backup)                │
     └──────────────────────┬──────────────────────┘
                            │
                            ▼
     ┌─────────────────────────────────────────────┐
     │       Apply new prompt to                   │
     │       current_prompt.txt                    │
     └──────────────────────┬──────────────────────┘
                            │
                            ▼
     ┌─────────────────────────────────────────────┐
     │       RUN PARSELTONGUE TESTS (8 tests)      │
     │       All must return notify=false          │
     └──────────────────────┬──────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              │                           │
              ▼                           ▼
     ┌─────────────────┐         ┌─────────────────────┐
     │ ANY FAILED?     │         │ ALL PASSED ✓        │
     │                 │         │                     │
     │ • Revert prompt │         │ • Clear failure log │
     │ • Save failure  │         │ • Continue to eval  │
     │   details       │         │                     │
     │ • Log & retry   │         │                     │
     └────────┬────────┘         └──────────┬──────────┘
              │                             │
              │                             ▼
              │              ┌─────────────────────────────────┐
              │              │    RUN FULL EVALUATION          │
              │              │    Against all loaded emails:   │
              │              │    • FP, TP, TN, FN             │
              │              │    (per config.json limits)     │
              │              └────────────────┬────────────────┘
              │                               │
              │                               ▼
              │              ┌─────────────────────────────────┐
              │              │    Calculate results:           │
              │              │    • New FP count               │
              │              │    • New FN count               │
              │              │    • Compare to previous        │
              │              │    • Determine status           │
              │              └────────────────┬────────────────┘
              │                               │
              │                               ▼
              │              ┌─────────────────────────────────┐
              │              │    Save results to:             │
              │              │    • last_eval_results.json     │
              │              │    • attempts_log.md            │
              │              │    • Summary table              │
              │              └────────────────┬────────────────┘
              │                               │
              └───────────────┬───────────────┘
                              │
                              ▼
              ┌───────────────────────────────────┐
              │    Check stopping conditions:     │
              │    • max_attempts reached?        │
              │    • zero errors & stop_on_zero?  │
              │    • --once flag?                 │
              └───────────────┬───────────────────┘
                              │
              ┌───────────────┴───────────────┐
              │                               │
              ▼                               ▼
     ┌─────────────────┐             ┌─────────────────┐
     │ CONTINUE        │             │ STOP            │
     │ Next attempt    │             │ Print duration  │
     │ (loop back)     │             │ & summary       │
     └─────────────────┘             └─────────────────┘
```

### Attempt 1 vs Subsequent Attempts

| Aspect | Attempt 1 | Attempt 2+ |
|--------|-----------|------------|
| **FP/FN Data Source** | Labeled JSON files | `last_eval_results.json` |
| **LLM Reasoning** | Original decision from when email was processed | Fresh reasoning from previous attempt's prompt |
| **User Reasoning** | Included (your `reason` field) | Not included (Claude already saw it) |
| **Starting State** | Labeled counts | Previous attempt's actual results |

### Parseltongue Failure Handling

When a prompt change breaks injection resistance:

1. **Prompt is reverted** to previous version
2. **Failure details saved** (which tests, LLM's reasoning)
3. **Next Claude call receives warning** with specific failure context
4. **Attempt is not counted** toward max_attempts
5. **Loop continues** with Claude informed of what went wrong

## Output Files

| File | Description |
|------|-------------|
| `current_prompt.txt` | The actively tuned prompt (modify this for production) |
| `prompt_vN.txt` | Backup of prompt before attempt N+1 |
| `attempts_log.md` | Full history of all attempts, hypotheses, and results |
| `last_eval_results.json` | FP/FN from last successful evaluation (runtime) |
| `last_parseltongue_failure.json` | Details of failed injection tests (runtime) |

## Resuming Work

The tool automatically resumes from where it left off:

1. **Reads `attempts_log.md`** to count completed attempts
2. **Loads `last_eval_results.json`** for previous attempt's errors
3. **Loads `last_parseltongue_failure.json`** if previous attempt failed tests
4. **Uses `current_prompt.txt`** as the starting prompt

To continue after a break:
```bash
# Update max_attempts in config.json if needed
npm run tune
```

To start fresh:
```bash
# Reset to production prompt
cp ../data/system_prompt.txt current_prompt.txt

# Clear the log (or delete and recreate with header)
# Clear runtime files
rm -f last_eval_results.json last_parseltongue_failure.json prompt_v*.txt
```

## Applying Results to Production

When satisfied with the tuned prompt:

```bash
cp current_prompt.txt ../data/system_prompt.txt
```

## Tips

### Reducing False Positives vs False Negatives

- **Too many FPs**: Claude will try to add more exclusion rules
- **Too many FNs**: Claude will try to relax rules (but may break injection resistance)
- **Balance is key**: Some FPs may be acceptable to maintain security

### Handling Parseltongue Failures

If Claude repeatedly breaks the same tests:
- The tool now provides detailed failure context
- Claude receives security-critical guidance
- Check `attempts_log.md` to see what changes are being attempted
- Consider if your FP/FN requirements conflict with security needs

### Speeding Up Runs

- Set `errors_only: true` to only test FP/FN (no regression detection)
- Reduce `max_tn` to test fewer true negatives
- Use `--once` for single iterations during debugging

### Debugging

- Check `attempts_log.md` for full history
- Look at `prompt_vN.txt` files to see prompt evolution
- Run with `--verbose` for extra logging
- Use `--dry-run` to see what would happen without running

## Troubleshooting

### "No previous eval results found"

This happens when:
- It's the first attempt
- Previous attempt failed parseltongue tests
- `last_eval_results.json` was deleted

The tool falls back to labeled data from JSON files.

### Claude keeps breaking the same parseltongue test

The tool now:
1. Saves failure details with LLM reasoning
2. Shows Claude exactly what failed and why
3. Provides security-critical guidance

If it persists, the FP/FN you're trying to fix may fundamentally conflict with injection resistance.

### High variance between runs

Local LLMs can be non-deterministic. Consider:
- Running multiple evaluation passes
- Accepting small variance (±1-2 errors) as noise
- Using seed parameter if your LLM supports it

## Scripts Reference

| Script | Description |
|--------|-------------|
| `npm run backfill` | Fetch historical emails from Gmail |
| `npm run evaluate` | Run evaluation without Claude tuning |
| `npm run tune` | Run the full tuning loop |
| `npm test` | Run the test suite |

