/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, March 2023
 */

import styles from './Button.module.scss';

export interface ButtonProps extends React.ComponentPropsWithoutRef<'button'> {
  onClick?: (
    e: React.MouseEvent<HTMLButtonElement, MouseEvent>
  ) => any | Promise<any>;
  isFilled: boolean;
}

export default function Button(props: ButtonProps) {
  return (
    <button
      className={`${styles.button} ${
        props.isFilled ? styles.filled : undefined
      } ${props.className}`}
      onClick={props.onClick}
    >
      <div className={styles.children}>{props.children}</div>
    </button>
  );
}
