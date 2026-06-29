/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, March 2023
 */

import { Menu, Tray, nativeImage } from 'electron';
import isMac from './helpers/isMac';
import getAssetPath from './helpers/getAssetPath';
import ContextShifter from './ContextShifter';
import TaskManager from './TaskManager';
import ActiveTaskSession from './ActiveTaskSession';

export default class TrayManager {
  private static _tray: Tray | null = null;
  public static _contextShifterInstance: ContextShifter;

  public static async init(contextShifter: ContextShifter) {
    this._contextShifterInstance = contextShifter;
    // macOS: a template image (monochrome rounded square with the dial knocked
    // out) so the menu bar tints it like every other tray icon, adapting to
    // light/dark. Windows keeps the coloured glyph.
    if (isMac) {
      const icon = nativeImage.createFromPath(
        getAssetPath('trayIcons/mac/ContextShifterTrayTemplate.png')
      );
      icon.setTemplateImage(true);
      this._tray = new Tray(icon);
    } else {
      this._tray = new Tray(getAssetPath('trayIcons/windows/CameraIcon.png'));
    }

    const menu = await this.createMenu();
    this._tray.setContextMenu(menu);
    this._tray.setToolTip('ContextShifter');
  }

  private static async createMenu(): Promise<Menu> {
    const isActive = ActiveTaskSession.getInstance().isActive();

    const menu = Menu.buildFromTemplate([
      {
        label: 'Open Widget',
        click: () => {
          // Open the task switcher overlay, exactly as turning the dial would.
          TaskManager.getInstance().openSwitcher();
        },
      },
      { type: 'separator' },
      {
        // Stacked Create / Stop — one enabled depending on active state.
        label: 'Create Task',
        enabled: !isActive,
        click: () => {
          TaskManager.getInstance().startNewTask();
        },
      },
      {
        label: 'Stop Task',
        enabled: isActive,
        click: () => {
          TaskManager.getInstance().stopActiveTask();
        },
      },
      { type: 'separator' },
      { role: 'quit', label: 'Quit ContextShifter' },
    ]);
    return menu;
  }

  public static async updateTray(): Promise<void> {
    const updatedMenu = await this.createMenu();
    if (this._tray) {
      this._tray.setContextMenu(updatedMenu);
    }
  }

  // Returns the tray icon bounds (used for window positioning if needed).
  public static getBounds(): Electron.Rectangle | undefined {
    return this._tray?.getBounds();
  }
}
