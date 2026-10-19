import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface Quote {
  carrier: string;
  priceCents: number;
}

@Injectable()
export class ShippingService {
  constructor(private readonly config: ConfigService) {}

  async getQuotes(orderId: string): Promise<Quote[]> {
    const response = await fetch(`${this.config.get('CARRIER_API_URL')}/quotes?orderId=${orderId}`);
    return response.json();
  }
}
