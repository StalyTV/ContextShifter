/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Dario Bugmann <darionicola.bugmann@uzh.ch>, November 2021
 */

import React from "react";
import styles from "./Input.module.scss";

export interface InputProps extends React.ComponentPropsWithRef<"input"> {}

export default React.forwardRef<HTMLInputElement, InputProps>((props, ref) => (
  <input
    {...props}
    ref={ref}
    className={` ${styles.input} ${props.className}`}
  />
));
