/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, April 2023
 */

import styles from './BrowserTab.module.scss';
import BrowserTabEntity from '../../main/entity/BrowserTab';
import EyeIcon from './Icons/EyeIcon';

type Props = {
  tab: BrowserTabEntity;
  updateTab: (updatedTab: BrowserTabEntity) => void;
};

export default function BrowserTab(props: Props) {
  const toggleSelect = (e: React.MouseEvent) => {
    // makes sure Browser is not clicked as well
    e.stopPropagation();

    const updatedTab = props.tab;
    updatedTab.isSelected = !props.tab.isSelected;
    props.updateTab(updatedTab);
  };

  return (
    <div
      className={`${styles.tab} ${
        props.tab.isSelected ? styles.isSelected : undefined
      }`}
      onClick={toggleSelect}
    >
      {props.tab.favIconUrl ? (
        <img src={props.tab.favIconUrl} alt="favicon"></img>
      ) : (
        <div className={styles.favIconPlaceholder}></div>
      )}
      <span>{props.tab.title}</span>
      {props.tab.isActive ? <EyeIcon className={styles.icon} /> : null}
    </div>
  );
}
