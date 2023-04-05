/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, April 2023
 */

import styles from './PostponeButton.module.scss';
import { useState } from 'react';
import Button from './Button';
import ArrowIcon from './Icons/ArrowIcon';

type Props = {
  title: string;
  isFilled: boolean;
  onSelect: (timeInMin: number) => void;
};

export default function PostponeButton(props: Props) {
  const [isDropDownShown, setIsDropDownShown] = useState(false);

  const toggleDropDown = () => {
    setIsDropDownShown(!isDropDownShown);
  };

  const onClick = (timeInMin: number) => {
    props.onSelect(timeInMin);
  };

  return (
    <>
      <Button
        className={styles.postponeButton}
        isFilled={props.isFilled}
        onClick={() => toggleDropDown()}
      >
        {props.title}
        <ArrowIcon />
      </Button>
      {isDropDownShown ? (
        <div className={styles.dropdown}>
          <div className={styles.dropdownOptions}>
            <div className={styles.dropdownOption} onClick={() => onClick(5)}>
              5 min
            </div>
            <div className={styles.dropdownOption} onClick={() => onClick(15)}>
              15 min
            </div>
            <div className={styles.dropdownOption} onClick={() => onClick(30)}>
              30 min
            </div>
            <div className={styles.dropdownOption} onClick={() => onClick(60)}>
              60 min
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
