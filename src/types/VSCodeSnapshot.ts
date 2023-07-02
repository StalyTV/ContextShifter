/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, April 2023
 */

import { Range } from 'vscode';
import { Commit } from './git';

export type VSCodeSnapshot = {
  openFiles: OpenVSCodeFile[];
  branch: string | undefined;
  lastCommit: Commit | undefined;
  hasUncommittedChanges: boolean;
  toDos: VSCodeTODO[];
  lastEdit: Edit | undefined;
  workspaceName: string | undefined;
  workspacePath: string | undefined;
};

export type OpenVSCodeFile = {
  name: string;
  path: string;
  isActive: boolean;
};

export type VSCodeTODO = {
  filePath: string;
  line: number;
  text: string;
};

export type Edit = {
  lineRange: Range;
  code: string;
  filePath: string;
  functionName: string | undefined;
  timestamp: Date;
};

export type ActiveFileMessage = {
  activeFile: string | null;
  openFiles: OpenVSCodeFile[];
};

export type WindowUnfocusMessage = {
  openFiles: OpenVSCodeFile[];
};
