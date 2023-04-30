/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, April 2023
 */

export type UsageDataEvent =
  | 'start'
  | 'quit'
  | 'lock-screen'
  | 'unlock-screen'
  | 'open-snapshot-window'
  | 'close-snapshot-window'
  | 'minimize-snapshot-window'
  | 'restore-snapshot-window'
  | 'focus-snapshot-window'
  | 'blur-snapshot-window'
  | 'open-instant-curation-window'
  | 'close-instant-curation-window'
  | 'minimize-instant-curation-window'
  | 'restore-instant-curation-window'
  | 'focus-instant-curation-window'
  | 'blur-instant-curation-window'
  | 'open-snapshot-gallery-window'
  | 'close-snapshot-gallery-window'
  | 'minimize-snapshot-gallery-window'
  | 'restore-snapshot-gallery-window'
  | 'focus-snapshot-gallery-window'
  | 'blur-snapshot-gallery-window'
  | 'create-snapshot'
  | 'restore-snapshot'
  | 'postpone-snapshot';
  ;
