import { Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Job } from 'bullmq';
import { Repository } from 'typeorm';
import { Order } from '../orders/order.entity.js';

@Processor('invoices')
export class InvoicesProcessor extends WorkerHost {
  constructor(@InjectRepository(Order) private readonly orders: Repository<Order>) {
    super();
  }

  async process(job: Job<{ orderId: string }>) {
    const order = await this.orders.findOneByOrFail({ id: job.data.orderId });
    await fetch('https://mailer.example.com/send', {
      method: 'POST',
      body: JSON.stringify({ to: order.customerEmail, template: 'invoice', orderId: order.id }),
    });
    order.invoiceExported = true;
    await this.orders.save(order);
  }
}
