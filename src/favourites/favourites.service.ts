import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Place } from '../places/place.entity';
import { Favourite } from './favourite.entity';

@Injectable()
export class FavouritesService {
  constructor(
    @InjectRepository(Favourite)
    private readonly favouriteRepo: Repository<Favourite>,
    @InjectRepository(Place)
    private readonly placeRepo: Repository<Place>,
  ) {}

  async findAll(userId: number): Promise<Place[]> {
    const favourites = await this.favouriteRepo.find({
      where: { user_id: userId },
      relations: ['place'],
      order: { created_at: 'DESC', favourite_id: 'DESC' },
    });
    return favourites.map((favourite) => favourite.place);
  }

  async add(userId: number, placeId: number): Promise<Place> {
    this.validatePlaceId(placeId);
    const place = await this.placeRepo.findOne({
      where: { place_id: placeId },
    });
    if (!place) {
      throw new NotFoundException('Place not found.');
    }

    // The unique index and ON CONFLICT protect against simultaneous saves
    // from multiple tabs/devices without changing the original save time.
    await this.favouriteRepo
      .createQueryBuilder()
      .insert()
      .into(Favourite)
      .values({ user_id: userId, place_id: placeId })
      .onConflict('("user_id", "place_id") DO NOTHING')
      .execute();
    return place;
  }

  async remove(userId: number, placeId: number): Promise<void> {
    this.validatePlaceId(placeId);
    await this.favouriteRepo.delete({ user_id: userId, place_id: placeId });
  }

  private validatePlaceId(placeId: number): void {
    if (!Number.isInteger(placeId) || placeId < 1 || placeId > 2147483647) {
      throw new BadRequestException(
        'placeId must be a positive 32-bit integer.',
      );
    }
  }
}
