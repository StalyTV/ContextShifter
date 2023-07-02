/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@bf.uzh.ch>, June 2023
 */

import { ReactElement } from 'react';
import styles from './OpenText.module.scss';

type Props = {
  title: string;
  htmlTitle?: ReactElement; // if underline etc. should be used
  text: string;
  rows: number;
  onTextChange: (text: string) => void;
};

export default function OpenText(props: Props) {
  const onTextChange = async (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    props.onTextChange(e.target.value);
  };

  return (
    <div>
      <h4 className={styles.title}>{props.htmlTitle || props.title}</h4>
      <textarea
        className={styles.text}
        value={props.text}
        onChange={onTextChange}
        rows={props.rows}
      />
    </div>
  );
}
