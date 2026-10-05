import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';

// Entities
import { Category } from './categories/category.entity';
import { Place } from './places/place.entity';
import { User } from './users/user.entity';
import { Favourite } from './favourites/favourite.entity';
import { VisitPlan } from './plan/visit-plan.entity';
import { PlanItem } from './plan/plan-item.entity';
import { Admin } from './admin/admin.entity';

// Feature Modules
import { CategoriesModule } from './categories/categories.module';
import { PlacesModule } from './places/places.module';
import { PlanModule } from './plan/plan.module';
import { FavouritesModule } from './favourites/favourites.module';

@Module({
  imports: [
    // Load .env before anything else
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // TypeORM with PostgreSQL — connection string from env
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        url: configService.get<string>('DATABASE_URL'),
        entities: [Category, Place, User, Favourite, VisitPlan, PlanItem, Admin],
        // synchronize: true creates/updates tables automatically.
        // Safe for development; set to false and use migrations in production.
        synchronize: true,
        ssl:
          configService.get<string>('NODE_ENV') === 'production'
            ? { rejectUnauthorized: false }
            : false,
        logging:
          configService.get<string>('NODE_ENV') === 'development'
            ? ['error', 'warn']
            : false,
      }),
      inject: [ConfigService],
    }),

    CategoriesModule,
    PlacesModule,
    PlanModule,
    FavouritesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
