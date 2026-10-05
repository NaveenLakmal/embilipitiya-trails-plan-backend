import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Favourite } from './favourite.entity';
import { FavouritesController } from './favourites.controller';

/**
 * FavouritesModule — schema + stub controller only.
 * Full service implementation comes after auth is added.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Favourite])],
  controllers: [FavouritesController],
})
export class FavouritesModule {}
