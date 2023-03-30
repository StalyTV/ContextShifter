/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, March 2023
 */

import React from 'react';

interface Props extends React.ComponentPropsWithoutRef<'svg'> {
  onClick?: (
    e: React.MouseEvent<SVGSVGElement, MouseEvent>
  ) => void | Promise<void>;
}

export default function SunMoonIcon(props: Props) {
  return (
    <svg
      {...props}
      onClick={props.onClick}
      id="sunMoonIcon"
      xmlns="http://www.w3.org/2000/svg"
      x="0px"
      y="0px"
      viewBox="0 0 24 24"
    >
      <path d="M0 12c0 6.627 5.373 12 12 12s12-5.373 12-12-5.373-12-12-12-12 5.373-12 12zm2 0c0-5.514 4.486-10 10-10v20c-5.514 0-10-4.486-10-10z" />
    </svg>
  );
}
