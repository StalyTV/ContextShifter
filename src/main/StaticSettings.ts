/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, May 2023
 */
import RGB from '../types/RGB';

// the purpose of this class is to define constants that might be adapted in the future
export default class StaticSettings {
  public static IDE_TIME_WINDOW = 10 * 60 * 1000;
  public static RECENTLY_OPEN_APPS_TIME_WINDOW = 15 * 60 * 1000;
  public static LIGHT_PULSE_COLOR: RGB = { r: 8, g: 192, b: 221 };
  public static LIGHT_PULSE_LENGTH = 100; // time in ms

  public static appsWithNoFiles = ['Notes', 'Music'];

  public static shouldAppHaveFiles(appName: string): boolean {
    return !this.appsWithNoFiles.includes(appName);
  }
}
