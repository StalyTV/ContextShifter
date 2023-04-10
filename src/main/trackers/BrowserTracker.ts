/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Roy Rutishauser <royadrian.rutishauser@uzh.ch>, Remy Egloff <remy.egloff@uzh.ch>, April 2023
 */

import WebSocket from 'ws';
import { info, debug } from 'electron-log';
import {
  BrowserEvent,
  CloseTabClientRequest,
  OpenTabClientRequest,
  RuntimeInfo,
  ServerEndpoints,
  WebNavigationDetail,
  WebNavigationSequenceUpdate,
} from 'context-browser-extension-types';
import { Tabs } from 'webextension-polyfill';
import BrowserTab from '../entity/BrowserTab';
import Snapshot from '../entity/Snapshot';

export default class BrowserTracker {
  private _port = 8083;
  private _server: WebSocket.Server;
  private _lastUsedSocket: WebSocket | undefined;

  constructor() {
    info(`[BrowserTracker] listening on port ${this._port}`);
    this._server = new WebSocket.Server({ port: this._port });
    this.initEventListeners();
  }

  private initEventListeners() {
    const self = this;

    // initial connection made after a client requested protocol upgrade
    this._server.on('connection', function (socket) {
      let runtimeInfo: RuntimeInfo | undefined;

      // acually establishing the socket
      socket.on('open', function () {
        self._lastUsedSocket = socket;
        debug('[BrowserTracker] Socket opened');
      });

      socket.on('error', function (error) {
        self._lastUsedSocket = undefined;
        debug('[BrowserTracker] Socket error', error);
      });

      socket.on('message', function (msg: string) {
        self._lastUsedSocket = socket;
        const obj = JSON.parse(msg) as {
          endpoint: ServerEndpoints;
          data: unknown;
        };

        if (obj.endpoint === 'event') {
          const data = obj.data as BrowserEvent;
          debug(`[BrowserTracker] "event" msg received of type "${data.type}"`);
          runtimeInfo = data.runtimeInfo as RuntimeInfo;
          self.handleEvent(data, runtimeInfo);
        } else if (obj.endpoint === 'sequence') {
          const data = obj.data as WebNavigationSequenceUpdate;
          self.handleSequence(
            data as WebNavigationSequenceUpdate,
            data.runtimeInfo as RuntimeInfo
          );
        } else if (obj.endpoint === 'navigation') {
          self.handleNavigation(obj.data as WebNavigationDetail);
        } else if (obj.endpoint === 'tabs') {
          self.handleTabs(obj.data as Tabs.Tab[]);
        }
      });

      // When a socket closes, or disconnects, remove it from the array.
      socket.on('close', function () {
        self._lastUsedSocket = undefined;
        debug('[BrowserTracker] Socket closed');
      });
    });
  }

  private handleEvent(data: BrowserEvent, runtimeInfo: RuntimeInfo) {}

  private handleSequence(
    data: WebNavigationSequenceUpdate,
    runtimeInfo: RuntimeInfo
  ) {}

  private handleNavigation(data: WebNavigationDetail) {
    debug(
      `[BrowserTracker] Navigation of tab ${data.tab.url}: ${data.transitionType}`
    );
  }

  private async handleTabs(tabs: Tabs.Tab[]) {
    const latestSnapshot = await Snapshot.getLatestSnapshot();
    if (!latestSnapshot) return;

    for await (const tab of tabs) {
      if (!tab.url) continue;

      const tabEntity = new BrowserTab();
      tabEntity.url = tab.url;
      tabEntity.title = tab.title;
      tabEntity.favIconUrl = tab.favIconUrl;
      tabEntity.index = tab.index;
      tabEntity.isActive = tab.active;
      tabEntity.snapshot = latestSnapshot;
      tabEntity.save();
    }
    info(
      `[BrowserTracker] received ${tabs.length} tabs and attached them to snapshot with id ${latestSnapshot?.id}`
    );
  }

  public sendGetAllTabsRequest() {
    if (this._lastUsedSocket) {
      return this._lastUsedSocket.send(
        JSON.stringify({ endpoint: 'get-all-tabs' })
      );
    }
  }

  public sendTabOpeningRequest(urls: string[], label?: string) {
    const data: OpenTabClientRequest = { urls, label };
    if (this._lastUsedSocket) {
      // only send the event to the last browser the user interacted with
      return this._lastUsedSocket.send(
        JSON.stringify({ endpoint: 'open-tabs', data })
      );
    } else {
      // fallback, let's broadcast to what we have...
      this._server.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ endpoint: 'open-tabs', data }));
        }
      });
    }
  }

  // broadcast to all browsers
  public async sendTabClosingRequest(data: CloseTabClientRequest[]) {
    this._server.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ endpoint: 'close-tabs', data }));
      }
    });
  }
}
