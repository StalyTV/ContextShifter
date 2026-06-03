/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, March 2023
 */

import { Menu, MenuItemConstructorOptions, Tray, app, shell } from 'electron';
import isMac from './helpers/isMac';
import getAssetPath from './helpers/getAssetPath';
import path from 'path';
import TaskSnap from './TaskSnap';
import WindowManager from './WindowManager';
import Snapshot from './entity/Snapshot';
import Settings from './entity/Settings';
import { UsageDataOrigin } from '../types/UsageDataOrigin';
import StudyManager from './StudyManager';
import { StudyPhase } from '../types/StudyPhase';

export default class TrayManager {
  private static _tray: Tray | null = null;
  public static _taskSnapInstance: TaskSnap;

  public static async init(taskSnap: TaskSnap) {
    this._taskSnapInstance = taskSnap;
    const platform = isMac ? 'mac' : 'windows';
    const iconPath = getAssetPath(
      `trayIcons/${platform}/CameraIcon${isMac ? 'Template' : ''}.png`
    );
    this._tray = new Tray(iconPath);

    const menu = await this.createMenu();
    this._tray.setContextMenu(menu);
    this._tray.setToolTip('TaskSnap');
  }

  private static async createMenu(): Promise<Menu> {
    const isStudy: boolean =
      StudyManager.getStudyPhase() !== StudyPhase.NoStudy;
    const areActionsVisible: boolean =
      StudyManager.getStudyPhase() !== StudyPhase.Baseline;

    const menu = Menu.buildFromTemplate([
      {
        label: 'New Snapshot',
        click: async () => {
          await this._taskSnapInstance.createNewSnapshot(UsageDataOrigin.Tray);
        },
        accelerator: await Settings.getSnapshotShortcut(),
        visible: areActionsVisible,
      },
      {
        label: 'Restore Recent Snapshot',
        submenu: await this.createRestoreSubmenu(),
        visible: areActionsVisible,
      },
      { type: 'separator' },
      {
        label: 'Open TaskSnap',
        click: async () => {
          if (WindowManager.mainWindow === null) {
            await WindowManager.createMainWindow();
          } else {
            WindowManager.mainWindow.show();
          }
        },
        visible: areActionsVisible,
      },
      {
        label: 'Settings',
        click: async () => {
          if (WindowManager.settingsWindow === null) {
            await WindowManager.createSettingsWindow();
          } else {
            WindowManager.settingsWindow.show();
          }
        },
        visible: !areActionsVisible, // only visible during baseline phase
      },
      { type: 'separator' },
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
      {
        label: `Study Phase: ${StudyManager.getStudyPhase()}`,
        enabled: false,
        visible: isStudy,
      },
      { role: 'about' },
      { role: 'quit' },
    ]);
    return menu;
  }

  private static async createRestoreSubmenu(): Promise<
    MenuItemConstructorOptions[]
  > {
    const lastFiveSnapshots = await Snapshot.getLatestNSnapshots(5);
    const menuEntries: MenuItemConstructorOptions[] = lastFiveSnapshots.map(
      (snap) => {
        const entry: MenuItemConstructorOptions = {
          label: snap.name,
          click: async () => {
            await TaskSnap.getInstance().restoreSnapshot(
              snap,
              UsageDataOrigin.Tray
            );
          },
        };
        return entry;
      }
    );
    return menuEntries;
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
