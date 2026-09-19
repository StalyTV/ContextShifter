"""Load ContextShifter study exports and score their artifacts.

One export is one participant: a JSON object with a "records" list, one entry per
ended task. Each artifact in a record carries its behavioural score, its semantic
similarity, and a flag saying whether the participant kept it.
"""
import json, os, glob

PHASE1, PHASE2 = "phase1", "phase2"


def load(export_dir):
    """Return {participant_id: [record, ...]}, keyed by file name stem."""
    out = {}
    for path in sorted(glob.glob(os.path.join(export_dir, "*.json"))):
        pid = os.path.splitext(os.path.basename(path))[0]
        with open(path, encoding="utf-8") as fh:
            out[pid] = json.load(fh)["records"]
    if not out:
        raise SystemExit(f"no .json exports found in {export_dir}")
    return out


def usable(records, phase):
    """Records in `phase` that have at least one kept artifact.

    Precision and recall are undefined against an empty reference set, so a record
    in which the participant kept nothing is excluded from the accuracy analysis.
    """
    return [r for r in records
            if r.get("studyPhase") == phase
            and any(a["selected"] for a in r["artefacts"])]


def score(artifact, alpha):
    """Deployed score with the semantic factor at influence `alpha`.

    alpha = 0 reproduces what participants saw during the deployment.
    """
    return artifact["behaviouralScore"] * (
        (1 - alpha) + alpha * artifact["semanticSimilarity"])


def select(scores, threshold=0.5):
    """selectAboveThreshold: keep artifacts scoring >= threshold * session max."""
    top = max(scores) if scores else 0
    return [s >= threshold * top and top > 0 for s in scores]


def prf(predicted, truth):
    """Precision, recall and F1 for one record. None where undefined."""
    tp = sum(p and t for p, t in zip(predicted, truth))
    fp = sum(p and not t for p, t in zip(predicted, truth))
    fn = sum((not p) and t for p, t in zip(predicted, truth))
    precision = tp / (tp + fp) if tp + fp else None
    recall = tp / (tp + fn) if tp + fn else None
    if precision and recall:
        f1 = 2 * precision * recall / (precision + recall)
    else:
        f1 = 0.0 if precision is not None and recall is not None else None
    return precision, recall, f1


def evaluate(records, alpha=0.0, threshold=0.5):
    """Per-record (precision, recall, F1) for a list of records."""
    rows = []
    for r in records:
        arts = r["artefacts"]
        predicted = select([score(a, alpha) for a in arts], threshold)
        rows.append(prf(predicted, [a["selected"] for a in arts]))
    return rows
