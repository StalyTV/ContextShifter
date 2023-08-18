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
  private _port = 8084;
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

  public getSnapshotInformation() {
    const browsers: Map<BrowserType, Browser[]> = new Map([
      ['chrome', []],
      ['firefox', []],
      ['edge', []],
      ['safari', []]
    ]);


    for (const [windowId, window] of this._openWindows) {
      const taskSnapBrowserEntity = new Browser();
      taskSnapBrowserEntity.browserTabs = [];
      taskSnapBrowserEntity.windowId = windowId;
      taskSnapBrowserEntity.type = this.getBrowserTypeFromWindowTitle(<string>window.title);
      taskSnapBrowserEntity.isSelected = window.focused;

      if (window.tabs != undefined) {
        for (const tab of window.tabs) {
          const TaskSnapTabEntity = new BrowserTab();
          TaskSnapTabEntity.url = <string>tab.url;
          TaskSnapTabEntity.title = <string>tab.title;
          TaskSnapTabEntity.favIconUrl = <string>tab.favIconUrl;
          TaskSnapTabEntity.index = tab.index;
          TaskSnapTabEntity.isActive = tab.active;

          taskSnapBrowserEntity.browserTabs.push(TaskSnapTabEntity);
        }
      }
      browsers.get(taskSnapBrowserEntity.type)!.push(taskSnapBrowserEntity);
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
