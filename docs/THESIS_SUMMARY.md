# From TaskSnap to ContextShifter — Changes and Rationale

A thesis-oriented summary of the work done while forking **TaskSnap** into
**ContextShifter**: not just *what* changed, but *why* each change matters for
the research question. Written for the thesis write-up (Bachelor thesis, HASEL
Lab, University of Zurich).

> **One-line framing.** TaskSnap captured a task's context as a *manual snapshot*
> taken at a single moment. ContextShifter reframes the problem as *continuous,
> automatic inference of task-relevant artefacts from interaction data*, with a
> tunable relevance model and a human-in-the-loop curation step — and an
> instrument to measure how well the model agrees with human judgement.

---

## 1. Research motivation and the conceptual shift

### 1.1 The problem with snapshots (TaskSnap)

TaskSnap let a developer press a button to *snapshot* the currently open
applications, browser tabs, and IDE files, and later restore that snapshot. It
worked, but it has two structural weaknesses that matter for the thesis:

1. **It depends on a deliberate, well-timed user action.** The user must both
   *remember* to capture and capture at the *right* moment. In real work the
   "right moment" rarely exists — a task's working set is built up over minutes
   or hours, not visible in any single instant.
2. **It captures presence, not relevance.** Whatever happens to be open at
   capture time is saved, including windows you glanced at once and forgot.
   There is no notion of *how much* an artefact actually mattered to the task.

These are exactly the failure modes the task-context / interruption-recovery
literature warns about: the cost of a tool that relies on user effort is that
the effort is often not spent, and presence is a poor proxy for relevance.

### 1.2 The ContextShifter model: the *active task*

