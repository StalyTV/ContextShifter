/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Dario Bugmann <darionicola.bugmann@uzh.ch>, November 2021
 */

import { ToastContainer } from "react-toastify";
import "./Toast.scss";

export default function Toast() {
  return (
    <div>
      <ToastContainer
        autoClose={5000}
        hideProgressBar={true}
        pauseOnHover={false}
      />
    </div>
  );
}
