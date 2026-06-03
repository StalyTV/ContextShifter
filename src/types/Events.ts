/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, March 2023
 */

type SwitcherItem = { id: number | null; name: string };

type Events = {
  "task-switcher-state": (state: {
    parents: SwitcherItem[];
    parentIndex: number;
    children: SwitcherItem[];
    childIndex: number;
    mode: 'parent' | 'child';
    activeTaskId: number | null;
  }) => void;
};

export default Events;
