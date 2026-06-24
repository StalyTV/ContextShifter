/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, May 2023
 */
import RGB from '../types/RGB';

// the purpose of this class is to define constants that might be adapted in the future
export default class StaticSettings {
  public static _TIME_WINDOW = 12 * 60 * 1000;
  public static RECENTLY_OPEN_APPS_TIME_WINDOW = 12 * 60 * 1000;
  public static MOST_USED_APP_TIME_WINDOW = 12 * 60 * 1000;
  public static LIGHT_PULSE_COLOR: RGB = { r: 8, g: 192, b: 221 };
  public static LIGHT_PULSE_LENGTH = 100; // time in ms
  public static IDLE_TIMEOUT = 5 * 60 // in seconds
  public static OPEN_ARTIFACTS_SAMPLING_RATE = 60 * 1000; // for study analysis

  // --- Artefact scoring (weighted linear: duration + frequency + recency) ---
  // Weights start equal; tune against Study 1 ground truth.
  public static SCORE_WEIGHT_DURATION = 1; // w1 (normalized foreground time)
  public static SCORE_WEIGHT_FREQUENCY = 1; // w2 (log(1 + access count))
  public static SCORE_WEIGHT_RECENCY = 1; // w3 (exponential recency decay)
  // w4: share of total interactions (clicks + keystrokes) across tracked,
  // non-never-close artefacts. Already normalized to [0,1]. Kept at 0 for now
  // so interactions are recorded but do NOT influence relevance scoring yet.
  public static SCORE_WEIGHT_INTERACTION = 0;
  // Recency decay rate per minute since last access: e^(-lambda * minutes).
  public static SCORE_DECAY_LAMBDA = 0.05;
  // Auto-select artefacts scoring at least this fraction of the top score.
  public static SCORE_SELECT_THRESHOLD = 0.5;

  public static appsWithNoFiles = ['Notes', 'Music'];

  public static shouldAppHaveFiles(appName: string): boolean {
    return !this.appsWithNoFiles.includes(appName);
  }
}
