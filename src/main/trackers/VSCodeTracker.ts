/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Roy Rutishauser <royadrian.rutishauser@uzh.ch>, Remy Egloff <remy.egloff@uzh.ch>, April 2023
 */

import { WebSocketServer, WebSocket } from 'ws';
import { info, debug, error } from 'electron-log';
import {
  ActiveFileMessage,
  OpenVSCodeFile,
  VSCodeSnapshot,
  WindowUnfocusMessage,
} from 'types/VSCodeSnapshot';
import IDEFileEvent from '../entity/IDEFileEvent';
import ActiveArtifact from './ActiveArtifact';
import { ActiveFile } from '../../types/ActiveFile';
import { hashString } from '../helpers/hashString';

export default class VSCodeTracker {
  private static _instance: VSCodeTracker;
  private _port = 8086;
  private _server: WebSocketServer;
  private _lastUsedSocket: WebSocket | undefined;
  // Per-window socket -> its workspace folder path, so we can address a
  // specific VS Code window (e.g. to close the ones not part of a task).
  private _socketWorkspaces: Map<WebSocket, string> = new Map();
  private _connectionListeners: Array<() => void> = [];
  private _openFiles: OpenVSCodeFile[] = [];
  private _pendingSnapshotResolvers: Array<(snap: VSCodeSnapshot | null) => void> = [];

  private constructor() {
    this._server = new WebSocketServer({ port: this._port });
    this.initEventListeners();
    info(`[VSCodeTracker] listening on port ${this._port}`);
  }

  public static getInstance() {
    return this._instance || (this._instance = new this());
  }

  public subscribeToConnection(fn: () => void) {
    this._connectionListeners.push(fn);
  }

  private initEventListeners(): void {
    const self = this;

    this._server.on('connection', function (socket) {
      socket.on('open', function () {
        self._lastUsedSocket = socket;
        debug('[VSCodeTracker] Socket opened');
      });

      socket.on('close', function () {
        self._openFiles = [];
        self._socketWorkspaces.delete(socket);
        debug('[VSCodeTracker] Socket closed');
      });

      socket.on('error', () => {
        self._lastUsedSocket = socket;
        debug('[VSCodeTracker] Socket error', error);
      });

      socket.on('message', (msg: string) => {
        self._lastUsedSocket = socket;
        self.notifyConnectionListeners();
        const obj = JSON.parse(msg) as {
          endpoint: string;
          data: unknown;
        };
        debug('[VSCodeTracker] Received: %s', obj);

        if (obj.endpoint === 'ws-connected') {
          // Each window announces its workspace folder on connect.
          const ws = (obj.data as { workspacePath?: string })?.workspacePath;
          if (ws) self._socketWorkspaces.set(socket, ws);
        } else if (obj.endpoint === 'get-vscode-snapshot') {
          const vscodeSnapshot = obj.data as VSCodeSnapshot;
          if (vscodeSnapshot?.workspacePath) {
            self._socketWorkspaces.set(socket, vscodeSnapshot.workspacePath);
          }
          self.handleVSCodeSnapshotEvent(vscodeSnapshot);
        } else if (obj.endpoint === 'active-file') {
          const activeFileMessage = obj.data as ActiveFileMessage;
          self.handleActiveFileEvent(activeFileMessage);
        } else if (obj.endpoint === 'file-save') {
          const filePath = obj.data as string;
          self.handleFileSaveEvent(filePath);
        } else if (obj.endpoint === 'window-unfocus') {
          const windowUnfocusMessage = obj.data as WindowUnfocusMessage;
          self.handleWindowUnfocusEvent(windowUnfocusMessage);
        }
      });
    });
  }

