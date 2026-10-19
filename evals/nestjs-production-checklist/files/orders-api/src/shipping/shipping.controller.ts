import { Controller, Get, Query } from '@nestjs/common';
import { ShippingService } from './shipping.service.js';

@Controller('shipping')
export class ShippingController {
  constructor(private readonly shipping: ShippingService) {}

  @Get('quotes')
  getQuotes(@Query('orderId') orderId: string) {
    return this.shipping.getQuotes(orderId);
  }
}
