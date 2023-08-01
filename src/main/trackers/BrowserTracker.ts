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
      ['edge', []]
    ]);

    for (const [windowId, window] of this._openWindows) {
      const taskSnapBrowserEntity = new Browser();
      taskSnapBrowserEntity.browserTabs = [];

      taskSnapBrowserEntity.windowId = windowId;
      if (window.title != null) {
        taskSnapBrowserEntity.type = this.getBrowserTypeFromWindowTitle(window.title);
      }
      taskSnapBrowserEntity.isSelected = window.focused;

      if (window.tabs != undefined) {
        for (const tab of window.tabs) {
          const TaskSnapTabEntity = new BrowserTab();
          TaskSnapTabEntity.url = <string>tab.url;
          TaskSnapTabEntity.title = <string>tab.title;
          TaskSnapTabEntity.favIconUrl = <string>tab.favIconUrl;
          TaskSnapTabEntity.index = tab.index;
          TaskSnapTabEntity.isActive = tab.active;
          TaskSnapTabEntity.browser = taskSnapBrowserEntity;

          taskSnapBrowserEntity.browserTabs.push(TaskSnapTabEntity);
        }
      }

      browsers.get(taskSnapBrowserEntity.type)?.push(taskSnapBrowserEntity);

    }
    return browsers;
  }

  public sendTabOpeningRequest(
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

  public async sendTabClosingRequest(
    browserType: BrowserType,
    data: CloseTabClientRequest[]
  ) {
    const connection = this._wsClients.get(browserType);
    if (connection && connection.readyState === WebSocket.OPEN) {
      connection.send(JSON.stringify({ endpoint: 'close-tabs', data }));
    }

    //reset memory of open Windows
    this._openWindows.clear();
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

      //new browser window has been created
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
          const browserType = self.getBrowserTypeFromRuntimeInfo(runtimeInfo);
          self._wsClients.set(browserType, socket);
          await self.handleEvent(data);

          self.notifyConnectionListeners(browserType);

        } else if (obj.endpoint === 'sequence') {

          const data = obj.data as WebNavigationSequenceUpdate;
          runtimeInfo = data.runtimeInfo as RuntimeInfo;

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
    data.windows.forEach((win) => {
      {
        //title is used for browserType
        win.title = data.runtimeInfo.browserInfo.name;
        if (!win.incognito && win.tabs && win.id) {
          win.tabs = win.tabs.filter(
            (tab) => tab.url && tab.url !== 'chrome://newtab/'
          );
          this._openWindows.set(win.id, win);
        }
      }
    });
  }

  private handleNavigation(data: WebNavigationDetail) {
    debug(
      `[BrowserTracker] Navigation of tab ${data.tab.url}: ${data.transitionType}`
    );
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

  private getBrowserTypeFromWindowTitle(windowTitle: string) {
    if (windowTitle.includes('Edge')) {
      return 'edge';
    } else if (windowTitle.includes('Firefox')) {
      return 'firefox';
    } else {
      return 'chrome';
    }
  }


}
