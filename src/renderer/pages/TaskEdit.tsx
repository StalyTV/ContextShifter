import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import styles from './TaskEdit.module.scss';

export default function TaskEdit() {
  const { id } = useParams<{ id: string }>();
  const taskId = id ? parseInt(id, 10) : NaN;
  const [name, setName] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      if (Number.isNaN(taskId)) return;
      const task = await window.electron.ipcRenderer.invoke(
        'get-task-by-id',
        taskId
      );
      if (task) setName(task.name);
      setLoaded(true);
    })();
  }, [taskId]);

  const onSave = async () => {
    if (Number.isNaN(taskId)) return;
    await window.electron.ipcRenderer.invoke(
      'update-task-name',
      taskId,
      name.trim() || 'Untitled Task'
    );
    window.close();
  };

  const onDelete = async () => {
    if (Number.isNaN(taskId)) return;
    await window.electron.ipcRenderer.invoke('delete-task', taskId);
    window.close();
  };

  if (!loaded) return null;

  return (
    <div className={styles.container}>
      <h2>Edit Task</h2>
      <label className={styles.label}>Name</label>
      <input
        className={styles.input}
        value={name}
        autoFocus
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSave();
          if (e.key === 'Escape') window.close();
        }}
      />
      <div className={styles.actions}>
        <button className={styles.delete} onClick={onDelete}>
          Delete
        </button>
        <div className={styles.spacer} />
        <button className={styles.cancel} onClick={() => window.close()}>
          Cancel
        </button>
        <button className={styles.save} onClick={onSave}>
          Save
        </button>
      </div>
    </div>
  );
}
