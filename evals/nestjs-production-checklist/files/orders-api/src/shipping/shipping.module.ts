import { Module } from '@nestjs/common';
import { ShippingController } from './shipping.controller.js';
import { ShippingService } from './shipping.service.js';

@Module({
  controllers: [ShippingController],
  providers: [ShippingService],
})
export class ShippingModule {}
