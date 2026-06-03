import { useEffect, useState } from 'react';
import styles from './TaskSwitcher.module.scss';

type Item = { id: number | null; name: string };
type State = {
  items: Item[];
  selectedIndex: number;
  activeTaskId: number | null;
};

export default function TaskSwitcher() {
  const [state, setState] = useState<State>({
    items: [{ id: null, name: 'None' }],
    selectedIndex: 0,
    activeTaskId: null,
  });

  useEffect(() => {
    const handler = (_e: any, s: State) => setState(s);
    (window as any).electron.onTaskSwitcherState(handler);
    return () => (window as any).electron.removeOnTaskSwitcherState();
  }, []);

  const { items, selectedIndex } = state;
  const len = items.length;
  const prev = items[(selectedIndex - 1 + len) % len];
  const current = items[selectedIndex];
  const next = items[(selectedIndex + 1) % len];

  return (
    <div className={styles.container}>
      <div className={styles.row}>
        <div className={styles.side}>{len > 1 ? prev?.name : ''}</div>
        <div className={styles.current}>{current?.name ?? 'None'}</div>
        <div className={styles.side}>{len > 1 ? next?.name : ''}</div>
      </div>
      <div className={styles.hint}>turn to switch</div>
    </div>
  );
}
