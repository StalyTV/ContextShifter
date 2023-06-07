/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Roy Rutishauser <royadrian.rutishauser@uzh.ch>, Remy Egloff <remy.egloff@uzh.ch>, April 2023
 */

import { WebSocketServer, WebSocket } from 'ws';
import { info, debug, error } from 'electron-log';
import { VSCodeSnapshot } from 'types/VSCodeSnapshot';
import Snapshot from '../entity/Snapshot';
import IDEFile from '../entity/IDEFile';
import { getFileNameFromPath } from '../helpers/getFileNameFromPath';
import StaticSettings from '../StaticSettings';
import IDEFileEvent from '../entity/IDEFileEvent';

export default class VSCodeTracker {
  private _port = 8086;
  private _server: WebSocketServer;
  private _lastUsedSocket: WebSocket | undefined;
  private _connectionListeners: Array<() => void> = [];

  constructor() {
    this._server = new WebSocketServer({ port: this._port });
    this.initEventListeners();
    info(`[VSCodeTracker] listening on port ${this._port}`);
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

        if (obj.endpoint === 'get-vscode-snapshot') {
          const vscodeSnapshot = obj.data as VSCodeSnapshot;
          self.handleVSCodeSnapshotEvent(vscodeSnapshot);
        } else if (obj.endpoint === 'active-file') {
          const filePath = obj.data as string;
          self.handleActiveFileEvent(filePath);
        } else if (obj.endpoint === 'file-save') {
          const filePath = obj.data as string;
          self.handleFileSaveEvent(filePath);
        }
      });
    });
  }

  public sendGetVSCodeSnapshotRequest() {
    if (this._lastUsedSocket) {
      return this._lastUsedSocket.send(
        JSON.stringify({ endpoint: 'get-vscode-snapshot' })
      );
    }
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

  private async handleVSCodeSnapshotEvent(data: VSCodeSnapshot) {
    const latestSnapshot = await Snapshot.getLatestSnapshot();
    if (!latestSnapshot) return;

    const ide = latestSnapshot.ides[0]; // TODO: Improve this

    // might be the case if IDE is hidden
    if (!ide) return;

    if (data.branch) {
      ide.branch = data.branch;
    }
    if (data.lastCommit) {
      ide.lastCommitMessage = data.lastCommit.message;
    }
    if (data.workspaceName) {
      ide.workspaceName = data.workspaceName;
    }
    if (data.workspacePath) {
      ide.workspacePath = data.workspacePath;
    }
    ide.save();

    // for smart pre-selection, look which files were active within the last 10 minutes - TODO: update this condition
    const timeMinus10Min = Date.now() - 10 * 60 * 1000;
    const recentlyActiveFiles = await IDEFileEvent.getRecentlyActiveIDEFiles(
      new Date(timeMinus10Min)
    );

    for await (const openFile of data.openFiles) {
      const wasFileRecentlyActive = recentlyActiveFiles.includes(openFile.path);

      const ideFile = new IDEFile();
      ideFile.name = openFile.name;
      ideFile.path = openFile.path;
      ideFile.isActive = openFile.isActive;
      ideFile.ide = ide;
      ideFile.isSelected = wasFileRecentlyActive;
      ideFile.save();
    }

    // if no tabs are open, deselect IDE by default
    if (data.openFiles.length === 0) {
      ide.isSelected = false;
      ide.save();
    }
    info(
      `[VSCodeTracker] received ${data.openFiles.length} files and attached them to snapshot with id ${latestSnapshot.id}`
    );

    // create snapshot summary
    let summaryString = '';

    const lastEdit = data.lastEdit;
    if (lastEdit) {
      // check if last change was outside considered time window
      const changeTime = new Date(lastEdit.timestamp).getTime();
      if (changeTime > Date.now() - StaticSettings.IDE_TIME_WINDOW) {
        const lineRange = lastEdit.lineRange as any; // vscode.Range somehow does not get serialized as expected
        const startLine = lineRange[0].line + 1; // vscode starts indexing lines at 0
        const endLine = lineRange[1].line + 1;
        const lineInfo =
          startLine === endLine
            ? `${startLine} "${lastEdit.code}"`
            : `${startLine}-${endLine}`;

        const fileName = getFileNameFromPath(lastEdit.filePath);
        const functionAndFileName = lastEdit.functionName
          ? `${lastEdit.functionName} - ${fileName}`
          : fileName;

        summaryString += `Just edited line ${lineInfo} in [${functionAndFileName}]`;
      }
    }

    const lastCommit = data.lastCommit;
    if (lastCommit && lastCommit.commitDate) {
      const commitTime = new Date(lastCommit.commitDate).getTime();
      if (commitTime > Date.now() - StaticSettings.IDE_TIME_WINDOW) {
        summaryString += `\nRecently committed "${lastCommit.message}"`;
      }
    }

    if (data.hasUncommittedChanges) {
      summaryString += '\nUncommitted changes.';
    }

    latestSnapshot.summary = summaryString;

    // convert TODOs to intent string
    let intent: string = '';
    data.toDos.forEach((toDo) => {
      const fileName = getFileNameFromPath(toDo.filePath);
      intent += `[${fileName}] ${toDo.text}\n\n`;
    });
    latestSnapshot.intent = intent;

    latestSnapshot.save();
  }

  public handleActiveFileEvent(filePath: string): void {
    const dbEntry = new IDEFileEvent();
    dbEntry.path = filePath;
    dbEntry.ts = new Date().toISOString();
    dbEntry.type = 'active-file';
    dbEntry.save();
  }

  public handleFileSaveEvent(filePath: string): void {
    const dbEntry = new IDEFileEvent();
    dbEntry.path = filePath;
    dbEntry.ts = new Date().toISOString();
    dbEntry.type = 'file-save';
    dbEntry.save();
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
}
