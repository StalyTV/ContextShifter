/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, April 2023
 */

import styles from './GitInfo.module.scss';
import BranchIcon from './Icons/BranchIcon';
import CommitIcon from './Icons/CommitIcon';
import WorkspaceIcon from './Icons/WorkspaceIcon';

type Props = {
  branch: string;
  lastCommitMessage: string;
  workspaceName: string;
};

export default function GitInfo(props: Props) {
  return (
    <div className={styles.gitInfo}>
      {props.branch ? (
        <div className={styles.item}>
          <BranchIcon className={styles.icon} />
          <span>{props.branch}</span>
        </div>
      ) : null}
      {props.lastCommitMessage ? (
        <div className={styles.item}>
          <CommitIcon className={styles.icon} />
          <span>{props.lastCommitMessage}</span>
        </div>
      ) : null}
      {props.workspaceName ? (
        <div className={styles.item}>
          <WorkspaceIcon className={styles.icon} />
          <span>{props.workspaceName}</span>
        </div>
      ) : null}
    </div>
  );
}
