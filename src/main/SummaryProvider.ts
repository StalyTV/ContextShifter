/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, June 2023
 */

import ActiveBrowserTab from './entity/ActiveBrowserTab';
import ActiveWindow from './entity/ActiveWindow';
import Settings from './entity/Settings';

export default class SummaryProvider {
  public static async createTaskSummary(): Promise<string> {
    const startTimeWindow = new Date(Date.now() - 5 * 60 * 1000);

    const mostActiveApp = await ActiveWindow.getMostActiveApp(startTimeWindow);

    let latestActiveURL = '';
    const latestActiveBrowserTab = await ActiveBrowserTab.getLatestActiveTab();
    const areURLsAnonymized = await Settings.getIsDataAnonymized();
    if (latestActiveBrowserTab && !areURLsAnonymized) {
      const timestamp = new Date(latestActiveBrowserTab.ts);
      if (timestamp.getTime() > startTimeWindow.getTime()) {
        latestActiveURL = latestActiveBrowserTab.url;
      }
    }

    let summaryString = '';
    if (
      mostActiveApp &&
      mostActiveApp !== '[no window selected]' &&
      mostActiveApp !== 'UserNotificationCenter'
    ) {
      summaryString += `Recently, I was working in ${mostActiveApp}`;
    }
    if (summaryString !== '' && latestActiveURL) {
      summaryString += ' and ';
    }
    if (latestActiveURL) {
      summaryString += `visited ${latestActiveURL}`;
    }
    if (summaryString !== '') {
      summaryString += '.'
    }
    return summaryString;
  }
}
