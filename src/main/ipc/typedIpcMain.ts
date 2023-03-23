/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, March 2023
 */

import { ipcMain } from 'electron';
import Commands from 'types/Commands';
import Events from 'types/Events';
import { TypedIpcMain } from '../ipc/types/electron-typed-ipc';

const typedIpcMain = ipcMain as TypedIpcMain<Events, Commands>;

export default typedIpcMain;
