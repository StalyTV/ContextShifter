// Disable no-unused-vars, broken for spread args
/* eslint no-unused-vars: off */
import { contextBridge } from 'electron';
import typedIpcRenderer from './ipc/typedIpcRenderer';

const electronHandler = {
  ipcRenderer: typedIpcRenderer,
};

contextBridge.exposeInMainWorld('electron', electronHandler);

export type ElectronHandler = typeof electronHandler;