ContextShifter replaces the snapshot with a single **active task** that is
tracked *continuously* while it is active (commit `1b6b979`, "replace
snapshot-on-create flow with active-task tracking + deferred commit"):

1. You **start/resume** a task; from then on the app records which artefacts you
   focus and for how long.
2. While active, [`ActiveTaskSession`](../src/main/ActiveTaskSession.ts)
   accumulates per-artefact usage statistics.
3. On **stop/switch** those statistics are turned into a **relevance score**
   ([`ArtifactScorer`](../src/main/ArtifactScorer.ts)); the highest-scoring
   artefacts are pre-selected and the user confirms the set.
4. Switching to a task **restores** it ([`TaskRestorer`](../src/main/TaskRestorer.ts)):
   it reopens that task's artefacts and closes the rest.

**Why this matters for the thesis.** The research question moves from *"can we
save and restore a context?"* (engineering) to *"can we automatically infer
which artefacts are relevant to a task from how the user interacts with them,
well enough to reduce the manual effort and resumption cost of task switching?"*
(empirical). Everything below serves that question.

The rename TaskSnap → ContextShifter landed with the restoration engine and the
"never-close" machinery in commit `debe39b`.

---

## 2. The core contribution: a relevance scoring model

The heart of the thesis is the move from *presence* to a *quantitative relevance
estimate*. ContextShifter scores every artefact touched during a task with a
**weighted-linear model** (commit `913465f`):

```
score(a) = w1 · norm_duration(a)
         + w2 · log(1 + access_count(a))
         + w3 · e^(−λ · active_minutes_since_last_access(a))
         + w4 · interaction_share(a)
```

implemented in [`ArtifactScorer.ts`](../src/main/ArtifactScorer.ts), with all
weights and constants in
[`StaticSettings.ts`](../src/main/StaticSettings.ts). Each term encodes a
hypothesis about what signals relevance:

| Term | Signal | Rationale (thesis) |
| --- | --- | --- |
| **Duration** (normalised foreground time) | Sustained attention | The longer you actively work *in* an artefact, the more central it is to the task. Normalised by total active time so long tasks don't dominate. |
| **Frequency** (`log(1+access_count)`) | Repeated return | Coming back to an artefact again and again is a strong relevance signal (cf. interaction-history / degree-of-interest models). `log` dampens runaway counts so a single heavily-revisited file can't swamp the score. |
| **Recency** (`e^(−λ·Δ)`) | Forgetting curve | Artefacts used *recently* are more likely still part of the task's working set; older ones decay. Models the natural "what was I just doing" intuition. |
| **Interaction share** | Active vs. passive use | Distinguishes *working in* an artefact (clicks/keystrokes) from merely *looking at* it. Captured but weighted `0` for now (see §3.4). |

Scores feed `selectAboveThreshold`, which auto-selects everything scoring at
least `SCORE_SELECT_THRESHOLD · max` (default `0.5 · max`). Auto-selection is a
**suggestion**, not a decision — the user always confirms in the picker. This
human-in-the-loop design is deliberate: it both protects against model error and
*produces the ground truth* used to evaluate the model (see §5).

**Why a simple, transparent, linear model?** For a thesis the model must be
*interpretable and tunable*. A weighted-linear form lets each signal's
contribution be reasoned about, lets weights be swept against collected ground
truth, and keeps the evaluation honest. (The predecessor's multiplicative
Frequency–Distance–Antiquity scorer, `FDACalculator`, is retained in-tree as a
**legacy** comparison baseline but no longer drives the flow.)

---

## 3. Making the signals trustworthy — refinements to tracking

Raw OS signals are noisy; a relevance model built on noisy inputs is not
defensible in a study. A sequence of refinements makes each signal reflect
*deliberate* use. Each is a small change with an outsized effect on construct
validity.

### 3.1 Frequency gate — ignore fly-by focus (`d8638a5`)

Alt-Tabbing through windows briefly focuses many artefacts. Counting those as
"accesses" would inflate frequency for things you never used. **Fix:** a focus
visit only counts as an *access* once it has lasted ≥ `MIN_QUALIFYING_ACCESS_MS`
(5 s). This makes `access_count` a count of *deliberate* visits.

### 3.2 Idle-aware duration — don't reward walking away (`462dc82`, `b068e29`)

If duration accrued for as long as an artefact was focused, leaving your machine
with an editor in front would make that editor look maximally relevant. **Fix:**
duration only accrues up to *(last activity + `DURATION_IDLE_TIMEOUT_MS`)*
(3 min). Mouse movement and scrolling — not just clicks/keystrokes — count as
activity that keeps the clock alive (`b068e29`), so reading a long document
still counts while a truly idle machine does not.

### 3.3 Recency gate — a glance is not a use (`14aa577`)

A momentary accidental focus should not grant an artefact a full, fresh recency
score. **Fix:** a visit only refreshes last-access if it lasted
≥ `MIN_RECENCY_ACCESS_MS` (3 s) **or** contained an interaction.

### 3.4 Capturing interactions (`176ee8a`)

A global input hook ([`InteractionTracker`](../src/main/trackers/InteractionTracker.ts),
`uiohook-napi`) counts clicks + keystrokes per focused artefact (counts only —
never key *content*; needs macOS Input Monitoring permission, documented in
`12e0fe7`). This yields the `interaction_share` signal. It is currently weighted
`0` — **recorded but not yet influencing relevance** — so the study can analyse
whether active manipulation improves the model before committing to it. This is
a methodological choice: collect the signal first, decide its weight from data.

### 3.5 Active-time recency — interruptions and multi-session tasks (`ca9c05a`)

**The subtlety that most affects real use.** Recency originally decayed over
*wall-clock* time between an artefact's last use and the stop moment. That means
idle stretches *and* the gap between two work sessions on the same task would age
an artefact's relevance, even though no work happened. Real developer work is
full of interruptions and spans days — so wall-clock recency systematically
under-scores artefacts in any task that isn't done in one sitting.

**Fix:** recency now decays over an **active-time clock** that only advances
while the task is actively being worked (the same idle cap as duration) and is
**cumulative across sessions**. Idle time and between-session gaps contribute
*zero* to an artefact's "age". Verified numerically: ~7 min of within-session
idle and a 3-day between-session gap each added ≈ 0 to recency age. This makes
the model robust to exactly the conditions the thesis cares about — fragmented,
multi-session knowledge work.

> Frequency is already naturally frozen during idle (no qualifying visit closes),
> and duration is idle-capped; the active-time recency change closes the last gap
> so *all three* primary signals ignore dead time consistently.

---

## 4. Human-in-the-loop curation

Automatic inference will sometimes be wrong, and continuous tracking faithfully
records mistakes (e.g. forgetting to stop a task). Two curation mechanisms give
the user correction power — and double as instruments for clean data.

### 4.1 The artefact picker (`CommitTaskDialog`)

On stop/switch the user sees every tracked artefact, ranked by score, with the
auto-selected ones pre-checked and a per-artefact **score badge**. They confirm,
add, or remove items. The "Artefact Selection" setting (`492d2fa`) can skip the
picker for users who want full automation. Robustness fixes this session:
clicking outside no longer dismisses the dialog, and discarding now requires
confirmation (`e7f7639`).

### 4.2 Timeline trimming — curating *time*, not just artefacts (`de79bff`, `9c3e7a6`)

If you forget to stop a task and then work on something unrelated for 15 minutes,
that stray activity contaminates the task's scores. Discarding the whole session
is too blunt. **Solution:** an event-sourced timeline. Every focus / interaction
/ activity is recorded with a timestamp ([`SessionTimeline`](../src/main/scoring/SessionTimeline.ts));
the stop dialog shows a **video-editor-style trim bar** with bracket handles. Drag
an end inward and the session is **re-scored over the kept window only**, as if
the trimmed time never happened.

To make this exact and consistent, the duration/frequency/recency logic was
extracted into a single [`StatsAccumulator`](../src/main/scoring/StatsAccumulator.ts)
used by both the live session and any replay, so a trimmed re-score produces
*identical* numbers to a real shorter session. The trim bar's backdrop also
visualises the session: **vertical markers** where each artefact was first used
(tinted by the dominant colour of its icon) and **greyed bands** over idle
stretches where scoring was frozen.

A subtle correctness bug was fixed here (`9c3e7a6`): because the full session is
persisted up front (so nothing is lost), trimming had to *delete* the usage rows
for artefacts that fall entirely outside the kept window — otherwise their
un-curated scores survived in storage and in the exported study data.

**Why this matters for the thesis.** Trimming lets a participant produce a clean
ground-truth observation by removing accidental contamination, and it is itself a
study-able interaction: how often, and how much, do users curate the captured
window?

---

## 5. Evaluation instrument — collecting ground truth

The thesis needs to measure *how good the automatic relevance model is*. The
mechanism (`d69c17d`) is to record, for every ended task, **both** what the model
chose **and** what the participant kept:

- [`StudyDataCollector`](../src/main/StudyDataCollector.ts) writes one
  `StudyDataRecord` per ended task: every scored artefact (duration, access
  count, interaction count + share, recency, score) **plus a `selected` flag**
  marking the participant's manual choice.
- The model's auto-selection vs. the participant's kept set is exactly a
  **precision/recall** comparison — the empirical core of evaluating the scorer.
- **Editable weights with live re-scoring** (`75c3bca`): the researcher can sweep
  `w1..w4`/`λ` and re-score all stored tasks, so the model can be *tuned against
  the collected ground truth* rather than guessed. Each record also stores the
  weights in effect when it was made (`f56dbfe`), so every data point is
  self-describing.
- **Hygiene for valid data:** never-close apps/tabs are excluded from both
  scoring decisions and the study export (`9f7ba53`, `03fef08`) because they
  persist across all tasks and aren't part of any task's relevance judgement; an
  **Anonymize** toggle (`89e27e5`) strips names/paths/URLs to stable hashes for
  ethics/privacy; **Clear Data Collection** (`f56dbfe`) resets between pilot runs;
  session start/stop times are logged (`75c3bca`) so durations are reconstructable.

This is the part that turns a tool into a *study*: the app generates the dataset
that answers the research question.

---

## 6. Reducing switch cost — restoration and the physical dial

The payoff of knowing a task's relevant artefacts is **cheap resumption**.

- **Task restoration** ([`TaskRestorer`](../src/main/TaskRestorer.ts), `debe39b`,
  hardened in `cb48c34`/`7852711`): switching to a task reopens its saved
  artefacts (apps, IDE project folder + files, browser tabs, Finder folders) and
  closes everything else, except user-designated **never-close** items. Closing
  the *rest* is what actually clears the screen for the new task — addressing the
  resumption-lag problem directly. Reliability work: enumerate running apps via
  System Events instead of relying on the Accessibility permission, guard every
  `osascript` with a timeout so a permission prompt can't hang a switch, and
  order extension-driven closes before permission-gated ones.
- **The TimeBuzzer dial** (`783dfb9`, `cb48c34`,
  [`TimeBuzzerManager`](../src/main/HID/TimeBuzzerManager.ts)): a physical USB
  dial drives the switcher (rotate to cycle, dwell to select, press to
  start/stop) and **lights blue while a task is active**. The thesis rationale is
  friction: a tangible, always-available control lowers the cost of *initiating*
  a switch, attacking the same "users won't spend the effort" problem that sank
  manual snapshots. Hot-plug reconnect (`cb48c34`) makes it survive being plugged
  in after launch.
- **VS Code "project folder" as a first-class artefact** (`cb48c34`): the open
  workspace is selectable and restored, recognising that for developers the
  *project*, not just individual files, is the unit of context.

---

## 7. Supporting and infrastructure changes

These don't change the research model but were necessary to run a study and ship
the tool.

- **UI redesign** (`bfbf20a`, `ada3b19`): clean-slate task list, per-task view,
  one level of subtasks, a frameless always-on-top **switcher overlay** visible
  across all macOS Spaces, and a settings drawer.
- **Companion extensions vendored + repointed** (`d598ad6`, `cd8216c`): the
  browser and VS Code extensions stream live state over local WebSockets and
  accept open/close commands; documentation and the study instructions point at
  the published ContextShifter repositories.
- **WebSocket ports moved to a distinct pair** (`9f9af26`): browser `8084→8473`,
  VS Code `8086→8475`, to reduce the chance of colliding with other local
  software. The app trackers and both extension clients were updated together and
  released (browser **v4.2.2**, VS Code **v0.2.4**).
- **Packaging for distribution to participants** (`b102c96`, `f60307e`,
  `3821983`, `1e55451`, `be226ce`, `f629ef1`): target macOS **arm64**, a valid
  ad-hoc signature + documented install/permission steps, the non-functional
  auto-updater removed, and versioned releases.
- **Branding** (`021104c`): the new ContextShifter "dial" app icon, and a
  monochrome **template tray icon** (`0a25399`, `1487132`) — a rounded square
  with the dial knocked out — so it matches the macOS menu bar and adapts to
  light/dark.
- **Reliability** (`5915703`): fixed an active-win poll pile-up that could
  silently kill window tracking — important because lost tracking would silently
  corrupt the study data.
- **Documentation** (`93ebdd2`): `architecture.md` rewritten for the active-task
  model (the companion to this document).

---

## 8. Chronological changelog (ContextShifter era)

Grouped by theme; commit hashes in parentheses for traceability.

**Conceptual shift & restoration**
- Active-task tracking replaces snapshot-on-create; deferred commit (`1b6b979`)
- TaskRestorer, never-close apps/tabs, task actions, **rename to ContextShifter** (`debe39b`)
- Reliable closing, VS Code project folder, buzzer/widget fixes (`cb48c34`); close unrelated VS Code windows (`7852711`)

**Scoring model**
- Weighted artefact scoring + play/pause activation (`913465f`)
- Capture interactions (clicks + keystrokes) (`176ee8a`)
- Frequency gate ≥ 5 s (`d8638a5`); idle-capped duration (`462dc82`); move/scroll keep duration alive (`b068e29`); recency gate ≥ 3 s (`14aa577`)
- Editable weights + re-scoring; log start/stop times (`75c3bca`)
- **Active-time recency** so idle / between-session gaps don't age recency (`ca9c05a`)

**Curation**
- Timeline trim: curate the time window, re-score the kept span (`de79bff`)
- Keep commit dialog open on outside click; confirm before discard (`e7f7639`)
- Fix trimmed scores leaking into storage; timeline markers + idle bands (`9c3e7a6`)
- Artefact Selection toggle to skip the picker (`492d2fa`)

**Study / evaluation**
- Collect per-task scores + manual selection + export (`d69c17d`)
- Exclude never-close from study data (`9f7ba53`); include them as a separate export section (`03fef08`)
- Anonymize Data toggle (`89e27e5`)
- Save weights with each record; Clear Data Collection (`f56dbfe`)

**Hardware / UX / study ops**
- TimeBuzzer integration + UI changes (`783dfb9`); LED blue while active, press stops (`38e2715`, `02494ec`)
- Switcher widget across Spaces; red stop slot; dwell-select (`ada3b19`, `86b42b0`)
- Tray menu rework, study instructions, settings cleanup (`91e6f4e`); instructions polish (`51ef12c`, `cb84fb5`)

**Packaging / branding / infra**
- Versioned releases & publish config (`b102c96`, `f60307e`, `3821983`, `98806fe`)
- arm64 build + ad-hoc signature + install docs (`1e55451`, `be226ce`); remove auto-updater (`f629ef1`)
- New dial app icon (`021104c`); monochrome template tray icon + sizing (`0a25399`, `1487132`)
- Vendor extensions in-repo, repoint README/instructions (`d598ad6`, `cd8216c`, `59ae3df`)
- Move WebSocket ports to a distinct pair (`9f9af26`)
- Fix active-win poll pile-up (`5915703`)
- Rewrite architecture.md (`93ebdd2`)

---

## 9. Open items and future work

- **Decide the interaction weight (`w4`).** Interactions are collected but
  weighted `0`. The collected ground truth should be used to test whether adding
  active-manipulation share improves agreement with human selection.
- **Tune `w1..w3` and `λ` against the study data.** The editable-weights +
  re-scoring path exists precisely for this; the thesis evaluation should report
  the swept results.
- **Quantify curation behaviour.** How often do participants override the
  auto-selection or trim the timeline, and by how much? This is a measure of
  model trust.
- **Grace-window choice for recency.** Recency currently treats the 3-min idle
  grace window as active time, consistent with duration. Whether recency should
  instead decay from the last *real* activity is a small, defensible variant to
  consider.

---

*This document summarises the engineering record (git history + `architecture.md`)
in research terms. Commit hashes are stable references into the repository for
anyone reproducing or extending the work. Literature connections above are
framed as design rationale; specific citations should be added in the thesis
text.*
