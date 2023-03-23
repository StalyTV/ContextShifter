/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, March 2023
 */

import { TypedIpcRenderer } from '../../main/ipc/types/electron-typed-ipc';
import Events from 'types/Events';
import Commands from 'types/Commands';
import { ipcRenderer } from 'electron';

const typedIpcRenderer = ipcRenderer as TypedIpcRenderer<Events, Commands>;

export default typedIpcRenderer;
