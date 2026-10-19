import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  customerId!: string;

  @Column()
  customerEmail!: string;

  @Column('int')
  totalCents!: number;

  @Column({ default: 'pending' })
  status!: string;

  @Column({ nullable: true })
  stripePaymentIntentId?: string;

  @Column({ nullable: true })
  internalNotes?: string;

  @Column({ default: false })
  invoiceExported!: boolean;

  @CreateDateColumn()
  createdAt!: Date;
}
