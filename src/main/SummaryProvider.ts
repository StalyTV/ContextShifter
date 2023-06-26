/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, June 2023
 */

import StaticSettings from './StaticSettings';
import ActiveWindow from './entity/ActiveWindow';
import ActiveArtifact from './trackers/ActiveArtifact';

export default class SummaryProvider {
  public static async createTaskSummary(): Promise<string> {
    const startTimeWindow = new Date(
      Date.now() - StaticSettings.MOST_USED_APP_TIME_WINDOW
    );

    const mostActiveApp = await ActiveWindow.getMostActiveApp(startTimeWindow);
    const lastActiveTab = ActiveArtifact.getLastActiveTab();

    let latestActiveTabTitle = '';
    if (lastActiveTab) {
      if (lastActiveTab.ts.getTime() > startTimeWindow.getTime()) {
        if (lastActiveTab.title) {
          latestActiveTabTitle = lastActiveTab.title;
        } else {
          const url = new URL(lastActiveTab.url);
          latestActiveTabTitle = url.hostname;
        }
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
    if (summaryString !== '' && latestActiveTabTitle) {
      summaryString += ' and ';
    }
    if (latestActiveTabTitle) {
      summaryString += `visited "${latestActiveTabTitle}" in the browser`;
    }
    if (summaryString !== '') {
      summaryString += '.';
    }
    return summaryString;
  }
}
