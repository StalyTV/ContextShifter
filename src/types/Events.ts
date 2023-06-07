/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, March 2023
 */

type Events = {
  "snapshot-selected": (id: number) => void;
  "snapshots-updated": () => void;
  "snapshot-ready": (id: number) => void;
};

export default Events;
