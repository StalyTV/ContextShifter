/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, May 2023
 */

type UserSettings = {
  isDarkModeEnabled: boolean;
  isDataAnonymized: boolean;
  snapshotShortcut: string;
  endOfDayPopUpTime: Date;
  showQuestionnaireOnlyOnWorkdays: boolean;
};

export default UserSettings;
