/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Roy Rutishauser <royadrian.rutishauser@uzh.ch>, Remy Egloff <remy.egloff@uzh.ch>, April 2023
 */

import { WebSocketServer, WebSocket } from 'ws';
import { info, debug, error } from 'electron-log';
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
import { BrowserType } from 'types/BrowserType';
import { hashUrl } from '../helpers/hashUrl';
import { ActiveTab } from '../../types/ActiveTab';
import ActiveArtifact from './ActiveArtifact';

export default class BrowserTracker {
  private static _instance: BrowserTracker;
  private _port = 8084;
  private _server: WebSocketServer;
  private _wsClients: Map<BrowserType, WebSocket> = new Map();
  private _connectionListeners: Map<BrowserType, Array<() => void>> = new Map([
    ['chrome', []],
    ['firefox', []],
    ['edge', []],
  ]);
  private _openTabs: Map<BrowserType, Tabs.Tab[]> = new Map();

  private constructor() {
    this._server = new WebSocketServer({ port: this._port });
    this.initEventListeners();
    info(`[BrowserTracker] listening on port ${this._port}`);
  }

  public static getInstance() {
    return this._instance || (this._instance = new this());
  }

  public subscribeToConnection(browserType: BrowserType, fn: () => void) {
    const subscribers = this._connectionListeners.get(browserType);
    if (subscribers) {
      subscribers.push(fn);
    }
  }

  private initEventListeners() {
    const self = this;

    // initial connection made after a client requested protocol upgrade
    this._server.on('connection', function (socket) {
      let runtimeInfo: RuntimeInfo | undefined;

      // actually establishing the socket
      socket.on('open', function () {
        debug('[BrowserTracker] Socket opened');
      });

      socket.on('error', function (error) {
        debug('[BrowserTracker] Socket error', error);
      });

      socket.on('message', async function (msg: string) {
        const obj = JSON.parse(msg) as {
          endpoint: ServerEndpoints;
          data: unknown;
        };

        if (obj.endpoint === 'event') {
          const data = obj.data as BrowserEvent;
          debug(
            `[BrowserTracker] "event" msg received of type "${data.type}" from "${data.runtimeInfo.browserInfo.name}"`
          );
          runtimeInfo = data.runtimeInfo as RuntimeInfo;
          const browserType = self.getBrowserTypeFromRuntimeInfo(runtimeInfo);
          self._wsClients.set(browserType, socket);
          await self.handleEvent(data, runtimeInfo);

          self.notifyConnectionListeners(browserType);
        } else if (obj.endpoint === 'sequence') {
          const data = obj.data as WebNavigationSequenceUpdate;
          runtimeInfo = data.runtimeInfo as RuntimeInfo;
          const browserType = self.getBrowserTypeFromRuntimeInfo(runtimeInfo);
          self._wsClients.set(browserType, socket);
          self.handleSequence(data, runtimeInfo);
        } else if (obj.endpoint === 'navigation') {
          self.handleNavigation(obj.data as WebNavigationDetail);
        }
      });

      // When a socket closes, or disconnects, remove it from the array.
      socket.on('close', function () {
        let browserToRemove: BrowserType | undefined;
        for (let [type, storedSocket] of self._wsClients.entries()) {
          if (storedSocket === socket) {
            browserToRemove = type;
          }
        }
        if (browserToRemove) {
          self._wsClients.delete(browserToRemove);
        }
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

    let browserType: BrowserType;
    if (runtimeInfo.browserInfo.name === 'Edge') {
      browserType = 'edge';
    } else if (runtimeInfo.browserInfo.name === 'Firefox') {
      browserType = 'firefox';
    } else {
      browserType = 'chrome';
    }
    this._openTabs.set(browserType, allTabs);

    // store currently active tab for smart pre-selection
    const activeTab = allTabs.find((tab) => {
      return tab.active;
    });
    if (activeTab && activeTab.url) {
      const tab: ActiveTab = {
        url: activeTab.url,
        ts: new Date(),
      };
      ActiveArtifact.setCurrentTab(tab);
    }

    // if browser is no longer in focus, finish the session of the currently active tab
    if (data.type === 'window-unfocus') {
      await ActiveArtifact.storeCurrentTab();
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

  public async saveOpenTabsToDb(browsers: Browser[]) {
    for await (const browser of browsers) {
      const browserType = browser.type;
      const tabsOfBrowser = this._openTabs.get(browserType);
      if (!tabsOfBrowser) {
        error(
          `[BrowserTracker] No tab information found for browser of type ${browserType}`
        );
        return;
      }

      for await (const tab of tabsOfBrowser) {
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

      // if no tabs are open, deselect browser by default
      if (tabsOfBrowser.length === 0) {
        browser.isSelected = false;
        browser.save();
      }
      info(
        `[BrowserTracker] attached ${tabsOfBrowser.length} tabs to browser with id ${browser.id};`
      );
    }
  }

  public sendTabOpeningRequest(
    browserType: BrowserType,
    urls: string[],
    label?: string
  ) {
    const data: OpenTabClientRequest = { urls, label };

    const connection = this._wsClients.get(browserType);
    if (connection && connection.readyState === WebSocket.OPEN) {
      connection.send(JSON.stringify({ endpoint: 'open-tabs', data }));
    }
  }

  public async sendTabClosingRequest(
    browserType: BrowserType,
    data: CloseTabClientRequest[]
  ) {
    const connection = this._wsClients.get(browserType);
    if (connection && connection.readyState === WebSocket.OPEN) {
      connection.send(JSON.stringify({ endpoint: 'close-tabs', data }));
    }
  }

  public isSocketOpen(browserType?: BrowserType): boolean {
    if (!browserType) {
      return Array.from(this._wsClients.values()).some(
        (connection) => connection.readyState === WebSocket.OPEN
      );
    } else {
      const socketOfBrowser = this._wsClients.get(browserType);
      if (socketOfBrowser) {
        return socketOfBrowser.readyState === WebSocket.OPEN;
      } else {
        return false;
      }
    }
  }

  private notifyConnectionListeners(browserType: BrowserType) {
    const subscribers = this._connectionListeners.get(browserType);
    if (subscribers) {
      for (const fn of subscribers) {
        fn();
      }
      this._connectionListeners.set(browserType, []);
    }
  }

  private getBrowserTypeFromRuntimeInfo(runtimeInfo: RuntimeInfo): BrowserType {
    if (runtimeInfo.browserInfo.name === 'Edge') {
      return 'edge';
    } else if (runtimeInfo.browserInfo.name === 'Firefox') {
      return 'firefox';
    } else {
      return 'chrome';
    }
  }
}
