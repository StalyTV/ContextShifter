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
};

contextBridge.exposeInMainWorld('electron', electronHandler);

export type ElectronHandler = typeof electronHandler;
