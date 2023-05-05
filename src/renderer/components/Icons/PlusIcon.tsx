/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, May 2023
 */

import React from 'react';

interface Props extends React.ComponentPropsWithoutRef<'svg'> {
  onClick?: (
    e: React.MouseEvent<SVGSVGElement, MouseEvent>
  ) => void | Promise<void>;
}

export default function PlusIcon(props: Props) {
  return (
    <svg
      {...props}
      onClick={props.onClick}
      id="plusIcon"
      xmlns="http://www.w3.org/2000/svg"
      x="0px"
      y="0px"
      viewBox="0 0 24 24"
      clipRule="evenodd"
      fillRule="evenodd"
      strokeLinejoin="round"
      strokeMiterlimit="2"
    >
      <path
        d="m11 11h-7.25c-.414 0-.75.336-.75.75s.336.75.75.75h7.25v7.25c0 .414.336.75.75.75s.75-.336.75-.75v-7.25h7.25c.414 0 .75-.336.75-.75s-.336-.75-.75-.75h-7.25v-7.25c0-.414-.336-.75-.75-.75s-.75.336-.75.75z"
        fillRule="nonzero"
      />
    </svg>
  );
}
