/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, April 2023
 */

import { Commit } from "./git";

export type VSCodeSnapshot = {
  openFiles: OpenVSCodeFile[];
  branch: string | undefined;
  lastCommit: Commit | undefined;
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
  line: number; // starting at 1
  lineContent: string;
  filePath: string;
  functionName: string | undefined;
  timestamp: Date;
};
