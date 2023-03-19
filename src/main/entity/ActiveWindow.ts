/* Copyright Human Aspects of Software Engineering Lab (HASEL), Department of Informatics, University of Zurich - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 * Written by Remy Egloff <remy.egloff@uzh.ch>, March 2023
 */

import { Entity, BaseEntity, PrimaryGeneratedColumn, Column } from "typeorm";

@Entity({ name: "active_window" })
export default class ActiveWindow extends BaseEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column("varchar")
  ts!: string;

  @Column({ type: "varchar", nullable: true })
  application!: string;

  @Column({ type: "varchar", nullable: true })
  title!: string;

  @Column({ type: "varchar", nullable: true })
  activity!: string;

  @Column({ type: "varchar", nullable: true })
  url!: string;

}
