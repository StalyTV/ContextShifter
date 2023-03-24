/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, March 2023
 */

import { Menu, Tray, app, shell } from 'electron';
import isMac from './helpers/isMac';
import getAssetPath from './helpers/getAssetPath';
import path from 'path';

export default class TrayManager {
  private static _tray: Tray | null = null;

  public static async init() {
    const platform = isMac ? 'mac' : 'windows';
    const iconPath = getAssetPath(`trayIcons/${platform}/CameraIcon.png`);
    this._tray = new Tray(iconPath);

    const menu = Menu.buildFromTemplate([
      {
        label: 'Open Logs',
        click: () => {
          const logPath = isMac
            ? `Library/Logs/${app.name}/main.log`
            : `AppData/Roaming/${app.name}/logs/main.log`;

          const fullPath = path.join(app.getPath('home'), logPath);
          shell.showItemInFolder(fullPath);
        },
      },
      {
        label: 'Collected Data',
        click: () => {
          shell.showItemInFolder(
            path.join(app.getPath('appData'), app.name, 'database.sqlite')
          );
        },
      },
      { type: 'separator' },
      { role: 'about' },
      { role: 'quit' },
    ]);
    this._tray.setContextMenu(menu);
    this._tray.setToolTip('TaskSnap');
  }
}
