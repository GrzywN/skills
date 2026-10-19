import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RequestLogger } from '../common/request-logger.service.js';
import { AdminOrdersController } from './admin-orders.controller.js';
import { Order } from './order.entity.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order]),
    JwtModule.register({ secret: process.env.JWT_SECRET }),
  ],
  controllers: [OrdersController, AdminOrdersController],
  providers: [OrdersService, RequestLogger],
  exports: [OrdersService],
})
export class OrdersModule {}
