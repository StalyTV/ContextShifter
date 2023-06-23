/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@bf.uzh.ch>, June 2023
 */

import styles from './BooleanQuestion.module.scss';
import Button from '../Button';
import { useState } from 'react';

type Props = {
  title: string;
  onSelect: (value: boolean) => void;
};

export default function BooleanQuestion(props: Props) {
  const [isTrue, setIsTrue] = useState<boolean | null>(null);

  const onSetValue = (value: boolean): void => {
    setIsTrue(value);
    props.onSelect(value);
  };

  return (
    <div>
      <h4 className={styles.title}>{props.title}</h4>
      <div className={styles.buttonBox}>
        <Button
          key={'true'}
          isFilled={isTrue || false}
          onClick={() => onSetValue(true)}
          disabled={false}
        >
          {'True'}
        </Button>
        <Button
          key={'false'}
          isFilled={isTrue === null ? false : !isTrue}
          onClick={() => onSetValue(false)}
          disabled={false}
        >
          {'False'}
        </Button>
      </div>
    </div>
  );
}
