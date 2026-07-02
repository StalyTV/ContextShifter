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

/** Identifies a browser profile. `id` is the extension's stable per-profile id. */
export type ProfileInfo = { id: string; email: string };

type ClientEntry = {
  socket: WebSocket;
  browserType: BrowserType;
  profile: ProfileInfo;
};

type WindowEntry = {
  window: Windows.Window;
  browserType: BrowserType;
  profile: ProfileInfo;
};

export default class BrowserTracker {

  private static _instance: BrowserTracker;
  private _port = 8473;
  private _server: WebSocketServer;
  // One connection per (browserType, profile). Each Chrome profile runs its own
  // extension instance, so "work" and "university" connect separately.
  private _clients: Map<string, ClientEntry> = new Map();
  // Open browser windows, keyed by (profileId, windowId) so ids can't collide
  // across profiles.
  private _openWindows: Map<string, WindowEntry> = new Map();
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

  private static profileOf(runtimeInfo: RuntimeInfo): ProfileInfo {
    return {
      id: runtimeInfo.profile?.id ?? '',
      email: runtimeInfo.profile?.email ?? '',
    };
  }

  private static clientKey(browserType: BrowserType, profileId: string): string {
    return `${browserType}::${profileId}`;
  }

  private static winKey(profileId: string, windowId: number): string {
    return `${profileId}::${windowId}`;
  }

  public subscribeToConnection(browserType: BrowserType, fn: () => void) {
    const subscribers = this._connectionListeners.get(browserType);
    if (subscribers) {
      subscribers.push(fn);
    }
  }

  public isActiveBrowserAddon(browserName: string): boolean {
    const type = this.getBrowserTypeFromWindowTitle(browserName);
    for (const entry of this._clients.values()) {
      if (entry.browserType === type) return true;
    }
    return false;
  }

  /** Distinct profiles with an open socket for the given browser type. */
  public getConnectedProfiles(browserType: BrowserType): ProfileInfo[] {
    const out: ProfileInfo[] = [];
    const seen = new Set<string>();
    for (const entry of this._clients.values()) {
      if (entry.browserType !== browserType) continue;
      if (entry.socket.readyState !== WebSocket.OPEN) continue;
      if (seen.has(entry.profile.id)) continue;
      seen.add(entry.profile.id);
      out.push(entry.profile);
    }
    return out;
  }

  public getSnapshotInformation() {
    const browsers: Map<BrowserType, Browser[]> = new Map([
      ['chrome', []],
      ['firefox', []],
      ['edge', []],
      ['safari', []]
    ]);

    for (const entry of this._openWindows.values()) {
      const { window, browserType, profile } = entry;
      const browserEntity = new Browser();
      browserEntity.browserTabs = [];
      browserEntity.windowId = window.id;
      browserEntity.type = browserType;
      browserEntity.isSelected = window.focused;
      browserEntity.profileId = profile.id;
      browserEntity.profileEmail = profile.email;

      if (window.tabs != undefined) {
        for (const tab of window.tabs) {
          const tabEntity = new BrowserTab();
          tabEntity.url = <string>tab.url;
          tabEntity.title = <string>tab.title;
          tabEntity.favIconUrl = <string>tab.favIconUrl;
          tabEntity.index = tab.index;
          tabEntity.isActive = tab.active;
          tabEntity.profileId = profile.id;
          tabEntity.profileEmail = profile.email;

          browserEntity.browserTabs.push(tabEntity);
        }
      }
      browsers.get(browserType)!.push(browserEntity);
    }
    return browsers;
  }

  /**
   * Ask the extension to (re)open `urls`. When `profileId` is given the request
   * is routed to that profile's connection; otherwise any open connection of
   * the browser type is used. Returns true if a request was actually sent.
   */
  public tabOpeningRequest(
    urls: string[],
    browserType: BrowserType,
    profileId?: string,
    windowId?: number,
    label?: string
  ): boolean {
    const data: OpenTabClientRequest = { urls, label, windowId };
    const connection = this.clientSocket(browserType, profileId);
    if (connection && connection.readyState === WebSocket.OPEN) {
      connection.send(JSON.stringify({ endpoint: 'open-tabs', data }));
      return true;
    }
    return false;
  }

  public sendTabClosingRequest(
    browserType: BrowserType,
    data: CloseTabClientRequest[],
    profileId?: string
  ) {
    if (profileId !== undefined) {
      const connection = this.clientSocket(browserType, profileId);
      if (connection && connection.readyState === WebSocket.OPEN) {
        connection.send(JSON.stringify({ endpoint: 'close-tabs', data }));
      }
      return;
    }
    // No profile given: broadcast to every connection of this browser type.
    for (const entry of this._clients.values()) {
      if (entry.browserType !== browserType) continue;
      if (entry.socket.readyState === WebSocket.OPEN) {
        entry.socket.send(JSON.stringify({ endpoint: 'close-tabs', data }));
      }
    }
  }

