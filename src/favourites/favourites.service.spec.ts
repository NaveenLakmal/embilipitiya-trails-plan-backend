import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Repository } from 'typeorm';
import { Place } from '../places/place.entity';
import { Favourite } from './favourite.entity';
import { FavouritesService } from './favourites.service';

describe('FavouritesService', () => {
  const insert = {
    insert: vi.fn().mockReturnThis(),
    into: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    onConflict: vi.fn().mockReturnThis(),
    execute: vi.fn(),
  };
  const favouriteRepo = {
    find: vi.fn(),
    delete: vi.fn(),
    createQueryBuilder: vi.fn(() => insert),
  };
  const placeRepo = { findOne: vi.fn() };
  let service: FavouritesService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new FavouritesService(
      favouriteRepo as unknown as Repository<Favourite>,
      placeRepo as unknown as Repository<Place>,
    );
  });

  it('lists only the customer’s saved places in newest-first order', async () => {
    const place = { place_id: 7, name: 'Lake' };
    favouriteRepo.find.mockResolvedValue([{ place }]);
    expect(await service.findAll(42)).toEqual([place]);
    expect(favouriteRepo.find).toHaveBeenCalledWith({
      where: { user_id: 42 },
      relations: ['place'],
      order: { created_at: 'DESC', favourite_id: 'DESC' },
    });
  });

  it('returns an empty array when the customer has no saved places', async () => {
    favouriteRepo.find.mockResolvedValue([]);
    expect(await service.findAll(42)).toEqual([]);
  });

  it('returns the saved place and safely ignores duplicate user/place inserts', async () => {
    const place = { place_id: 7, name: 'Lake' };
    placeRepo.findOne.mockResolvedValue(place);
    insert.execute.mockResolvedValue({ identifiers: [] });
    expect(await service.add(42, 7)).toBe(place);
    expect(insert.values).toHaveBeenCalledWith({ user_id: 42, place_id: 7 });
    expect(insert.onConflict).toHaveBeenCalledWith(
      '("user_id", "place_id") DO NOTHING',
    );
  });

  it('rejects a missing place without creating a favourite', async () => {
    placeRepo.findOne.mockResolvedValue(null);
    await expect(service.add(42, 7)).rejects.toThrow(NotFoundException);
    expect(insert.execute).not.toHaveBeenCalled();
  });

  it('removes only the requesting customer’s favourite and allows repeated deletes', async () => {
    favouriteRepo.delete.mockResolvedValue({ affected: 0 });
    await expect(service.remove(42, 7)).resolves.toBeUndefined();
    expect(favouriteRepo.delete).toHaveBeenCalledWith({
      user_id: 42,
      place_id: 7,
    });
  });

  it.each([0, -1, 1.5, Number.NaN, 2147483648])(
    'rejects invalid place ID %s',
    async (id) => {
      await expect(service.add(42, id)).rejects.toThrow(BadRequestException);
      await expect(service.remove(42, id)).rejects.toThrow(BadRequestException);
      expect(placeRepo.findOne).not.toHaveBeenCalled();
      expect(favouriteRepo.delete).not.toHaveBeenCalled();
    },
  );

  it('propagates database failures instead of claiming the favourite was saved', async () => {
    placeRepo.findOne.mockResolvedValue({ place_id: 7 });
    insert.execute.mockRejectedValue(new Error('Database unavailable'));
    await expect(service.add(42, 7)).rejects.toThrow('Database unavailable');
  });
});
