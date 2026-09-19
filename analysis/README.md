# ContextShifter analysis

The scripts that produce the figures in Chapter 6 and Appendix B of the thesis
from the study exports.

## Input

One JSON export per participant in a directory, named after the participant
identifier used in the thesis:

    exports/P1.json
    exports/P2.json
    exports/P3.json
    exports/P4.json

Each file is what `StudyDataCollector` writes: an object with a `records` list,
one entry per ended task, each holding every artifact the task touched with its
`behaviouralScore`, its `semanticSimilarity`, and a `selected` flag recording
whether the participant kept it.

The exports are not published with this code. See Appendix C of the thesis.

## Running

    pip install numpy matplotlib
    python report.py exports          # the tables
    python figure_sweeps.py exports   # Figure 6.1, as sweeps.pdf

`report.py` prints the per-participant and aggregate precision, recall and F1 for
both phases, then sweeps the semantic influence and the selection threshold. Every
number in Tables 6.2, B.1, B.2 and B.3 appears in that output.

## What the code does

`records.py` holds the model as deployed. `score` is Equation 4.1 of the thesis, a
weighted behavioural score multiplied by `(1 - alpha) + alpha * semantic`, and
`select` is `selectAboveThreshold`, which keeps artifacts scoring at least half the
session maximum. The deployed configuration is `alpha = 0`, `threshold = 0.5`;
passing other values re-scores the same stored records under a different
configuration, which is how the two sweeps are produced.

Records in which the participant kept nothing are excluded, because precision and
recall are undefined against an empty reference set. Participant P2's tracking
malfunctioned during the deployment, so every aggregate is reported twice, with and
without them.
