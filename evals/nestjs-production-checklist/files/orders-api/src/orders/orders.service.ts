import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RequestLogger } from '../common/request-logger.service.js';
import { Order } from './order.entity.js';
import { CreateOrderDto, PayOrderDto } from './orders.dto.js';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order) private readonly repository: Repository<Order>,
    private readonly config: ConfigService,
    private readonly logger: RequestLogger,
  ) {}

  list(take?: number) {
    return this.repository.find({ take, order: { createdAt: 'DESC' } });
  }

  get(id: string) {
    return this.repository.findOneByOrFail({ id });
  }

  create(dto: CreateOrderDto) {
    return this.repository.save(dto);
  }

  async pay(id: string, dto: PayOrderDto) {
    const order = await this.repository.findOneByOrFail({ id });
    const response = await fetch('https://api.stripe.com/v1/payment_intents', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.config.get('STRIPE_SECRET_KEY')}` },
      body: new URLSearchParams({
        amount: String(order.totalCents),
        currency: 'usd',
        payment_method: dto.paymentMethodId,
        confirm: 'true',
      }),
    });
    const intent = await response.json();
    order.status = 'paid';
    order.stripePaymentIntentId = intent.id;
    this.logger.log(`Order ${id} paid`);
    return this.repository.save(order);
  }
}
