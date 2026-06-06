// Disable no-unused-vars, broken for spread args
/* eslint no-unused-vars: off */
import { IpcRendererEvent, contextBridge } from 'electron';
import typedIpcRenderer from './ipc/typedIpcRenderer';

const electronHandler = {
  ipcRenderer: typedIpcRenderer, //TODO [regloff] this is insecure and should be avoided
  onTaskSwitcherState: (
    callback: (
      event: IpcRendererEvent,
      state: {
        parents: { id: number | null; name: string }[];
        parentIndex: number;
        children: { id: number | null; name: string }[];
        childIndex: number;
        mode: 'parent' | 'child';
        activeTaskId: number | null;
      }
    ) => void
  ) => typedIpcRenderer.on('task-switcher-state', callback),
  removeOnTaskSwitcherState: () =>
    typedIpcRenderer.removeAllListeners('task-switcher-state'),
  onSnapshotsChanged: (callback: (event: IpcRendererEvent) => void) =>
    typedIpcRenderer.on('snapshots-changed', callback),
  removeOnSnapshotsChanged: () =>
    typedIpcRenderer.removeAllListeners('snapshots-changed'),
  onOpenNewTaskDialog: (
    callback: (event: IpcRendererEvent, parentId: number | null) => void
  ) => typedIpcRenderer.on('open-new-task-dialog', callback),
  removeOnOpenNewTaskDialog: () =>
    typedIpcRenderer.removeAllListeners('open-new-task-dialog'),
};

contextBridge.exposeInMainWorld('electron', electronHandler);

export type ElectronHandler = typeof electronHandler;
