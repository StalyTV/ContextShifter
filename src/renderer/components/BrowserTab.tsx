/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, April 2023
 */

import styles from './BrowserTab.module.scss';
import BrowserTabEntity from '../../main/entity/BrowserTab';

type Props = {
  tab: BrowserTabEntity;
  updateTab: (updatedTab: BrowserTabEntity) => void;
};

export default function BrowserTab(props: Props) {
  const openTab = async () => {};

  const toggleSelect = (e: React.MouseEvent) => {
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
      <img src={props.tab.favIconUrl} alt="favicon"></img>
      <span>{props.tab.title}</span>
    </div>
  );
}
