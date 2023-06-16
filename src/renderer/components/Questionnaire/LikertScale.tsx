/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@bf.uzh.ch>, June 2023
 */

import styles from './LikertScale.module.scss';
import Button from '../Button';
import { useState } from 'react';

type Props = {
  title: string;
  options: string[];
  onSelect: (item: string) => void;
};

export default function LikertScale(props: Props) {
  const [selectedItem, setSelectedItem] = useState('');

  const onClickItem = (item: string): void => {
    setSelectedItem(item);
    props.onSelect(item);
  };

  return (
    <div>
      <h3 className={styles.likertTitle}>{props.title}</h3>
      <div className={styles.buttonBox}>
        {props.options.map((item) => (
          <Button
            key={item}
            isFilled={selectedItem === item}
            onClick={() => onClickItem(item)}
            disabled={false}
          >
            {item}
          </Button>
        ))}
      </div>
    </div>
  );
}
