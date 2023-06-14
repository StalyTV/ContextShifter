/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, May 2023
 */

export enum UsageDataOrigin {
  SnapshotWindow = 'snapshot-window',
  InstantCurationWindow = 'instant-curation-window',
  SnapshotGalleryWindow = 'snapshot-gallery-window',
  Tray = 'tray',
  Shortcut = 'shortcut',
  USBDevice = 'usb-device',
}
