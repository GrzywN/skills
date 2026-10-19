import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from '../orders/order.entity.js';
import { InvoicesProcessor } from './invoices.processor.js';
import { InvoicesService } from './invoices.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Order]), BullModule.registerQueue({ name: 'invoices' })],
  providers: [InvoicesService, InvoicesProcessor],
})
export class InvoicesModule {}
