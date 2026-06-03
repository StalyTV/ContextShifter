import { useEffect, useState } from 'react';
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

function Row({
  items,
  index,
  active,
  emptyText,
}: {
  items: Item[];
  index: number;
  active: boolean;
  emptyText?: string;
}) {
  const len = items.length;
  if (len === 0) {
    return (
      <div className={`${styles.row} ${active ? styles.rowActive : styles.rowDim}`}>
        <div className={styles.side} />
        <div className={`${styles.current} ${styles.empty}`}>
          {emptyText ?? ''}
        </div>
        <div className={styles.side} />
      </div>
    );
  }
  const prev = items[(index - 1 + len) % len];
  const current = items[index];
  const next = items[(index + 1) % len];
  return (
    <div className={`${styles.row} ${active ? styles.rowActive : styles.rowDim}`}>
      <div className={styles.side}>{len > 1 ? prev?.name : ''}</div>
      <div className={styles.current}>{current?.name ?? ''}</div>
      <div className={styles.side}>{len > 1 ? next?.name : ''}</div>
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

  const { parents, parentIndex, children, childIndex, mode } = state;
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
