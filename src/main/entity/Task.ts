import {
  Entity,
  BaseEntity,
  PrimaryGeneratedColumn,
  Column,
} from 'typeorm';

@Entity({ name: 'task' })
export default class Task extends BaseEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column('varchar')
  name!: string;

  @Column({ type: 'varchar', nullable: false })
  created!: string;

  @Column({ type: 'varchar', nullable: false })
  lastActive!: string;

  @Column({ type: 'tinyint', nullable: false, default: false })
  isArchived!: boolean;
}
