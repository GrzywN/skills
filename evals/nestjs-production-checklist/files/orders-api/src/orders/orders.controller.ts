import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/jwt-auth.guard.js';
import { CreateOrderDto, ListOrdersQuery, PayOrderDto } from './orders.dto.js';
import { OrdersService } from './orders.service.js';

@UseGuards(JwtAuthGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  list(@Query() query: ListOrdersQuery) {
    return this.orders.list(query.take);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.orders.get(id);
  }

  @Post()
  create(@Body() dto: CreateOrderDto) {
    return this.orders.create(dto);
  }

  @Post(':id/pay')
  pay(@Param('id') id: string, @Body() dto: PayOrderDto) {
    return this.orders.pay(id, dto);
  }
}
