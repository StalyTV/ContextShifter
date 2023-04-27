/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, April 2023
 */

import styles from './BrowserTabPreview.module.scss';
import BrowserEntity from '../../../main/entity/Browser';
import BrowserTabEntity from '../../../main/entity/BrowserTab';

type Props = {
  browser: BrowserEntity;
  tab: BrowserTabEntity;
  isExpanded: boolean;
};

export default function BrowserTabPreview(props: Props) {
  const onClickTab = async (e: React.MouseEvent) => {
    // makes sure Preview is not expanded
    e.stopPropagation();
    await window.electron.ipcRenderer.invoke(
      'open-browser-tab',
      props.browser,
      props.tab
    );
  };

  return (
    <div
      className={styles.container}
      onClick={onClickTab}
      data-tooltip-id={'task-snap'}
      data-tooltip-content={`${props.tab.title}`}
    >
      <img className={styles.tabIcon} src={props.tab.favIconUrl} />
      {props.isExpanded || props.tab.isActive || !props.tab.favIconUrl ? (
        <span>{props.tab.title}</span>
      ) : null}
    </div>
  );
}
