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

  constructor() {
    info(`[VSCodeTracker] listening on port ${this._port}`);
    this._server = new WebSocket.Server({ port: this._port });
    this.initEventListeners();
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
        debug('[VSCodeTracker] Received: %s', msg);
        const obj = JSON.parse(msg) as {
          endpoint: string;
          data: unknown;
        };

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

    if (data.branch) {
      ide.branch = data.branch;
    }
    if (data.lastCommitMessage) {
      ide.lastCommitMessage = data.lastCommitMessage;
    }
    ide.save();

    // convert TODOs to intent string
    let intent: string = '';
    data.toDos.forEach((toDo) => {
      const fileName = getFileNameFromPath(toDo.filePath);
      intent += `[${fileName}] ${toDo.text}\n\n`;
    });
    latestSnapshot.intent = intent;
    latestSnapshot.save();
  }
}
