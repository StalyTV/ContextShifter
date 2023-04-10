/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, April 2023
 */

import styles from './Browser.module.scss';
import BrowserTabEntity from '../../main/entity/BrowserTab';
import BrowserTab from './BrowserTab';

type Props = {
  browserTabs: BrowserTabEntity[];
  updateTabs: (updatedTabs: BrowserTabEntity[]) => void;
};

export default function Browser(props: Props) {
  const updateTab = (updatedTab: BrowserTabEntity) => {
    const updatedTabs = props.browserTabs;
    const tabToUpdate = updatedTabs.find((t) => t.id === updatedTab.id);
    if (tabToUpdate) {
      tabToUpdate.isSelected = updatedTab.isSelected;
      props.updateTabs(updatedTabs);
    }
  };

  return (
    <div className={styles.browser}>
      {props.browserTabs.map((tab) => (
        <BrowserTab key={tab.id} tab={tab} updateTab={updateTab} />
      ))}
    </div>
  );
}
