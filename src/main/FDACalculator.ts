/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, May 2023
 */

import ActiveWindow from './entity/ActiveWindow';
import Snapshot from './entity/Snapshot';

// based on the algorithm proposed in the paper "Using contexts similarity to predict relationships between tasks"
// by Walid Maalej, Mathias Ellmann & Romain Robbes
// https://doi.org/10.1016/j.jss.2016.11.033
export default class FDACalculator {
  public static async getRelevanceOfApplications(
    appNames: string[]
  ): Promise<Map<string, number>> {
    const result = new Map();
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

    // then, calculate relevance of each application
    for await (const appName of appNames) {
      const lastAccess = await ActiveWindow.getLastAppAccess(appName);
      if (!lastAccess || lastAccess.getTime() < taskStart.getTime()) {
        result.set(appName, 0);
        continue;
      }

      const timeElapsed = Date.now() - lastAccess.getTime();
      const age = timeElapsed / A;

      const accessCount = await ActiveWindow.getAccessCount(appName, taskStart);
      const freq = (accessCount * 1) / F;

      const accessDuration = await ActiveWindow.getAccessDuration(
        appName,
        taskStart
      );
      const dur = accessDuration / D;

      // to ensure no division by 0 happens
      if (age > 0) {
        const rel = (freq * dur) / age;
        result.set(appName, rel);
      } else {
        result.set(appName, 0);
      }
    }

    return result;
  }
}
