import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PlacesModule } from '../src/places/places.module';

describe('PlacesController', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [PlacesModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should return places', async () => {
    const response = await request(app.getHttpServer()).get('/places');
    expect(response.status).toBe(200);
    expect(response.body.length).toBe(2);
  });
});
