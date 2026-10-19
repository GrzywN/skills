import { Inject, Injectable, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { Request } from 'express';

@Injectable({ scope: Scope.REQUEST })
export class RequestLogger {
  constructor(@Inject(REQUEST) private readonly request: Request) {}

  log(message: string) {
    console.log(`[${this.request.headers['x-request-id'] ?? '-'}] ${message}`);
  }
}
