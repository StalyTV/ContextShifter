// Disable no-unused-vars, broken for spread args
/* eslint no-unused-vars: off */
import { IpcRendererEvent, contextBridge } from 'electron';
import typedIpcRenderer from './ipc/typedIpcRenderer';

const electronHandler = {
  ipcRenderer: typedIpcRenderer, //TODO [regloff] this is insecure and should be avoided
  onSnapshotSelected: (
    callback: (event: IpcRendererEvent, id: number) => void
  ) => typedIpcRenderer.on('snapshot-selected', callback),
  removeOnSnapshotSelected: () =>
    typedIpcRenderer.removeAllListeners('snapshot-selected'),
  onSnapshotsUpdated: (callback: (event: IpcRendererEvent) => void) =>
    typedIpcRenderer.on('snapshots-updated', callback),
  removeOnSnapshotsUpdated: () =>
    typedIpcRenderer.removeAllListeners('snapshots-updated'),
  onSnapshotReady: (callback: (event: IpcRendererEvent, id: number) => void) =>
    typedIpcRenderer.on('snapshot-ready', callback),
  removeOnSnapshotReady: () =>
    typedIpcRenderer.removeAllListeners('snapshot-ready'),
  onTaskSwitcherState: (
    callback: (
      event: IpcRendererEvent,
      state: {
        items: { id: number | null; name: string }[];
        selectedIndex: number;
        activeTaskId: number | null;
      }
    ) => void
  ) => typedIpcRenderer.on('task-switcher-state', callback),
  removeOnTaskSwitcherState: () =>
    typedIpcRenderer.removeAllListeners('task-switcher-state'),
};

contextBridge.exposeInMainWorld('electron', electronHandler);

export type ElectronHandler = typeof electronHandler;
