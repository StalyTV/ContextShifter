/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Roy Rutishauser <royadrian.rutishauser@uzh.ch>, Remy Egloff <remy.egloff@uzh.ch>, April 2023
 */

import WebSocket from 'ws';
import { info, debug, error } from 'electron-log';

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

      socket.on('message', (data) => {
        self._lastUsedSocket = socket;
        debug('received: %s', data);
      });
    });
  }

  public sendGetAllFilesRequest() {
    if (this._lastUsedSocket) {
      return this._lastUsedSocket.send('get-open-files');
    }
  }
}
