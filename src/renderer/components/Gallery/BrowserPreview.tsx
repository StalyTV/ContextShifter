/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, April 2023
 */

import styles from './BrowserPreview.module.scss';
import BrowserEntity from '../../../main/entity/Browser';
import BrowserTabPreview from './BrowserTabPreview';
import Artifact from 'types/Artifact';

type Props = {
  browser: BrowserEntity;
  isExpanded: boolean;
};

export default function BrowserPreview(props: Props) {
  const getSelectedTabs = () => {
    return props.browser.browserTabs.filter((tab) => tab.isSelected);
  };

  const onClickApplicationIcon = async (e: React.MouseEvent) => {
    // makes sure Preview is not expanded
    e.stopPropagation();

    const artifact: Artifact = {
      artifact: props.browser.path,
    };
    await window.electron.ipcRenderer.invoke('open-artifact', artifact);
  };

  return (
    <div className={styles.previewContainer}>
      <img
        className={styles.browserIcon}
        src={props.browser.icon}
        data-tooltip-id={'task-snap'}
        data-tooltip-content={props.browser.title}
        onClick={onClickApplicationIcon}
      />
      <div className={styles.tabs}>
        {getSelectedTabs().map((tab) => (
          <BrowserTabPreview
            key={tab.id}
            browser={props.browser}
            tab={tab}
            isExpanded={props.isExpanded}
          />
        ))}
      </div>
    </div>
  );
}
