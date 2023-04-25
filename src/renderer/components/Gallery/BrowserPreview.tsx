/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, April 2023
 */

import styles from './BrowserPreview.module.scss';
import BrowserEntity from '../../../main/entity/Browser';

type Props = {
  browser: BrowserEntity;
};

export default function BrowserPreview(props: Props) {
  const getSelectedTabs = () => {
    return props.browser.browserTabs.filter((tab) => tab.isSelected);
  };

  return (
    <div className={styles.previewContainer}>
      <img className={styles.browserIcon} src={props.browser.icon} />
      {getSelectedTabs().map((tab) => {
        return (
          <img key={tab.id} className={styles.tabIcon} src={tab.favIconUrl} />
        );
      })}
    </div>
  );
}
