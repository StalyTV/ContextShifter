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

  return (
    <>
      <Button isFilled={props.isFilled} onClick={() => toggleDropDown()}>
        {props.title}
        <ArrowIcon />
      </Button>
      {isDropDownShown ? (
        <div className={styles.dropdown}>
          <div className={styles.dropdownOptions}>
            <div className={styles.dropdownOption}>5 Minutes</div>
            <div className={styles.dropdownOption}>15 Minutes</div>
            <div className={styles.dropdownOption}>30 Minutes</div>
            <div className={styles.dropdownOption}>60 Minutes</div>
          </div>
        </div>
      ) : null}
    </>
  );
}
