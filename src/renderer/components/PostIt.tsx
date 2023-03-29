/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, March 2023
 */

import styles from './PostIt.module.scss';
import Button from 'renderer/components/Button';

type Props = {
  title: string;
  content: string;
};

export default function PostIt(props: Props) {
  return (
    <div className={styles.postIt}>
      <div className={styles.header}>
        <div className={styles.postItTitle}>{props.title}</div>
        <div className={styles.buttonContainer}>
          <Button className={styles.clearButton} isFilled={false}>
            Clear
          </Button>
        </div>
      </div>
      <div className={styles.postItBody}><textarea/></div>
    </div>
  );
}
