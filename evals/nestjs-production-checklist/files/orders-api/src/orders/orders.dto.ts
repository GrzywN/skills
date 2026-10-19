import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateOrderDto {
  @IsString()
  customerId!: string;

  @IsString()
  customerEmail!: string;

  @IsInt()
  @Min(1)
  totalCents!: number;
}

export class ListOrdersQuery {
  @IsOptional()
  @IsInt()
  take?: number;
}

export class PayOrderDto {
  @IsString()
  paymentMethodId!: string;
}
