import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import styles from './TaskSwitcher.module.scss';

type Item = { id: number | null; name: string };
type State = {
  parents: Item[];
  parentIndex: number;
  children: Item[];
  childIndex: number;
  mode: 'parent' | 'child';
  activeTaskId: number | null;
};

const SLOT_WIDTH = 180; // px — fixed slot width so the track translates by exact multiples
const WINDOW_HALF = 2; // render 2 items either side of the centered one
const MAX_ANIMATED_STEPS = 2; // for bigger jumps, snap rather than animate
const TRANSITION = 'transform 280ms cubic-bezier(0.22, 1, 0.36, 1)';

function modIndex(i: number, len: number) {
  return ((i % len) + len) % len;
}

function Row({
  items,
  index,
  active,
  emptyText,
  activeTaskId,
}: {
  items: Item[];
  index: number;
  active: boolean;
  emptyText?: string;
  activeTaskId?: number | null;
}) {
  const len = items.length;

  // `base` is the item index currently centered when translate === 0.
  // After a transition completes we snap `base` to `index` and reset translate
  // to 0 with the transition disabled so the next change can animate again.
  const [base, setBase] = useState(index);
  const [translate, setTranslate] = useState(0);
  const [animating, setAnimating] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (len === 0) {
      setBase(index);
      setTranslate(0);
      setAnimating(false);
      return;
    }
    if (index === base) return;

    const fwd = modIndex(index - base, len);
    const bwd = modIndex(base - index, len);
    const forward = fwd <= bwd;
    const steps = forward ? fwd : bwd;

    if (steps === 0) return;

    if (steps > MAX_ANIMATED_STEPS) {
      // Big jump (or list shrunk) — snap without animation.
      setAnimating(false);
      setBase(index);
      setTranslate(0);
      return;
    }

    setAnimating(true);
    setTranslate(forward ? -steps * SLOT_WIDTH : steps * SLOT_WIDTH);
  }, [index, base, len]);

  const handleTransitionEnd = () => {
    if (!animating) return;
    setAnimating(false);
    setBase(index);
    setTranslate(0);
  };

  if (len === 0) {
    return (
      <div className={`${styles.row} ${active ? styles.rowActive : styles.rowDim}`}>
        <div className={styles.viewport}>
          <div className={`${styles.slot} ${styles.empty}`}>{emptyText ?? ''}</div>
        </div>
      </div>
    );
  }

  const offsets: number[] = [];
  for (let o = -WINDOW_HALF; o <= WINDOW_HALF; o += 1) offsets.push(o);

  return (
    <div className={`${styles.row} ${active ? styles.rowActive : styles.rowDim}`}>
      <div className={styles.viewport}>
        {active && <div className={styles.indicator} aria-hidden />}
        <div
          ref={trackRef}
          className={styles.track}
          style={{
            transform: `translate3d(${translate}px, 0, 0)`,
            transition: animating ? TRANSITION : 'none',
          }}
          onTransitionEnd={handleTransitionEnd}
        >
          {offsets.map((off) => {
            const itemIdx = modIndex(base + off, len);
            const item = items[itemIdx];
            const distance = Math.abs(off);
            const slotClass =
              distance === 0
                ? styles.slotCenter
                : distance === 1
                ? styles.slotNear
                : styles.slotFar;
            const isNewTask = item.id === -1 || item.id === -2;
            // The "-1" slot is "Stop current task" when a task is active; flag
            // it so it can be shown in red.
            const isStopTask =
              item.id === -1 && activeTaskId !== null && activeTaskId !== undefined;
            return (
              <div
                key={`${itemIdx}-${off}`}
                className={`${styles.slot} ${slotClass} ${
                  isNewTask ? styles.slotNew : ''
                } ${isStopTask ? styles.slotStop : ''}`}
                style={{ width: SLOT_WIDTH }}
              >
                <span className={styles.slotLabel}>{item.name}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function TaskSwitcher() {
  const [state, setState] = useState<State>({
    parents: [{ id: null, name: 'None' }],
    parentIndex: 0,
    children: [],
    childIndex: 0,
    mode: 'parent',
    activeTaskId: null,
  });

  useEffect(() => {
    const handler = (_e: any, s: State) => setState(s);
    (window as any).electron.onTaskSwitcherState(handler);
    return () => (window as any).electron.removeOnTaskSwitcherState();
  }, []);

  const { parents, parentIndex, children, childIndex, mode, activeTaskId } =
    state;
  const hint =
    mode === 'parent'
      ? children.length > 0
        ? 'press to open subtasks'
        : 'turn to switch'
      : 'turn to pick subtask · double-press to back';

  return (
    <div className={styles.container}>
      <Row
        items={parents}
        index={parentIndex}
        active={mode === 'parent'}
        activeTaskId={activeTaskId}
      />
      <Row
        items={children}
        index={childIndex}
        active={mode === 'child'}
        emptyText="no subtasks"
      />
      <div className={styles.hint}>{hint}</div>
    </div>
  );
}
