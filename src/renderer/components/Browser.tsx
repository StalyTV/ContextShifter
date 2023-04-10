/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, April 2023
 */

import styles from './Browser.module.scss';
import BrowserEntity from '../../main/entity/Browser';
import BrowserTabEntity from '../../main/entity/BrowserTab';
import BrowserTab from './BrowserTab';

type Props = {
  browser: BrowserEntity;
  updateBrowser: (updatedBrowser: BrowserEntity) => void;
};

export default function Browser(props: Props) {
  const sortedTabs = props.browser.browserTabs.sort(
    (a, b) => a.index - b.index
  );

  const updateTab = (updatedTab: BrowserTabEntity) => {
    const updatedBrowser = props.browser;
    const tabToUpdate = updatedBrowser.browserTabs.find(
      (t) => t.id === updatedTab.id
    );
    if (tabToUpdate) {
      tabToUpdate.isSelected = updatedTab.isSelected;
      props.updateBrowser(updatedBrowser);
    }
  };

  return (
    <div className={styles.browser}>
      {sortedTabs.map((tab) => (
        <BrowserTab key={tab.id} tab={tab} updateTab={updateTab} />
      ))}
    </div>
  );
}
