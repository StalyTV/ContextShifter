/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, April 2023
 */

import styles from './IDEPreview.module.scss';
import IDEEntity from '../../../main/entity/IDE';
import ReactDOMServer from 'react-dom/server';
import BranchIcon from '../Icons/BranchIcon';
import CommitIcon from '../Icons/CommitIcon';

type Props = {
  ide: IDEEntity;
  isExpanded: boolean;
};

export default function IDEPreview(props: Props) {
  const getFiles = () => {
    if (props.isExpanded) {
      return props.ide.ideFiles.filter((file) => file.isSelected);
    } else {
      return props.ide.ideFiles.filter(
        (file) => file.isSelected && file.isActive
      );
    }
  };

  const tooltip = (
    <>
      <div className={`${styles.gitInfo} ${styles.first}`}>
        <BranchIcon className={styles.gitIcon} />
        <span>{props.ide.branch}</span>
      </div>
      <div className={styles.gitInfo}>
        <CommitIcon className={styles.gitIcon} />
        <span>{props.ide.lastCommitMessage}</span>
      </div>
    </>
  );

  return (
    <div
      className={styles.previewContainer}
      data-tooltip-id={'task-snap'}
      data-tooltip-html={ReactDOMServer.renderToStaticMarkup(tooltip)}
    >
      <img className={styles.ideIcon} src={props.ide.icon} />
      {getFiles().map((file) => {
        return (
          <div key={file.id} className={styles.file}>
            {file.name}
          </div>
        );
      })}
    </div>
  );
}
