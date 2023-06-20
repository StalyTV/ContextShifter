/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, May 2023
 */

import ActiveBrowserTab from './entity/ActiveBrowserTab';
import ActiveWindow from './entity/ActiveWindow';
import ActiveFile from './entity/ActiveFile';
import Snapshot from './entity/Snapshot';
import { hashUrl } from './helpers/hashUrl';
import { info } from 'electron-log';
import StaticSettings from './StaticSettings';

// based on the algorithm proposed in the paper "Using contexts similarity to predict relationships between tasks"
// by Walid Maalej, Mathias Ellmann & Romain Robbes
// https://doi.org/10.1016/j.jss.2016.11.033
export default class FDACalculator {
  public static async addRelevanceToSnapshotArtifacts(snapshotId: number) {
    const snapshot = await Snapshot.getSnapshotById(snapshotId);
    if (!snapshot) return;

    const appNames: string[] = snapshot.applications.map((app) => {
      return app.name;
    });
    const urls: string[] = [];
    snapshot.browsers.forEach((browser) => {
      browser.browserTabs.forEach((tab) => {
        urls.push(tab.url);
      });
    });
    const ideFiles: string[] = [];
    snapshot.ides.forEach((ide) => {
      ide.ideFiles.forEach((file) => {
        ideFiles.push(file.path);
      });
    });

    await FDACalculator.setRelevanceOfArtifacts(
      snapshotId,
      appNames,
      urls,
      ideFiles
    );
  }

