/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, April 2023
 */

import styles from './PostponeButton.module.scss';

type Props = {
  title: string;
  isFilled: boolean;
  onSelect: (timeInMin: number) => void;
};

export default function PostponeButton(props: Props) {
  const onSelect = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    props.onSelect(parseInt(e.target.value));
  };

  return (
    <>
      <select
        onChange={onSelect}
        name="select-postpone"
        id="select-postpone"
        className={styles.postponeButton}
      >
        <option value="">{props.title}</option>
        <option key={5} value={5}>
          {'5 min'}
        </option>
        <option key={15} value={15}>
          {'15 min'}
        </option>
        <option key={30} value={30}>
          {'30 min'}
        </option>
        <option key={60} value={60}>
          {'60 min'}
        </option>
      </select>
    </>
  );
}
