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
  // Half-life (in active-time ms) for the *frequency* and *duration* scores:
  // each access / focus-ms is time-weighted by 2^(-age/halfLife), measured on
  // the task's active-time clock. So an artefact used heavily early but not
  // since gradually loses its frequency/duration relevance (instead of staying
  // maxed out forever), while one used continuously stays high. At 30 min this
  // fades slower than recency (half-life ln2 / SCORE_DECAY_LAMBDA ≈ 13.9 min):
  // recency reacts quickly to the last touch, while frequency/duration keep a
  // longer memory of sustained use.
  public static SCORE_HALF_LIFE_MS = 30 * 60 * 1000;
  // A focus visit must last at least this long (ms) to count as an "access" for
  // the frequency score. Briefer focus (e.g. accidentally tabbing through a
  // window/tab/file) is ignored so it doesn't inflate the access count.
  public static MIN_QUALIFYING_ACCESS_MS = 5000;
  // A focus visit must last at least this long (ms) to refresh an artefact's
  // recency (last-access time). Briefer accidental focus with no interaction
  // therefore doesn't give it a full recency score. An actual interaction
  // (click / keystroke) always refreshes recency regardless of visit length.
  public static MIN_RECENCY_ACCESS_MS = 3000;
  // Foreground duration stops accumulating once an artefact has had no
  // interaction (click / keystroke) for this long, so leaving an artefact open
  // while away from the keyboard doesn't keep inflating its duration. Each idle
  // gap still counts up to this grace period before it's cut off.
  public static DURATION_IDLE_TIMEOUT_MS = 3 * 60 * 1000;
  // Auto-select artefacts scoring at least this fraction of the top score.
  public static SCORE_SELECT_THRESHOLD = 0.5;

  // --- Semantic relevance (multiplicative modifier on the behavioral score) ---
  // final = behavioral * ((1 - influence) + influence * normalizedSemantic).
  // influence = 0 -> semantic off (factor 1); 1 -> full multiply. Tunable while
  // calibrating; kept low by default so semantic is collected before it drives.
  public static SCORE_SEMANTIC_INFLUENCE = 0;
  // Local embedding backend: 'transformers' (on-device WASM) or 'off'.
  public static SEMANTIC_BACKEND: 'transformers' | 'off' = 'transformers';
  public static SEMANTIC_MODEL = 'Xenova/all-MiniLM-L6-v2';
  // Cosine -> [0,1] mapping: sigmoid((cos - midpoint) / temperature). MiniLM
  // cosines are compressed (unrelated ~0.1-0.3, related ~0.4-0.7), so map them
  // through a calibratable curve. Raw cosine is also logged in the study export
  // so the midpoint can be chosen from real data.
  public static SEMANTIC_MIDPOINT = 0.4;
  public static SEMANTIC_TEMPERATURE = 0.12;

  public static appsWithNoFiles = ['Notes', 'Music'];

  public static shouldAppHaveFiles(appName: string): boolean {
    return !this.appsWithNoFiles.includes(appName);
  }
}
