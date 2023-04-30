/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Roy Rutishauser <royadrian.rutishauser@uzh.ch>, Remy Egloff <remy.egloff@uzh.ch>, April 2023
 */

import WebSocket from 'ws';
import { info, debug, error } from 'electron-log';
import { VSCodeSnapshot } from 'types/VSCodeSnapshot';
import Snapshot from '../entity/Snapshot';
import IDEFile from '../entity/IDEFile';
import { getFileNameFromPath } from '../helpers/getFileNameFromPath';

export default class VSCodeTracker {
  private _port = 8084;
  private _server: WebSocket.Server;
  private _lastUsedSocket: WebSocket | undefined;
  private _connectionListeners: Array<() => void> = [];

  constructor() {
    info(`[VSCodeTracker] listening on port ${this._port}`);
    this._server = new WebSocket.Server({ port: this._port });
    this.initEventListeners();
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
          self.handleVSCodeSnapshot(vscodeSnapshot);
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

  private async handleVSCodeSnapshot(data: VSCodeSnapshot) {
    const latestSnapshot = await Snapshot.getLatestSnapshot();
    if (!latestSnapshot) return;

    const ide = latestSnapshot.ides[0]; // TODO: Improve this

    // might be the case if IDE is hidden
    if (!ide) return;

    if (data.branch) {
      ide.branch = data.branch;
    }
    if (data.lastCommitMessage) {
      ide.lastCommitMessage = data.lastCommitMessage;
    }
    if (data.workspaceName) {
      ide.workspaceName = data.workspaceName;
    }
    if (data.workspacePath) {
      ide.workspacePath = data.workspacePath;
    }
    ide.save();

    for await (const openFile of data.openFiles) {
      const ideFile = new IDEFile();
      ideFile.name = openFile.name;
      ideFile.path = openFile.path;
      ideFile.isActive = openFile.isActive;
      ideFile.ide = ide;
      ideFile.save();
    }
    info(
      `[VSCodeTracker] received ${data.openFiles.length} files and attached them to snapshot with id ${latestSnapshot.id}`
    );

    // add last edit to summary
    const editedFunction = data.lastEditedFunction;
    if (editedFunction) {
      latestSnapshot.summary = `Just edited ${
        editedFunction.name
      } in ${getFileNameFromPath(editedFunction.filePath)}`;
    }

    // convert TODOs to intent string
    let intent: string = '';
    data.toDos.forEach((toDo) => {
      const fileName = getFileNameFromPath(toDo.filePath);
      intent += `[${fileName}] ${toDo.text}\n\n`;
    });
    latestSnapshot.intent = intent;

    latestSnapshot.save();
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
