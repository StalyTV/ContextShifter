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

export default function EditIcon(props: Props) {
  return (
    <svg
      {...props}
      onClick={props.onClick}
      id="editIcon"
      xmlns="http://www.w3.org/2000/svg"
      x="0px"
      y="0px"
      viewBox="0 0 16 16"
    >
      <path d="M13.23 1H11.77L3.52002 9.25L3.35999 9.46997L1 13.59L2.41003 15L6.53003 12.64L6.75 12.48L15 4.22998V2.77002L13.23 1ZM2.41003 13.59L3.92004 10.59L5.37 12.04L2.41003 13.59ZM6.23999 11.53L4.46997 9.76001L12.47 1.76001L14.24 3.53003L6.23999 11.53Z" />
    </svg>
  );
}