  private static async setRelevanceOfArtifacts(
    snapshotId: number,
    appNames: string[],
    urls: string[],
    ideFiles: string[]
  ): Promise<void> {
    // we consider all interaction that happened since the last snapshot was created
    let taskStart: Date;
    const latestSnapshot = await Snapshot.getSecondLastSnapshot(); // last snapshot would be the just created one
    if (latestSnapshot) {
      taskStart = new Date(latestSnapshot.created);

      // if no snapshot exists, consider all database entries
    } else {
      taskStart = new Date(0);
    }

    let D = 0; // total duration
    let F = 0; // total number of interactions
    let A = 0; // total age;

    // first, calculate constants
    for await (const appName of appNames) {
      const lastAccess = await ActiveWindow.getLastAppAccess(appName);
      if (!lastAccess || lastAccess.getTime() < taskStart.getTime()) {
        continue;
      }

      const numOfAccesses = await ActiveWindow.getAccessCount(
        appName,
        taskStart
      );
      const accessDuration = await ActiveWindow.getAccessDuration(
        appName,
        taskStart
      );
      const timeElapsed = Date.now() - lastAccess.getTime();
      A += timeElapsed;
      F += numOfAccesses;
      D += accessDuration;
    }

    for await (const url of urls) {
      const hashedUrl = hashUrl(url);
      const lastAccess = await ActiveBrowserTab.getLastURLAccess(hashedUrl);
      if (!lastAccess || lastAccess.getTime() < taskStart.getTime()) {
        continue;
      }

      const numOfAccesses = await ActiveBrowserTab.getAccessCount(
        hashedUrl,
        taskStart
      );
      const accessDuration = await ActiveBrowserTab.getAccessDuration(
        hashedUrl,
        taskStart
      );
      const timeElapsed = Date.now() - lastAccess.getTime();
      A += timeElapsed;
      F += numOfAccesses;
      D += accessDuration;
    }

    for await (const filePath of ideFiles) {
      const lastAccess = await ActiveFile.getLastFileAccess(filePath);
      if (!lastAccess || lastAccess.getTime() < taskStart.getTime()) {
        continue;
      }

      const numOfAccesses = await ActiveFile.getAccessCount(
        filePath,
        taskStart
      );
      const accessDuration = await ActiveFile.getAccessDuration(
        filePath,
        taskStart
      );
      const timeElapsed = Date.now() - lastAccess.getTime();
      A += timeElapsed;
      F += numOfAccesses;
      D += accessDuration;
    }

    const relevances = new Map<string, number>();
    // then, calculate relevance of each application
    for await (const appName of appNames) {
      const lastAccess = await ActiveWindow.getLastAppAccess(appName);
      if (!lastAccess || lastAccess.getTime() < taskStart.getTime()) {
        relevances.set(appName, 0);
        continue;
      }

      const timeElapsed = Date.now() - lastAccess.getTime();
      const accessCount = await ActiveWindow.getAccessCount(appName, taskStart);
      const accessDuration = await ActiveWindow.getAccessDuration(
        appName,
        taskStart
      );

      const rel = this.calculateRelevanceScore(
        A,
        F,
        D,
        timeElapsed,
        accessCount,
        accessDuration
      );
      relevances.set(appName, rel);
    }

    for await (const url of urls) {
      const hashedUrl = hashUrl(url);
      const lastAccess = await ActiveBrowserTab.getLastURLAccess(hashedUrl);
      if (!lastAccess || lastAccess.getTime() < taskStart.getTime()) {
        relevances.set(url, 0);
        continue;
      }

      const timeElapsed = Date.now() - lastAccess.getTime();
      const accessCount = await ActiveBrowserTab.getAccessCount(
        hashedUrl,
        taskStart
      );
      const accessDuration = await ActiveBrowserTab.getAccessDuration(
        hashedUrl,
        taskStart
      );
      const rel = this.calculateRelevanceScore(
        A,
        F,
        D,
        timeElapsed,
        accessCount,
        accessDuration
      );
      relevances.set(url, rel);
    }

    for await (const filePath of ideFiles) {
      const lastAccess = await ActiveFile.getLastFileAccess(filePath);
      if (!lastAccess || lastAccess.getTime() < taskStart.getTime()) {
        relevances.set(filePath, 0);
        continue;
      }

      const timeElapsed = Date.now() - lastAccess.getTime();
      const accessCount = await ActiveFile.getAccessCount(filePath, taskStart);
      const accessDuration = await ActiveFile.getAccessDuration(
        filePath,
        taskStart
      );
      const rel = this.calculateRelevanceScore(
        A,
        F,
        D,
        timeElapsed,
        accessCount,
        accessDuration
      );
      relevances.set(filePath, rel);
    }

    let loggingString = ''; // Somehow logging a map does not work
    relevances.forEach((value, key) => {
      loggingString += `([${key}] ${value}),`;
    });
    info('[FDACalculator] Relevances:', loggingString);

    const maxRelevance = Math.max(...relevances.values());
    const relevanceThreshold = maxRelevance / 2; // TODO: Look into more sophisticated approaches
    info('[FDACalculator] Threshold:', relevanceThreshold);

    // add relevances to artifacts and select them if above threshold
    const snapshot = await Snapshot.getSnapshotById(snapshotId);
    if (!snapshot) return;
    snapshot.applications.forEach((app) => {
      const rel = relevances.get(app.name) || 0;
      const isAppRelevant = rel > relevanceThreshold;
      app.relevance = rel;
      app.isSelected = isAppRelevant;

      app.files.forEach((file) => {
        file.isSelected = isAppRelevant; // NOTE: This could be made more fine-grained
        file.save();
      });
      app.save();
    });

    snapshot.browsers.forEach((browser) => {
      let isOneTabRelevant = false;
      browser.browserTabs.forEach((tab) => {
        const rel = relevances.get(tab.url) || 0;
        const isTabRelevant = rel > relevanceThreshold;
        tab.relevance = rel;
        tab.isSelected = isTabRelevant;
        tab.save();
        if (isTabRelevant) isOneTabRelevant = true;
      });
      browser.isSelected = isOneTabRelevant;
      browser.save();
    });

    snapshot.ides.forEach((ide) => {
      let isOneFileRelevant = false;
      ide.ideFiles.forEach((file) => {
        const rel = relevances.get(file.path) || 0;
        const isFileRelevant = rel > relevanceThreshold;
        file.relevance = rel;
        file.isSelected = isFileRelevant;
        file.save();
        if (isFileRelevant) isOneFileRelevant = true;
      });
      ide.isSelected = isOneFileRelevant;
      ide.save();
    });
  }

  private static calculateRelevanceScore(
    A: number,
    F: number,
    D: number,
    timeElapsed: number,
    accessCount: number,
    accessDuration: number
  ): number {
    const age = timeElapsed / A;
    const freq = (accessCount * 1) / F;
    const dur = accessDuration / D;
    // to ensure no division by 0 happens
    if (age > 0) {
      return (freq * dur) / age;
    } else {
      return 0;
    }
  }
}
