/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, April 2023
 */

import React from 'react';

interface Props extends React.ComponentPropsWithoutRef<'svg'> {
  onClick?: (
    e: React.MouseEvent<SVGSVGElement, MouseEvent>
  ) => void | Promise<void>;
}

export default function ArrowRightIcon(props: Props) {
  return (
    <svg
      {...props}
      onClick={props.onClick}
      id="arrowRightIcon"
      xmlns="http://www.w3.org/2000/svg"
      x="0px"
      y="0px"
      viewBox="0 0 16 16"
    >
      <path
        fill-rule="evenodd"
        clip-rule="evenodd"
        d="M9.00001 13.8871L14 8.8871L14 8.17999L9.00001 3.17999L8.2929 3.8871L12.4393 8.03354L2 8.03354L2 9.03354L12.4393 9.03354L8.2929 13.18L9.00001 13.8871Z"
      />
    </svg>
  );
}
