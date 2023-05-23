/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Roy Rutishauser <royadrian.rutishauser@uzh.ch>, Remy Egloff <remy.egloff@uzh.ch>, April 2023
 */

import { WebSocketServer, WebSocket } from 'ws';
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
import ActiveBrowserTab from '../entity/ActiveBrowserTab';
import Settings from '../entity/Settings';

export default class BrowserTracker {
  private _port = 8083;
  private _server: WebSocketServer;
  private _lastUsedSocket: WebSocket | undefined;
  private _connectionListeners: Array<() => void> = [];
  private _openTabs: Tabs.Tab[] = [];

  constructor() {
    this._server = new WebSocketServer({ port: this._port });
    this.initEventListeners();
    info(`[BrowserTracker] listening on port ${this._port}`);
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

      socket.on('message', async function (msg: string) {
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
          await self.handleEvent(data, runtimeInfo);
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

  private async handleEvent(data: BrowserEvent, runtimeInfo: RuntimeInfo) {
    const allTabs: Tabs.Tab[] = [];
    data.windows.forEach((win) => {
      if (!win.incognito && win.tabs) {
        const filteredTabs = win.tabs.filter(
          (tab) => tab.url && tab.url !== 'chrome://newtab/'
        );
        allTabs.push(...filteredTabs);
      }
    });
    this._openTabs = allTabs;

    // store currently active tab for smart pre-selection
    const activeTab = allTabs.find((tab) => {
      return tab.active;
    });
    if (activeTab && activeTab.url) {
      const isDataAnonymized = await Settings.getIsDataAnonymized();
      const urlToStore = isDataAnonymized
        ? this.createHash(activeTab.url)
        : activeTab.url;

      const dbEntry = new ActiveBrowserTab();
      dbEntry.url = urlToStore;
      dbEntry.ts = new Date().toISOString();
      dbEntry.save();
    }
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
    // for smart pre-selection, look which urls were active within the last 10 minutes - TODO: update this condition
    const timeMinus10Min = Date.now() - 10 * 60 * 1000;
    const recentlyActiveUrls = await ActiveBrowserTab.getRecentlyActiveURLs(
      new Date(timeMinus10Min)
    );

    const isDataAnonymized = await Settings.getIsDataAnonymized();

    for await (const tab of this._openTabs) {
      if (!tab.url) continue;

      const wasTabRecentlyActive = recentlyActiveUrls.includes(
        isDataAnonymized ? this.createHash(tab.url) : tab.url
      );

      const tabEntity = new BrowserTab();
      tabEntity.url = tab.url;
      tabEntity.title = tab.title;
      tabEntity.favIconUrl = tab.favIconUrl;
      tabEntity.index = tab.index;
      tabEntity.isActive = tab.active;
      tabEntity.browser = browser;
      tabEntity.isSelected = wasTabRecentlyActive;
      tabEntity.save();
    }

    // if no tabs are open, deselect browser by default
    if (this._openTabs.length === 0) {
      browser.isSelected = false;
      browser.save();
    }
    info(
      `[BrowserTracker] attached ${this._openTabs.length} tabs to browser with id ${browser.id};`
    );
  }

  // simple hash function form https://stackoverflow.com/questions/7616461/generate-a-hash-from-string-in-javascript
  private createHash(url: string): string {
    let hash = 0;
    if (url.length === 0) return hash.toString();
    for (let i = 0; i < url.length; i++) {
      const chr = url.charCodeAt(i);
      hash = (hash << 5) - hash + chr;
      hash |= 0; // Convert to 32bit integer
    }
    return hash.toString();
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
