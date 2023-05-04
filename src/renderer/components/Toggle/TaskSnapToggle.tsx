/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, May 2023
 */

import Toggle from 'react-toggle';
import './Toggle.css';
import styles from './TaskSnapToggle.module.scss';

type Props = {
  leftLabel: string;
  rightLabel: string;
  defaultChecked: boolean;
  icons: boolean;
  onChange: () => void;
};

export default function TaskSnapToggle(props: Props) {
  return (
    <div className={styles.toggleContainer}>
      <span className={styles.leftLabel}>{props.leftLabel}</span>
      <Toggle
        defaultChecked={props.defaultChecked}
        onChange={props.onChange}
        icons={props.icons}
      />
      <span className={styles.rightLabel}>{props.rightLabel}</span>
    </div>
  );
}