  /** Socket for (type, profile). Falls back to any open socket of the type. */
  private clientSocket(
    browserType: BrowserType,
    profileId?: string
  ): WebSocket | undefined {
    if (profileId !== undefined) {
      const exact = this._clients.get(
        BrowserTracker.clientKey(browserType, profileId)
      );
      if (exact) return exact.socket;
    }
    for (const entry of this._clients.values()) {
      if (
        entry.browserType === browserType &&
        entry.socket.readyState === WebSocket.OPEN
      ) {
        return entry.socket;
      }
    }
    return undefined;
  }

  public isSocketOpen(browserType?: BrowserType): boolean {
    for (const entry of this._clients.values()) {
      if (browserType && entry.browserType !== browserType) continue;
      if (entry.socket.readyState === WebSocket.OPEN) return true;
    }
    return false;
  }

  public getOpenTabsForAnalysis(): string[] {
    const allURLs: string[] = [];
    this._openWindows.forEach((entry) => {
      entry.window.tabs?.forEach((tab) => {
        if (tab.url) {
          allURLs.push(hashString(tab.url));
        }
      });
    });
    return allURLs;
  }

  private initEventListeners() {
    const self = this;

    this._server.on('connection', function(socket) {
      socket.on('open', function() {
        debug('[BrowserTracker] Socket opened');
      });

      socket.on('error', function(error) {
        debug('[BrowserTracker] Socket error', error);
      });

      socket.on('message', async function(msg: string) {
        const obj = JSON.parse(msg) as {
          endpoint: ServerEndpoints;
          data: unknown;
        };

        if (obj.endpoint === 'event') {
          const data = obj.data as BrowserEvent;
          const runtimeInfo = data.runtimeInfo as RuntimeInfo;
          const browserType = self.getBrowserTypeFromWindowTitle(
            runtimeInfo.browserInfo.name
          );
          const profile = BrowserTracker.profileOf(runtimeInfo);
          self.registerClient(browserType, profile, socket);
          self.notifyConnectionListeners(browserType);
          await self.handleEvent(data, browserType, profile);
        } else if (obj.endpoint === 'sequence') {
          const data = obj.data as WebNavigationSequenceUpdate;
          const runtimeInfo = data.runtimeInfo as RuntimeInfo;
          const browserType = self.getBrowserTypeFromWindowTitle(
            runtimeInfo.browserInfo.name
          );
          const profile = BrowserTracker.profileOf(runtimeInfo);
          self.registerClient(browserType, profile, socket);
          self.notifyConnectionListeners(browserType);
        } else if (obj.endpoint === 'navigation') {
          self.handleNavigation(obj.data as WebNavigationDetail);
        }
      });

      socket.on('close', function() {
        // Drop the client entry and every window it owned.
        let closed: ClientEntry | undefined;
        for (const [key, entry] of self._clients.entries()) {
          if (entry.socket === socket) {
            closed = entry;
            self._clients.delete(key);
          }
        }
        if (closed) {
          for (const [key, entry] of self._openWindows.entries()) {
            if (
              entry.profile.id === closed.profile.id &&
              entry.browserType === closed.browserType
            ) {
              self._openWindows.delete(key);
            }
          }
        }
        debug('[BrowserTracker] Socket closed');
      });
    });
  }

  private registerClient(
    browserType: BrowserType,
    profile: ProfileInfo,
    socket: WebSocket
  ) {
    const key = BrowserTracker.clientKey(browserType, profile.id);
    // If this profile reconnected on a new socket, drop the stale entry.
    const prev = this._clients.get(key);
    if (prev && prev.socket !== socket) {
      try {
        prev.socket.terminate();
      } catch {
        // ignore
      }
    }
    this._clients.set(key, { socket, browserType, profile });
  }

  private async handleEvent(
    data: BrowserEvent,
    browserType: BrowserType,
    profile: ProfileInfo
  ) {
    // Replace this profile's windows (only this profile's, so other profiles'
    // windows survive).
    for (const [key, entry] of this._openWindows.entries()) {
      if (entry.profile.id === profile.id && entry.browserType === browserType) {
        this._openWindows.delete(key);
      }
    }

    data.windows.forEach((win) => {
      win.title = data.runtimeInfo.browserInfo.name; // used for browser type
      if (!win.incognito && win.tabs && win.id && win.tabs.length > 0) {
        this._openWindows.set(BrowserTracker.winKey(profile.id, win.id), {
          window: win,
          browserType,
          profile,
        });
      }
    });

    // Feed the current active tab into the active-task session so browser-tab
    // focus time is scored even when active-win can't read the URL on macOS.
    try {
      const active = this.getActiveTab(browserType);
      if (active) {
        // Lazy require avoids an import cycle with ActiveTaskSession.
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const ActiveTaskSession = require('../ActiveTaskSession').default;
        ActiveTaskSession.getInstance().onBrowserTabChange(
          browserType,
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
    for (const entry of this._openWindows.values()) {
      if (entry.browserType !== type) continue;
      const win = entry.window;
      const active = (win.tabs ?? []).find((t) => t.active);
      if (active?.url) {
        const item = {
          url: <string>active.url,
          title: <string>(active.title ?? ''),
        };
        if (win.focused) return item;
        if (!fallback) fallback = item;
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

  private getBrowserTypeFromWindowTitle(windowTitle: string): BrowserType {
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
