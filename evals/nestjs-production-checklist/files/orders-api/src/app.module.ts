import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AllExceptionsFilter } from './common/all-exceptions.filter.js';
import { HealthModule } from './health/health.module.js';
import { InvoicesModule } from './invoices/invoices.module.js';
import { OrdersModule } from './orders/orders.module.js';
import { ShippingModule } from './shipping/shipping.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        console.log('Loaded config', config);
        return {
          type: 'postgres',
          url: config.get('DATABASE_URL'),
          autoLoadEntities: true,
          synchronize: true,
          extra: { max: 30 },
        };
      },
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: { url: config.get('REDIS_URL') },
      }),
    }),
    OrdersModule,
    ShippingModule,
    InvoicesModule,
    HealthModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
})
export class AppModule {}