  /**
   * Request the connected VS Code extension's current snapshot (open files,
   * workspace, branch, last commit). Resolves with the payload, or `null`
   * if no extension is connected or the request times out.
   */
  public requestVSCodeSnapshot(
    timeoutMs = 1500
  ): Promise<VSCodeSnapshot | null> {
    if (
      !this._lastUsedSocket ||
      this._lastUsedSocket.readyState !== WebSocket.OPEN
    ) {
      return Promise.resolve(null);
    }
    return new Promise<VSCodeSnapshot | null>((resolve) => {
      const resolver = (snap: VSCodeSnapshot | null) => {
        const idx = this._pendingSnapshotResolvers.indexOf(resolver);
        if (idx >= 0) this._pendingSnapshotResolvers.splice(idx, 1);
        resolve(snap);
      };
      this._pendingSnapshotResolvers.push(resolver);
      try {
        this._lastUsedSocket!.send(
          JSON.stringify({ endpoint: 'get-vscode-snapshot' })
        );
      } catch (err) {
        info(`[VSCodeTracker] requestVSCodeSnapshot send failed: ${String(err)}`);
        resolver(null);
        return;
      }
      setTimeout(() => resolver(null), timeoutMs);
    });
  }

  public sendOpenFilesRequest(files: string[]) {
    if (this._lastUsedSocket) {
      return this._lastUsedSocket.send(
        JSON.stringify({ data: files, endpoint: 'open-files' })
      );
    }
  }

  public async sendFileClosingRequest(filePaths: string[]) {
    if (this._lastUsedSocket) {
      return this._lastUsedSocket.send(
        JSON.stringify({ data: filePaths, endpoint: 'close-files' })
      );
    }
  }

  /**
   * Ask every connected VS Code window whose workspace folder is NOT in
   * keepWorkspacePaths to close itself. Used when restoring a task so windows
   * showing an unrelated project don't linger. Windows whose workspace we don't
   * know are left untouched. Returns how many close requests were sent.
   */
  public closeWindowsExcept(keepWorkspacePaths: string[]): number {
    const keep = new Set(keepWorkspacePaths.filter(Boolean));
    let closed = 0;
    for (const [socket, ws] of this._socketWorkspaces) {
      if (!ws || keep.has(ws)) continue;
      if (socket.readyState !== WebSocket.OPEN) continue;
      try {
        socket.send(JSON.stringify({ endpoint: 'close-window' }));
        closed += 1;
        info(`[VSCodeTracker] Asked VS Code window to close (workspace=${ws})`);
      } catch (err) {
        info(`[VSCodeTracker] close-window send failed: ${String(err)}`);
      }
    }
    return closed;
  }

  private handleVSCodeSnapshotEvent(data: VSCodeSnapshot) {
    // Fan out the payload to whoever is waiting on requestVSCodeSnapshot().
    const resolvers = this._pendingSnapshotResolvers.splice(0);
    for (const r of resolvers) r(data);
    info(
      `[VSCodeTracker] received vscode snapshot (${data.openFiles?.length ?? 0} files, workspace=${data.workspaceName ?? '?'})`
    );
  }

  public handleActiveFileEvent(activeFileMessage: ActiveFileMessage): void {
    const filePath = activeFileMessage.activeFile;
    this._openFiles = activeFileMessage.openFiles;

    if (filePath) {
      const dbEntry = new IDEFileEvent();
      dbEntry.path = filePath;
      dbEntry.ts = new Date().toISOString();
      dbEntry.type = 'active-file';
      dbEntry.save();

      const file: ActiveFile = {
        path: filePath,
        ts: new Date(),
      };
      ActiveArtifact.setCurrentFile(file);
    }
  }

  public handleFileSaveEvent(filePath: string): void {
    const dbEntry = new IDEFileEvent();
    dbEntry.path = filePath;
    dbEntry.ts = new Date().toISOString();
    dbEntry.type = 'file-save';
    dbEntry.save();
  }

  public handleWindowUnfocusEvent(
    windowUnfocusMessage: WindowUnfocusMessage
  ): void {
    this._openFiles = windowUnfocusMessage.openFiles;
    ActiveArtifact.storeCurrentFile();
  }

  public isSocketOpen(): boolean {
    return this._lastUsedSocket?.readyState === WebSocket.OPEN;
  }

  private notifyConnectionListeners() {
    for (const fn of this._connectionListeners) {
      fn();
    }
    this._connectionListeners = [];
  }

  public getOpenFilesForAnalysis(): string[] {
    const allFiles: string[] = [];
    this._openFiles.forEach((file) => {
      const path = file.path;
      const hashedPath = hashString(path);
      allFiles.push(hashedPath);
    });
    return allFiles;
  }
}
