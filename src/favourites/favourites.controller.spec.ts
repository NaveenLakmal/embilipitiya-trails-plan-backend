import { INestApplication, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { Repository } from 'typeorm';
import request from 'supertest';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { User } from '../users/user.entity';
import { FavouritesController } from './favourites.controller';
import { FavouritesService } from './favourites.service';

describe('Favourites HTTP API', () => {
  let app: INestApplication;
  const jwt = new JwtService();
  const secret = 'favourites-test-secret';
  const service = { findAll: vi.fn(), add: vi.fn(), remove: vi.fn() };
  const users = {
    findOne: vi.fn(async ({ where }: { where: { user_id: number } }) => ({
      user_id: where.user_id,
      token_version: 1,
    })),
  };

  function token(
    userId = 42,
    role = 'customer',
    purpose = 'customer_access',
    version = 1,
  ) {
    return jwt.sign(
      { sub: userId, role, purpose, token_version: version },
      { secret },
    );
  }

  beforeAll(async () => {
    const guard = new JwtAuthGuard(
      jwt,
      new ConfigService({ JWT_ACCESS_SECRET: secret }),
      users as unknown as Repository<User>,
    );
    const module = await Test.createTestingModule({
      controllers: [FavouritesController],
      providers: [{ provide: FavouritesService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(guard)
      .compile();
    app = module.createNestApplication();
    await app.listen(0, '127.0.0.1');
  });

  beforeEach(() => vi.clearAllMocks());
  afterAll(async () => {
    await app?.close();
  });

  it.each(['get', 'post', 'delete'] as const)(
    'requires customer authentication for %s',
    async (method) => {
      const path = method === 'get' ? '/favourites' : '/favourites/7';
      await request(app.getHttpServer())[method](path).expect(401);
      expect(service.findAll).not.toHaveBeenCalled();
      expect(service.add).not.toHaveBeenCalled();
      expect(service.remove).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['admin', 'admin_access', 1],
    ['customer', 'customer_password_reset', 1],
    ['customer', 'customer_access', 0],
  ] as const)(
    'rejects inappropriate or revoked tokens: %s / %s / %s',
    async (role, purpose, version) => {
      await request(app.getHttpServer())
        .get('/favourites')
        .set('Authorization', `Bearer ${token(42, role, purpose, version)}`)
        .expect(401);
    },
  );

  it('lists favourites for the authenticated customer', async () => {
    const places = [{ place_id: 7, name: 'Lake' }];
    service.findAll.mockResolvedValue(places);
    await request(app.getHttpServer())
      .get('/favourites')
      .set('Authorization', `Bearer ${token()}`)
      .expect(200, places);
    expect(service.findAll).toHaveBeenCalledWith(42);
  });

  it('takes ownership from the token rather than a supplied user ID', async () => {
    service.add.mockResolvedValue({ place_id: 7 });
    await request(app.getHttpServer())
      .post('/favourites/7?user_id=99')
      .set('Authorization', `Bearer ${token()}`)
      .send({ user_id: 99 })
      .expect(200, { place_id: 7 });
    expect(service.add).toHaveBeenCalledWith(42, 7);
  });

  it('returns a real 404 for missing places', async () => {
    service.add.mockRejectedValueOnce(
      new NotFoundException('Place not found.'),
    );
    await request(app.getHttpServer())
      .post('/favourites/7')
      .set('Authorization', `Bearer ${token()}`)
      .expect(404);
  });

  it('removes only the authenticated customer’s favourite with an empty 204 response', async () => {
    service.remove.mockResolvedValue(undefined);
    const response = await request(app.getHttpServer())
      .delete('/favourites/7?user_id=42')
      .set('Authorization', `Bearer ${token(99)}`)
      .expect(204);
    expect(response.text).toBe('');
    expect(service.remove).toHaveBeenCalledWith(99, 7);
  });

  it.each(['abc', '1.5', '1e2'])(
    'rejects malformed IDs (%s) before calling the service',
    async (id) => {
      await request(app.getHttpServer())
        .post(`/favourites/${id}`)
        .set('Authorization', `Bearer ${token()}`)
        .expect(400);
      await request(app.getHttpServer())
        .delete(`/favourites/${id}`)
        .set('Authorization', `Bearer ${token()}`)
        .expect(400);
      expect(service.add).not.toHaveBeenCalled();
      expect(service.remove).not.toHaveBeenCalled();
    },
  );
});
