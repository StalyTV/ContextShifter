/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, April 2023
 */

import styles from './LoadingAnimation.module.scss';

type Props = {
  className?: string;
};

export default function LoadingAnimation(props: Props) {
  return (
    <div className={`${styles.loadingWrapper} ${props.className}`}>
      <div className={styles['lds-ripple']}>
        <div></div>
        <div></div>
      </div>
    </div>
  );
}
