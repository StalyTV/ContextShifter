/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, April 2023
 */

import isMac from './isMac';

export function getFileNameFromPath(
  filePath: string,
  excludeType: boolean = false
): string {
  let fileName: string;
  if (isMac) {
    fileName = filePath.split('/').reverse()[0];
  } else {
    fileName = filePath.split('\\').reverse()[0];
  }
  if (excludeType) {
    return fileName.split('.')[0];
  } else {
    return fileName;
  }
}
