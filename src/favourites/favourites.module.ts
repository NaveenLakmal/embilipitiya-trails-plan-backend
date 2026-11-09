import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Favourite } from './favourite.entity';
import { FavouritesController } from './favourites.controller';
import { FavouritesService } from './favourites.service';
import { Place } from '../places/place.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([Favourite, Place]), AuthModule],
  controllers: [FavouritesController],
  providers: [FavouritesService],
})
export class FavouritesModule {}
