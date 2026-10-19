import { Controller, Get } from '@nestjs/common';
import { OrdersService } from './orders.service.js';

@Controller('admin/orders')
export class AdminOrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get('export')
  exportAll() {
    return this.orders.list();
  }
}
