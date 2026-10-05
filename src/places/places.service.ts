import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { Place } from './place.entity';
import { CreatePlaceDto } from './dto/create-place.dto';
import { UpdatePlaceDto } from './dto/update-place.dto';

@Injectable()
export class PlacesService {
  constructor(
    @InjectRepository(Place)
    private readonly placeRepo: Repository<Place>,
  ) {}

  async findAll(opts: {
    category?: number;
    search?: string;
  }): Promise<Place[]> {
    const where: Record<string, unknown> = {};

    if (opts.category !== undefined) {
      where['category_id'] = opts.category;
    }

    if (opts.search) {
      where['name'] = ILike(`%${opts.search}%`);
    }

    return this.placeRepo.find({
      where: Object.keys(where).length > 0 ? (where as any) : undefined,
      order: { distance_km: 'ASC' },
    });
  }

  async findOne(id: number): Promise<Place> {
    const place = await this.placeRepo.findOne({
      where: { place_id: id },
    });
    if (!place) {
      throw new NotFoundException('Place not found.');
    }
    return place;
  }

  async create(dto: CreatePlaceDto): Promise<Place> {
    this.validateTimes(dto.opening_time, dto.closing_time);

    const photo_urls =
      dto.photo_urls && dto.photo_urls.length > 0
        ? dto.photo_urls
        : dto.photo_url
          ? [dto.photo_url]
          : [];
    const photo_url = photo_urls[0] || dto.photo_url || null;

    const place = this.placeRepo.create({
      ...dto,
      photo_url,
      photo_urls,
    });
    return this.placeRepo.save(place);
  }

  async update(id: number, dto: UpdatePlaceDto): Promise<Place> {
    const place = await this.findOne(id);

    const opening = dto.opening_time ?? place.opening_time;
    const closing = dto.closing_time ?? place.closing_time;
    if (dto.opening_time || dto.closing_time) {
      this.validateTimes(opening, closing);
    }

    Object.assign(place, dto);

    if (dto.photo_urls !== undefined) {
      place.photo_urls = dto.photo_urls;
      place.photo_url = dto.photo_urls[0] || dto.photo_url || null;
    } else if (dto.photo_url !== undefined && (!place.photo_urls || place.photo_urls.length === 0)) {
      place.photo_urls = dto.photo_url ? [dto.photo_url] : [];
    }

    return this.placeRepo.save(place);
  }

  async remove(id: number): Promise<void> {
    const place = await this.findOne(id);
    await this.placeRepo.remove(place);
  }

  private validateTimes(opening: string, closing: string): void {
    if (closing <= opening) {
      throw new BadRequestException(
        'closing_time must be later than opening_time.',
      );
    }
  }
}
