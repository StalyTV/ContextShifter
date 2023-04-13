/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Roy Rutishauser <royadrian.rutishauser@uzh.ch>, Remy Egloff <remy.egloff@uzh.ch>, April 2023
 */

import WebSocket from 'ws';
import { info, debug, error } from 'electron-log';
import { OpenVSCodeFile } from 'types/OpenVSCodeFile';
import Snapshot from '../entity/Snapshot';
import IDEFile from '../entity/IDEFile';

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
        debug('received: %s', msg);
        const obj = JSON.parse(msg) as {
          endpoint: string;
          data: unknown;
        };

        if (obj.endpoint === 'get-open-files') {
          const openFiles = obj.data as OpenVSCodeFile[];
          self.handleOpenFiles(openFiles);
        }
      });
    });
  }

  public sendGetAllFilesRequest() {
    if (this._lastUsedSocket) {
      return this._lastUsedSocket.send(
        JSON.stringify({ endpoint: 'get-open-files' })
      );
    }
  }

  private async handleOpenFiles(openFiles: OpenVSCodeFile[]) {
    const latestSnapshot = await Snapshot.getLatestSnapshot();
    if (!latestSnapshot) return;

    for await (const openFile of openFiles) {
      const ideFile = new IDEFile();
      ideFile.name = openFile.name;
      ideFile.path = openFile.path;
      ideFile.isActive = openFile.isActive;
      ideFile.ide = latestSnapshot.ides[0]; // TODO: Improve this
      ideFile.save();
    }
    info(
      `[VSCodeTracker] received ${openFiles.length} files and attached them to snapshot with id ${latestSnapshot.id}`
    );
  }
}
