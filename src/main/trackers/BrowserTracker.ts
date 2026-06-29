/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Roy Rutishauser <royadrian.rutishauser@uzh.ch>, Remy Egloff <remy.egloff@uzh.ch>, April 2023
 */

import { WebSocket, WebSocketServer } from 'ws';
import { debug, info } from 'electron-log';
import {
  BrowserEvent,
  CloseTabClientRequest,
  OpenTabClientRequest,
  RuntimeInfo,
  ServerEndpoints,
  WebNavigationDetail,
  WebNavigationSequenceUpdate
} from '../../types/context-browser-extension-types/types';
import { Windows } from 'webextension-polyfill';
import Browser from '../entity/Browser';
import BrowserTab from '../entity/BrowserTab';
import { BrowserType } from 'types/BrowserType';
import { hashString } from '../helpers/hashString';


export default class BrowserTracker {

  private static _instance: BrowserTracker;
  private _port = 8473;
  private _server: WebSocketServer;
  //browserWindowId, Websocket
  private _wsClients: Map<BrowserType, WebSocket> = new Map();
  //map BrowserWindow ID to tab
  private _openWindows: Map<number, Windows.Window> = new Map();
  private _connectionListeners: Map<BrowserType, Array<() => void>> = new Map([
    ['chrome', []],
    ['firefox', []],
    ['edge', []],
    ['safari', []]
  ]);

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

  public isActiveBrowserAddon(browserName: string): boolean{
    return this._wsClients.has(this.getBrowserTypeFromWindowTitle(browserName))

  }

  public getSnapshotInformation() {
    const browsers: Map<BrowserType, Browser[]> = new Map([
      ['chrome', []],
      ['firefox', []],
      ['edge', []],
      ['safari', []]
    ]);


    for (const [windowId, window] of this._openWindows) {
      const browserEntity = new Browser();
      browserEntity.browserTabs = [];
      browserEntity.windowId = windowId;
      browserEntity.type = this.getBrowserTypeFromWindowTitle(<string>window.title);
      browserEntity.isSelected = window.focused;

      if (window.tabs != undefined) {
        for (const tab of window.tabs) {
          const tabEntity = new BrowserTab();
          tabEntity.url = <string>tab.url;
          tabEntity.title = <string>tab.title;
          tabEntity.favIconUrl = <string>tab.favIconUrl;
          tabEntity.index = tab.index;
          tabEntity.isActive = tab.active;

          browserEntity.browserTabs.push(tabEntity);
        }
      }
      browsers.get(browserEntity.type)!.push(browserEntity);
    }
    return browsers;
  }

  public tabOpeningRequest(
    urls: string[],
    browserType: BrowserType,
    windowId?: number,
    label?: string
  ) {
    const data: OpenTabClientRequest = { urls, label, windowId };

    const connection = this._wsClients.get(browserType);

    if (connection && connection.readyState === WebSocket.OPEN) {
      connection.send(JSON.stringify({ endpoint: 'open-tabs', data }));
    }

  }

  public sendTabClosingRequest(
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

  public getOpenTabsForAnalysis(): string[] {
    const allURLs: string[] = [];
    this._openWindows.forEach((win) => {
      win.tabs?.forEach((tab) => {
        if (tab.url) {
          const hashedURL = hashString(tab.url);
          allURLs.push(hashedURL);
        }
      });
    });
    return allURLs;
  }

  private initEventListeners() {
    const self = this;

    // initial connection made after a client requested protocol upgrade
    this._server.on('connection', function(socket) {
      let runtimeInfo: RuntimeInfo | undefined;

      // actually establishing the socket
      socket.on('open', function() {
        debug('[BrowserTracker] Socket opened');
      });

      socket.on('error', function(error) {
        debug('[BrowserTracker] Socket error', error);
      });

      // new browser window has been created
      socket.on('message', async function(msg: string) {
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
          const browserType = self.getBrowserTypeFromWindowTitle(runtimeInfo.browserInfo.name);
          self._wsClients.set(browserType, socket);

          self.notifyConnectionListeners(browserType);

          await self.handleEvent(data);

        } else if (obj.endpoint === 'sequence') {
          const data = obj.data as WebNavigationSequenceUpdate;
          runtimeInfo = data.runtimeInfo as RuntimeInfo;
          const browserType = self.getBrowserTypeFromWindowTitle(runtimeInfo.browserInfo.name);
          self._wsClients.set(browserType, socket);
          self.notifyConnectionListeners(browserType);

        } else if (obj.endpoint === 'navigation') {
          self.handleNavigation(obj.data as WebNavigationDetail);
        }

      });

      // When a socket closes, or disconnects, remove it from the array.
      socket.on('close', function() {
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

  private async handleEvent(data: BrowserEvent) {
    //get all stored windows for one browserType
    const keysForWindowsToCleanUp = [];
    for (const [key, window] of this._openWindows.entries()) {
      if (window.title == data.runtimeInfo.browserInfo.name) {
        keysForWindowsToCleanUp.push(key);
      }
    }
    //remove all the windows for one browserType
    for (const key of keysForWindowsToCleanUp) {
      this._openWindows.delete(key);
    }

    //store the new windows
    data.windows.forEach((win) => {
      {
        //title is used for browserType
        win.title = data.runtimeInfo.browserInfo.name;

        if (!win.incognito && win.tabs && win.id) {
          //if a window doesn't have any tabs, it shouldn't be considered
          if (win.tabs.length > 0) {
            this._openWindows.set(win.id, win);
          }
        }
      }
    });

    // Feed the current active tab into the active-task session so browser-tab
    // focus time is scored even when active-win can't read the URL on macOS.
    try {
      const type = this.getBrowserTypeFromWindowTitle(
        data.runtimeInfo.browserInfo.name
      );
      const active = this.getActiveTab(type);
      if (active) {
        // Lazy require avoids an import cycle with ActiveTaskSession.
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const ActiveTaskSession = require('../ActiveTaskSession').default;
        ActiveTaskSession.getInstance().onBrowserTabChange(
          type,
          active.url,
          active.title
        );
      }
    } catch {
      // best-effort
    }
  }

  /**
   * The active tab of the given browser type. Prefers the focused window;
   * falls back to any window's active tab.
   */
  public getActiveTab(
    type: BrowserType
  ): { url: string; title: string } | null {
    let fallback: { url: string; title: string } | null = null;
    for (const [, win] of this._openWindows) {
      if (this.getBrowserTypeFromWindowTitle(<string>win.title) !== type) {
        continue;
      }
      const active = (win.tabs ?? []).find((t) => t.active);
      if (active?.url) {
        const entry = {
          url: <string>active.url,
          title: <string>(active.title ?? ''),
        };
        if (win.focused) return entry;
        if (!fallback) fallback = entry;
      }
    }
    return fallback;
  }

  private handleNavigation(data: WebNavigationDetail) {
    debug(
      `[BrowserTracker] Navigation of tab ${data.tab.url}: ${data.transitionType}`
    );
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

  private getBrowserTypeFromWindowTitle(windowTitle: string) {
    if (windowTitle.includes('Edge')) {
      return 'edge';
    } else if (windowTitle.includes('Firefox')) {
      return 'firefox';
    } else if (windowTitle.includes('Chrome')) {
      return 'chrome';
    } else {
      return 'safari';
    }
  }


}
