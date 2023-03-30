/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, March 2023
 */

import GearIcon from '../Icons/GearIcon';
import SunMoonIcon from '../Icons/SunMoonIcon';
import styles from './NavBar.module.scss';

export default function NavBar() {
  const onClickSunMoonIcon = async () => {
    await window.electron.ipcRenderer.invoke('toggle-color-theme');
  };

  return (
    <div className={styles.navBar}>
      <SunMoonIcon
        className={styles.icon}
        onClick={() => onClickSunMoonIcon()}
      />
      <GearIcon className={styles.icon} />
    </div>
  );
}
