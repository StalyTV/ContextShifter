/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, March 2023
 */

type SwitcherItem = { id: number | null; name: string };

type CommitDialogAction =
  | { kind: 'none' }
  | { kind: 'start'; parentId: number | null }
  | { kind: 'resume'; taskId: number };

type Events = {
  "task-switcher-state": (state: {
    parents: SwitcherItem[];
    parentIndex: number;
    children: SwitcherItem[];
    childIndex: number;
    mode: 'parent' | 'child';
    activeTaskId: number | null;
  }) => void;
  "snapshots-changed": () => void;
  "open-new-task-dialog": (parentId: number | null) => void;
  "open-start-task-dialog": (parentId: number | null) => void;
  "open-commit-task-dialog": (action: CommitDialogAction) => void;
  "active-task-changed": (task: { id: number; name: string } | null) => void;
};

export default Events;
