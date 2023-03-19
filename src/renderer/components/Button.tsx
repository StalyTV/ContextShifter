/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, March 2023
 */

export interface ButtonProps extends React.ComponentPropsWithoutRef<'button'> {
  onClick?: (
    e: React.MouseEvent<HTMLButtonElement, MouseEvent>
  ) => any | Promise<any>;
}

export default function Button(props: ButtonProps) {
  return (
    <button className={props.className} onClick={props.onClick}>
      {props.children}
    </button>
  );
}
