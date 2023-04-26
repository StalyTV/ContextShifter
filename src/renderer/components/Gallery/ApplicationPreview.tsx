/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, April 2023
 */

import styles from './ApplicationPreview.module.scss';
import ApplicationEntity from '../../../main/entity/Application';

type Props = {
  app: ApplicationEntity;
};

export default function ApplicationPreview(props: Props) {
  return (
    <div className={styles.previewContainer}>
      <img className={styles.appIcon} src={props.app.icon} />
      {props.app.files.map((file) => {
        return <div key={file.id}>{file.name}</div>;
      })}
    </div>
  );
}
