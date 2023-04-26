/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, April 2023
 */

import styles from './BrowserTabPreview.module.scss';
import BrowserTabEntity from '../../../main/entity/BrowserTab';

type Props = {
  tab: BrowserTabEntity;
  isExpanded: boolean;
};

export default function BrowserTabPreview(props: Props) {
  return (
    <div className={styles.container}>
      <img className={styles.tabIcon} src={props.tab.favIconUrl} />
      {props.isExpanded || props.tab.isActive || !props.tab.favIconUrl ? (
        <span>{props.tab.title}</span>
      ) : null}
    </div>
  );
}
