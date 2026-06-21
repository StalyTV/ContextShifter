import { Windows, Tabs, WebNavigation, Runtime } from 'webextension-polyfill'

export interface BrowserEvent {
  type: BrowserEventType
  windows: Windows.Window[]
  runtimeInfo: RuntimeInfo
  removedTab?: Tabs.Tab // only present for tab-removed
}

export type TabId = number
export type BrowserEventType = "tab-switched" | "tab-removed" | "window-unfocus" | "window-focus" | "window-resized" | "ws-connected"

export interface PageCapture {
  runtimeInfo: RuntimeInfo
  tab: Tabs.Tab
  capture: string
  html: string
  ts: Date
}

export interface WebNavigationSequenceUpdate {
  runtimeInfo: RuntimeInfo
  sequence: WebNavigationDetail[]
  isTerminated: boolean
}

export interface WebNavigationDetail {
  tab: Tabs.Tab
  transitionQualifiers: WebNavigation.TransitionQualifier[]
  transitionType: WebNavigation.TransitionType
  ts: Date
}

/** a manual curation -- e.g. via context menu in the browser */
export interface ManualCuration {
  runtimeInfo: RuntimeInfo
  tabs: Tabs.Tab[]
  location: 'shelf' | 'history'
}

/** request for closing a specific tab.
* If optional `windowId`, `tabId`, and `browserName` are not provided, 
* all tabs matching the url will be closed
*/
export interface CloseTabClientRequest {
  windowId?: number
  browserName?: string
  tabId?: number
  url: string
}

/** if only tabs of the same group are opened, we can provide 
* an optional label as tabGroups label (currently, chrome only)
*/
export interface OpenTabClientRequest {
  urls: string[]
  label?: string
  windowId?: number
}

export enum ClientEndpoints {
  closeTabs = 'close-tabs',
  openTabs = 'open-tabs',
  updateBookmarks = 'update-bookmarks',
  config = 'config'
}

export enum ServerEndpoints {
  event = 'event',
  capture = 'capture',
  curation = 'curation',
  sequence = 'sequence',
  navigation = 'navigation'
}

export interface RuntimeInfo {
  browserInfo: Runtime.BrowserInfo
  extensionId: string
  /** random id established when the browser extension is installed in the browser */
  installationId: string
}

export interface BookmarkingRequest {
  starredGroups: { id: string, label?: string, pages: { url: string, title: string }[] }[]
}

export interface ConfigRequest {
  openTabsInNewWindow: boolean
  appMode: 'gstell' | 'sali' | 'all' | undefined // sync with config.yaml
}