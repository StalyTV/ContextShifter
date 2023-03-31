/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, March 2023
 */

import Artifact from "types/Artifact";
import isMac from "./isMac";
import { exec } from 'child_process';
import Application from "main/entity/Application";

export function openArtifact(artifact: Artifact) {
  if (isMac) {
    if (artifact.application) {
      exec(`open -a '${artifact.application}' '${artifact.artifact}'`);
    } else {
      exec(`open '${artifact.artifact}'`);
    }
  } else {
    exec(`start ${artifact.artifact}`);
  }
}

export function closeApplication(app: Application) {
  if (isMac) {
    exec(`osascript -e 'quit app ${app.path}"'`);
  }
}
