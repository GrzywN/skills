import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { Between, Repository } from 'typeorm';
import { Order } from '../orders/order.entity.js';

@Injectable()
export class InvoicesService {
  constructor(
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectQueue('invoices') private readonly queue: Queue,
  ) {}

  @Cron('0 2 * * *')
  async exportYesterday() {
    const end = new Date();
    end.setHours(0, 0, 0, 0);
    const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
    const paid = await this.orders.find({ where: { status: 'paid', createdAt: Between(start, end) } });
    for (const order of paid) {
      await this.queue.add('send-invoice', { orderId: order.id });
    }
  }
}
