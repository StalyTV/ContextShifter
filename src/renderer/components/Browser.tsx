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

  const toggleSelect = () => {
    const updatedBrowser = props.browser;
    updatedBrowser.isSelected = !props.browser.isSelected;

    // if browser gets deselected, deselect all associated tabs
    if (!updatedBrowser.isSelected) {
      for (const tab of updatedBrowser.browserTabs) {
        tab.isSelected = false;
      }
    }
    props.updateBrowser(updatedBrowser);
  };

  const updateTab = (updatedTab: BrowserTabEntity) => {
    const updatedBrowser = props.browser;
    const tabToUpdate = updatedBrowser.browserTabs.find(
      (t) => t.id === updatedTab.id
    );
    if (tabToUpdate) {
      tabToUpdate.isSelected = updatedTab.isSelected;

      // if tab gets selected, also browser is selected
      if (tabToUpdate.isSelected) {
        updatedBrowser.isSelected = true;
      }
      props.updateBrowser(updatedBrowser);
    }
  };

  return (
    <div
      className={`${styles.browser} ${
        props.browser.isSelected ? styles.isSelected : undefined
      }`}
      onClick={() => toggleSelect()}
    >
      <div className={styles.header}>
        <img className={styles.icon} src={props.browser.icon} />
      </div>

      {sortedTabs.map((tab) => (
        <BrowserTab key={tab.id} tab={tab} updateTab={updateTab} />
      ))}
    </div>
  );
}
