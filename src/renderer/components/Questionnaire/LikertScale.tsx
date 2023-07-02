/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@bf.uzh.ch>, June 2023
 */

import styles from './LikertScale.module.scss';
import Button from '../Button';
import { ReactElement, useState } from 'react';

type Props = {
  title: string;
  htmlTitle?: ReactElement; // if underline etc. should be used
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
      <h4 className={styles.likertTitle}>{props.htmlTitle || props.title}</h4>
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
