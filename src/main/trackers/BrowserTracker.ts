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
} from '../../types/context-browser-extension-types/types';
import { Tabs } from 'webextension-polyfill';
import Browser from '../entity/Browser';
import BrowserTab from '../entity/BrowserTab';

export default class BrowserTracker {
  private _port = 8083;
  private _server: WebSocket.Server;
  private _lastUsedSocket: WebSocket | undefined;
  private _connectionListeners: Array<() => void> = [];
  private _openTabs: Tabs.Tab[] = [];

  constructor() {
    info(`[BrowserTracker] listening on port ${this._port}`);
    this._server = new WebSocket.Server({ port: this._port });
    this.initEventListeners();
  }

  public subscribeToConnection(fn: () => void) {
    this._connectionListeners.push(fn);
  }

  private initEventListeners() {
    const self = this;

    // initial connection made after a client requested protocol upgrade
    this._server.on('connection', function (socket) {
      let runtimeInfo: RuntimeInfo | undefined;

      // actually establishing the socket
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
        self.notifyConnectionListeners();
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
        }
      });

      // When a socket closes, or disconnects, remove it from the array.
      socket.on('close', function () {
        self._lastUsedSocket = undefined;
        debug('[BrowserTracker] Socket closed');
      });
    });
  }

  private handleEvent(data: BrowserEvent, runtimeInfo: RuntimeInfo) {
    const allTabs: Tabs.Tab[] = [];
    data.windows.forEach((win) => {
      if (!win.incognito && win.tabs) {
        allTabs.push(...win.tabs);
      }
    });
    this._openTabs = allTabs;
  }

  private handleSequence(
    data: WebNavigationSequenceUpdate,
    runtimeInfo: RuntimeInfo
  ) {}

  private handleNavigation(data: WebNavigationDetail) {
    debug(
      `[BrowserTracker] Navigation of tab ${data.tab.url}: ${data.transitionType}`
    );
  }

  public async saveOpenTabsToDb(browser: Browser) {
    for await (const tab of this._openTabs) {
      if (!tab.url) continue;

      const tabEntity = new BrowserTab();
      tabEntity.url = tab.url;
      tabEntity.title = tab.title;
      tabEntity.favIconUrl = tab.favIconUrl;
      tabEntity.index = tab.index;
      tabEntity.isActive = tab.active;
      tabEntity.browser = browser;
      tabEntity.save();
    }
    info(
      `[BrowserTracker] attached ${this._openTabs.length} tabs to browser with id ${browser.id};`
    );
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
